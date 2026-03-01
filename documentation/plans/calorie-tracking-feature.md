# AI Calorie Tracking Feature

## Overview

Add AI-powered calorie and nutrition tracking to the Life Tracker plugin. Users can log meals via food images (AI vision analysis) or manual entry. Meal data is stored in daily note frontmatter. When a daily note does not exist, it is auto-created from the user's configured template.

---

## Feature Summary

1. **AI food image analysis** -- Extend `AIService` with vision (multimodal) support. User drops/pastes a food image, AI identifies the food and estimates nutritional info (calories, protein, carbs, fat).
2. **Meal logging in daily notes** -- Store meals as a frontmatter list property (similar to thoughts). Each entry contains: name, calories, protein, carbs, fat, timestamp.
3. **Manual meal entry** -- Modal for manually entering meal nutritional data.
4. **Auto-create daily notes** -- When `today-*` commands can't find today's note, auto-create it using the template configured in Obsidian's core Daily Notes plugin.
5. **Nutrition summary** -- Aggregate daily totals (total calories, protein, carbs, fat) from the meal list and write them as separate frontmatter properties for visualization.

---

## Data Model

### Meal Entry Format

Meals are stored as a YAML list in the daily note frontmatter under a configurable property name (default: `meals`).

```yaml
---
meals:
    - '[08:30] Oatmeal with berries | cal:350 p:12 c:58 f:8'
    - '[12:15] Grilled chicken salad | cal:420 p:35 c:18 f:22'
    - '[19:00] Salmon with rice | cal:580 p:40 c:45 f:20'
nutrition_calories: 1350
nutrition_protein: 87
nutrition_carbs: 121
nutrition_fat: 50
---
```

**Design rationale**: Store meals as a simple string list (same pattern as `thoughts`). This is Obsidian-native -- YAML lists of strings render correctly in frontmatter and are easy to edit manually. The compact format `[HH:mm] Name | cal:N p:N c:N f:N` is both human-readable and parseable.

### Parsed Meal Structure (in-memory)

```typescript
interface MealEntry {
    time: string // "HH:mm"
    name: string // "Grilled chicken salad"
    calories: number // kcal
    protein: number // grams
    carbs: number // grams
    fat: number // grams
}
```

### Aggregated Nutrition Properties

After each meal add/remove, the plugin recalculates and writes these frontmatter properties:

| Property             | Type   | Description                 |
| -------------------- | ------ | --------------------------- |
| `nutrition_calories` | number | Sum of all meal calories    |
| `nutrition_protein`  | number | Sum of all meal protein (g) |
| `nutrition_carbs`    | number | Sum of all meal carbs (g)   |
| `nutrition_fat`      | number | Sum of all meal fat (g)     |

These are regular numeric properties, immediately available for Life Tracker visualization (heatmaps, charts, overlays, etc.) without any special handling.

### Settings Additions

```typescript
// Add to PluginSettings
interface PluginSettings {
    // ... existing fields
    mealsPropertyName: string // Default: 'meals'
    nutritionPropertyPrefix: string // Default: 'nutrition'
    autoCreateDailyNote: boolean // Default: true
    mealAnalysisPrompt: string // Custom system prompt for food image analysis
}
```

---

## Architecture

### New Files

```
src/
  app/
    commands/
      meal-capture-command.ts           # "Log meal" command (active file)
      today-meal-command.ts             # "Today's meal" command (auto-find daily note)
      scan-meals-command.ts             # "Scan food image" command
    components/
      modals/
        meal-modal.ts                   # Meal capture modal (manual + image)
        meal-image-modal.ts             # Image analysis modal (camera/paste/file)
    services/
      meal.service.ts                   # Parse, serialize, aggregate meals
      daily-note-creation.service.ts    # Auto-create daily notes from template
  integrations/
    ai/
      services/
        AIVisionService.ts              # Extend AI with multimodal/vision support
      types/
        ai-vision.types.ts              # Vision-specific types
```

### Modified Files

```
src/integrations/ai/services/AIService.ts  -- Add multimodal message support
src/integrations/ai/types/ai-settings.types.ts  -- Add meal analysis prompt, vision model config
src/app/types/plugin/plugin-settings.intf.ts  -- Add meal/nutrition settings
src/app/commands/index.ts  -- Register new commands
src/app/commands/today-utils.ts  -- Add findOrCreateTodaysNote()
src/app/settings/settings-tab.ts  -- Add meal tracking settings section
src/app/components/modals/thoughts-modal.ts  -- Reference pattern (no changes)
documentation/Business Rules.md  -- Add calorie tracking rules
```

---

## Implementation Plan

### Phase 1: AIService Vision Support

Extend `AIService` to support multimodal (image + text) messages using the same OpenAI-compatible chat completions API.

**Changes to `AIService.ts`:**

1. Update `ChatCompletionRequest.messages[].content` type to accept both string and array-of-parts format:

```typescript
type MessageContent =
    | string
    | Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
      >

interface ChatCompletionMessage {
    role: 'system' | 'user' | 'assistant'
    content: MessageContent
}
```

2. Add a new method `analyzeWithImage()`:

```typescript
async analyzeWithImage(
    systemPrompt: string,
    userMessage: string,
    imageBase64: string,
    mimeType: string
): Promise<AIAnalysisResult>
```

This constructs a multimodal message:

```typescript
messages: [
    { role: 'system', content: systemPrompt },
    {
        role: 'user',
        content: [
            { type: 'text', text: userMessage },
            {
                type: 'image_url',
                image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                    detail: 'low' // Cost-effective for food recognition
                }
            }
        ]
    }
]
```

**Why `detail: 'low'`:** Food recognition doesn't need high-resolution detail. Using `low` reduces token cost significantly (85 tokens per image for GPT-4o) while still being accurate enough for food identification.

**Both OpenAI and OpenRouter support this format** -- the chat completions API is compatible for multimodal content across providers.

**Vision-capable models:** GPT-4o, GPT-4o Mini, GPT-4.1, GPT-4.1 Mini, Claude Sonnet 4, Claude 3.5 Sonnet, Gemini 2.5 Pro all support vision. The user's configured model will be used. If the model doesn't support vision, the API will return an error which the service gracefully handles.

### Phase 2: Meal Service

Create `MealService` to handle parsing, serialization, and aggregation of meal data.

**`meal.service.ts`:**

```typescript
export class MealService {
    /**
     * Parse a stored meal string into a MealEntry.
     * Format: "[HH:mm] Name | cal:N p:N c:N f:N"
     */
    static parse(raw: string): MealEntry | null

    /**
     * Serialize a MealEntry to the storage format.
     */
    static serialize(entry: MealEntry): string

    /**
     * Aggregate all meals into nutrition totals.
     */
    static aggregate(meals: MealEntry[]): NutritionTotals

    /**
     * Parse AI response into a MealEntry.
     * The AI is prompted to return structured data.
     */
    static parseAIResponse(aiContent: string): MealEntry | null
}
```

**Parse regex:** `/^\[(\d{2}:\d{2})\]\s+(.+?)\s*\|\s*cal:(\d+)\s+p:(\d+)\s+c:(\d+)\s+f:(\d+)$/`

**AI response parsing:** The system prompt instructs the AI to return a specific format:

```
FOOD: {name}
CALORIES: {number}
PROTEIN: {number}
CARBS: {number}
FAT: {number}
```

This structured format is easy to parse with simple regex, avoiding the complexity and token overhead of JSON mode or structured outputs.

### Phase 3: Meal Capture Modal

Create `MealModal` -- the main UI for logging meals. Follows the same pattern as `ThoughtsModal`.

**UI Layout:**

```
┌─────────────────────────────────────┐
│  Meals - Wednesday, 2026-02-28      │
│  Storing in: meals                  │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 08:30  Oatmeal with berries     ││
│  │        350 cal | P:12 C:58 F:8  ││
│  │                              [x]││
│  │ 12:15  Grilled chicken salad    ││
│  │        420 cal | P:35 C:18 F:22 ││
│  │                              [x]││
│  └─────────────────────────────────┘│
│                                     │
│  Daily totals: 770 cal              │
│  P: 47g  C: 76g  F: 30g            │
│                                     │
│  ┌───────────┐ ┌──────────────────┐ │
│  │  Manual   │ │  Scan image      │ │
│  └───────────┘ └──────────────────┘ │
└─────────────────────────────────────┘
```

**Manual entry sub-view:**

```
┌─────────────────────────────────────┐
│  Add meal                           │
│                                     │
│  Name:     [________________]       │
│  Calories: [________________]       │
│  Protein:  [________________] g     │
│  Carbs:    [________________] g     │
│  Fat:      [________________] g     │
│                                     │
│         [Cancel]  [Add meal]        │
└─────────────────────────────────────┘
```

**Image analysis sub-view:**

```
┌─────────────────────────────────────┐
│  Scan food image                    │
│                                     │
│  ┌─────────────────────────────────┐│
│  │                                 ││
│  │     Drop image here             ││
│  │     or click to browse          ││
│  │     or paste from clipboard     ││
│  │                                 ││
│  └─────────────────────────────────┘│
│                                     │
│  [Analyzing... spinner]             │
│                                     │
│  ┌─ AI Result ─────────────────────┐│
│  │ Grilled chicken salad           ││
│  │ Calories: 420                   ││
│  │ Protein: 35g  Carbs: 18g       ││
│  │ Fat: 22g                        ││
│  └─────────────────────────────────┘│
│                                     │
│  [Edit values]  [Accept & save]     │
└─────────────────────────────────────┘
```

**Image input methods:**

1. **File picker** -- click the drop zone to open file dialog (`input[type=file]` with `accept="image/*"`)
2. **Drag and drop** -- drag image file onto the drop zone
3. **Clipboard paste** -- Ctrl/Cmd+V to paste a screenshot or copied image

**Reading images from the vault:** If the image is already in the vault (e.g., embedded in a note via `![[image.jpg]]`), use `vault.readBinary(file)` to get the `ArrayBuffer`, then convert to base64 for the AI API.

**Reading images from the filesystem/clipboard:** Use the browser File API (`FileReader.readAsDataURL()`) to convert to base64.

### Phase 4: Auto-Create Daily Notes

Extend `today-utils.ts` with a `findOrCreateTodaysNote()` function that creates the daily note if it doesn't exist.

**Template resolution strategy (read Obsidian core plugin settings):**

```typescript
/**
 * Read the Daily Notes core plugin configuration.
 * These are undocumented internal APIs -- accessed via type casting.
 */
function getDailyNotesConfig(app: App): {
    folder: string
    format: string
    template: string
} | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- undocumented Obsidian internal API
    const internalPlugins = (app as any).internalPlugins
    const dailyNotesPlugin = internalPlugins?.getPluginById?.('daily-notes')

    if (!dailyNotesPlugin?.enabled) return null

    const options = dailyNotesPlugin.instance?.options
    return options
        ? {
              folder: options.folder ?? '',
              format: options.format ?? 'YYYY-MM-DD',
              template: options.template ?? ''
          }
        : null
}
```

**Template application:**

```typescript
async function applyTemplate(app: App, templatePath: string): Promise<string> {
    // Try resolving the template from core Templates plugin folder
    const templatesPlugin = (app as any).internalPlugins?.getPluginById?.('templates')
    const templatesFolder = templatesPlugin?.instance?.options?.folder ?? ''

    // Build full template path
    const fullPath = templatesFolder
        ? normalizePath(`${templatesFolder}/${templatePath}.md`)
        : normalizePath(`${templatePath}.md`)

    const templateFile = app.vault.getAbstractFileByPath(fullPath)
    if (!templateFile || !(templateFile instanceof TFile)) {
        return '' // No template found, create empty note
    }

    let content = await app.vault.read(templateFile)

    // Replace common template variables
    const now = new Date()
    content = content
        .replace(/{{date}}/g, format(now, 'yyyy-MM-dd'))
        .replace(/{{time}}/g, format(now, 'HH:mm'))
        .replace(/{{title}}/g, format(now, 'yyyy-MM-dd'))

    return content
}
```

**`findOrCreateTodaysNote()` function:**

```typescript
export async function findOrCreateTodaysNote(plugin: LifeTrackerPlugin): Promise<TFile | null> {
    // Try finding existing note first
    const existing = findTodaysNote(plugin, { silent: true })
    if (existing) return existing

    if (!plugin.settings.autoCreateDailyNote) {
        new Notice(`No daily note found for today (${formatDateISO(new Date())})`)
        return null
    }

    // Read core Daily Notes plugin config
    const config = getDailyNotesConfig(plugin.app)
    const folder = config?.folder ?? plugin.settings.dailyNotesFolder
    const template = config?.template ?? ''
    const dateFormat = config?.format ?? 'YYYY-MM-DD'

    // Create the filename using the configured date format
    // Note: core Daily Notes uses moment.js format tokens
    const today = new Date()
    const filename = formatMomentStyle(today, dateFormat) // Convert moment format to date-fns
    const filePath = folder
        ? normalizePath(`${folder}/${filename}.md`)
        : normalizePath(`${filename}.md`)

    // Ensure folder exists
    if (folder) {
        await ensureFolderExists(plugin.app.vault, folder)
    }

    // Apply template
    const content = template ? await applyTemplate(plugin.app, template) : ''

    // Create the file
    const file = await plugin.app.vault.create(filePath, content)
    new Notice(`Created daily note: ${filename}`)

    return file
}
```

**Moment.js to date-fns format conversion:** The core Daily Notes plugin uses moment.js format strings (e.g., `YYYY-MM-DD`, `DD-MM-YYYY`). Since this project uses `date-fns`, we need a simple converter for the most common tokens:

```typescript
function formatMomentStyle(date: Date, momentFormat: string): string {
    // Map common moment tokens to date-fns tokens
    const mapped = momentFormat
        .replace(/YYYY/g, 'yyyy')
        .replace(/YY/g, 'yy')
        .replace(/DD/g, 'dd')
        .replace(/Do/g, 'do')
        .replace(/MM/g, 'MM') // Same in both
        .replace(/ddd/g, 'EEE')
        .replace(/dddd/g, 'EEEE')
    return format(date, mapped)
}
```

### Phase 5: Commands

Register three new commands:

| Command ID   | Name            | Description                                                             |
| ------------ | --------------- | ----------------------------------------------------------------------- |
| `log-meal`   | Log meal        | Opens meal modal on the active markdown file                            |
| `today-meal` | Today's meal    | Auto-finds (or creates) today's daily note, opens meal modal            |
| `scan-food`  | Scan food image | Opens image analysis modal directly (shortcut for image-first workflow) |

**`today-meal` uses `findOrCreateTodaysNote()`** -- this is the command that triggers daily note auto-creation.

**Update `today-capture`, `today-daily-capture`, and `today-thought`** to also use `findOrCreateTodaysNote()` instead of `findTodaysNote()` when `autoCreateDailyNote` is enabled.

### Phase 6: Settings UI

Add a new section in the settings tab under "Integrations" or as a new "Nutrition" section:

```
Nutrition tracking
├── Meals property name: [meals]
├── Nutrition property prefix: [nutrition]
├── Auto-create daily note: [toggle, default: on]
├── Custom food analysis prompt: [textarea]
└── (hint: Uses your configured AI provider for image analysis)
```

### Phase 7: Image Handling in Daily Notes

For scanning images already embedded in a daily note (e.g., `![[lunch.jpg]]`):

1. Parse the note content for image embeds: `![[filename.ext]]` or `![alt](path)`
2. For each image embed, resolve the file path via `app.metadataCache.getFirstLinkpathDest()`
3. Read the image binary via `app.vault.readBinary(file)`
4. Convert to base64 and send to AI for analysis
5. If the AI identifies food, prompt the user to confirm/edit the nutritional data
6. Save as a new meal entry

This allows a workflow where the user:

1. Takes a photo of their meal
2. Drops it into their daily note
3. Runs the "Scan food image" command
4. The plugin finds all unprocessed images and analyzes them

---

## AI Food Analysis Prompt

Default system prompt for food image analysis:

```
You are a nutrition analysis assistant. Analyze the food shown in the image and estimate its nutritional content.

Respond in EXACTLY this format (one line per field, no extra text):
FOOD: [name of the food/meal]
CALORIES: [estimated calories in kcal, integer]
PROTEIN: [estimated protein in grams, integer]
CARBS: [estimated carbohydrates in grams, integer]
FAT: [estimated fat in grams, integer]

Guidelines:
- If multiple food items are visible, combine them into one meal estimate
- Use reasonable portion-size assumptions
- If you cannot identify the food, respond with: FOOD: Unknown
- Round all numbers to the nearest integer
- Be conservative in estimates -- slightly underestimate rather than overestimate
```

User message sent alongside the image:

```
Analyze this food image and provide nutritional estimates.
```

---

## Business Rules (to add)

- Meal tracking is opt-in: uses the existing AI provider configuration. No separate API key needed.
- Meals are stored as a frontmatter list property (configurable name, default: `meals`).
- Each meal entry format: `[HH:mm] Name | cal:N p:N c:N f:N`. This format is human-readable and parseable.
- After each meal add/remove, aggregated nutrition properties (`{prefix}_calories`, `{prefix}_protein`, `{prefix}_carbs`, `{prefix}_fat`) are recalculated and written to frontmatter.
- AI food image analysis uses the user's existing AI provider (OpenAI or OpenRouter). The model must support vision (most modern models do).
- Image detail level is set to `low` by default to minimize token costs.
- If the AI cannot identify food in an image, the result shows "Unknown" and the user can manually edit.
- Auto-create daily notes reads the core Daily Notes plugin configuration (folder, template, date format). If the core plugin is not enabled, falls back to Life Tracker's `dailyNotesFolder` setting with `YYYY-MM-DD` format and no template.
- Template variable substitution supports: `{{date}}`, `{{time}}`, `{{title}}`.
- The `autoCreateDailyNote` setting defaults to `true`. When disabled, `today-*` commands show a Notice if no daily note exists (current behavior).
- Nutrition aggregate properties are regular numeric properties that work with all existing Life Tracker visualizations.

---

## Workflow Examples

### Workflow 1: Quick image scan

1. User takes photo of lunch, drops it in today's daily note
2. Runs "Scan food image" command (or "Today's meal")
3. AI analyzes the image, shows: "Grilled chicken salad, 420 cal, P:35 C:18 F:22"
4. User reviews, optionally edits values, clicks "Accept"
5. Meal is added to `meals` list, nutrition totals updated

### Workflow 2: Manual entry

1. User runs "Today's meal" command
2. If no daily note exists, it's auto-created from template
3. Meal modal opens, user clicks "Manual"
4. Enters: "Oatmeal with berries", 350 cal, P:12, C:58, F:8
5. Clicks "Add meal"
6. Meal is added to `meals` list, nutrition totals updated

### Workflow 3: End-of-day review

1. User opens daily note, sees all meals listed in frontmatter
2. Nutrition totals (`nutrition_calories: 1850`) are already computed
3. In Life Tracker view, `nutrition_calories` shows on a line chart over time
4. User can set up a reference line at 2000 cal target
5. Weekly summary includes nutrition trends

---

## Edge Cases

- **Non-food images**: AI returns "Unknown", user gets a Notice and can enter manually
- **Multiple foods in one image**: AI combines into one meal estimate (documented in prompt)
- **No AI configured**: Image scan button is hidden/disabled; manual entry still works
- **Malformed stored entries**: `MealService.parse()` returns `null`; entry is shown as raw text in the list with a warning badge
- **Core Daily Notes plugin not enabled**: Falls back to Life Tracker folder setting + YYYY-MM-DD format
- **Template not found**: Creates note with empty content (just frontmatter placeholder)
- **Concurrent edits**: Uses `processFrontMatter()` (same as existing code) which handles locking

---

## Implementation Order

1. **Phase 1**: AIService vision support (`analyzeWithImage` method)
2. **Phase 2**: MealService (parse, serialize, aggregate)
3. **Phase 3**: MealModal (manual entry first, then image analysis)
4. **Phase 4**: Auto-create daily notes (`findOrCreateTodaysNote`)
5. **Phase 5**: Commands registration
6. **Phase 6**: Settings UI
7. **Phase 7**: Image scanning from embedded note images (enhancement)

Phases 1-2 are independent and can be developed/tested in isolation. Phase 3 depends on both. Phase 4 is independent. Phase 5 ties everything together. Phase 7 is an optional enhancement that can be deferred.

---

## Testing Strategy

- **MealService**: Unit tests for parse/serialize/aggregate (all pure functions)
- **AI Vision**: Integration test with mock `requestUrl` -- verify multimodal message format
- **Daily note creation**: Unit test `getDailyNotesConfig` with mock app, test `formatMomentStyle` conversions
- **Modal**: Manual testing in Obsidian dev vault
