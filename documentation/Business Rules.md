# Business Rules

This document defines the core business rules. These rules MUST be respected in all implementations unless explicitly approved otherwise.

---

## Documentation Guidelines

When a new business rule is mentioned:

1. Add it to this document immediately
2. Use a concise format (single line or brief paragraph)
3. Maintain precision - do not lose important details for brevity
4. Include rationale where it adds clarity

---

## Date Anchor Resolution

Priority order for resolving an entry's date:

1. Filename pattern (YYYY-MM-DD, YYYY-Www, YYYY-MM, YYYY-Qq)
2. Configured date anchor property
3. File metadata (ctime, mtime)

## Configuration Priority

1. Per-view column config overrides global presets
2. Global presets match by case-insensitive property name
3. Unconfigured properties show selection card

## Visualization Types

- Scale-supporting types: Heatmap, BarChart, LineChart, AreaChart, RadarChart, ScatterChart, BubbleChart
- Non-scale types: PieChart, DoughnutChart, PolarAreaChart, TagCloud, Timeline
- Color scheme-supporting types: Heatmap, BarChart, LineChart, AreaChart, PieChart, DoughnutChart, RadarChart, PolarAreaChart, ScatterChart, BubbleChart, Timeline
- Non-color scheme types: TagCloud

## Maximize State

- Only configured cards (with `data-property-id`) participate in maximize/minimize
- Unconfigured cards are hidden when another card is maximized, but never receive maximize state
- Escape key minimizes the currently maximized card
- Overlay visualizations use their overlay ID as the data-property-id, allowing them to be maximized independently
- Each overlay is treated as an independent visualization for maximize purposes
- When overlays are maximized/minimized, they receive the maximize state but are not re-rendered (overlays use pre-aggregated chart data)

## Property Types in Visualizations

All property types are supported for visualization rendering:

- `note.*` - frontmatter properties from notes (e.g., `note.energy_level`)
- `formula.*` - computed formula columns in Bases (e.g., `formula.weekly_average`)
- `file.*` - file metadata (e.g., `file.ctime`, `file.mtime`, `file.size`)

## Animation and State Transitions

- Ongoing animations must be stopped before maximizing or minimizing a visualization

## Capture Command Dataset

When the "Capture properties" command is invoked from a custom base view (Life Tracker or Life Tracking Grid):

- The file list passed to the capture modal MUST respect the view's configured time frame
- Only files within the selected time frame are included in the batch
- Entries without date anchors are included (not filtered out)
- This ensures users only capture data for the period they're currently viewing

## Release Tags

- Tags MUST NOT have 'v' prefix per Obsidian plugin spec (e.g., `1.0.0` not `v1.0.0`)

## Overlay Charts

- Overlay visualizations require at least 2 properties
- Only cartesian chart types support overlay mode: LineChart, BarChart, AreaChart
- Legends are always shown for overlay charts (to identify each property's line/bar)
- When a property in an overlay is removed from Base, it is automatically removed from the overlay
- If an overlay drops below 2 properties after cleanup, the overlay is deleted entirely
- Overlays are rendered after all individual property visualizations

## Property Removal Cleanup

- When properties are removed from Base, orphaned column configs are automatically cleaned up
- Cleanup runs after each full view re-render (not during incremental updates)
- Both individual property configs and overlay configs are cleaned

## List Property Visualizations

- List properties (arrays of values) are automatically detected and visualized appropriately
- For pie/doughnut/polarArea charts: counts individual value occurrences across all entries (case-insensitive grouping)
- For cartesian charts (line/bar/area/radar): creates one dataset per unique value showing 0/1 presence per time period
- Case-insensitive matching: "Running", "running", "RUNNING" are grouped together
- Display labels use capitalized first letter (e.g., "Running" not "running")
- Legends are always shown when multiple datasets exist (list data, overlays)

## Reference Lines

- Reference lines are only supported for cartesian chart types: LineChart, BarChart, AreaChart
- Reference lines are disabled by default and must be explicitly enabled per property
- For overlay charts, each property can have its own independent reference line
- Reference line colors match the dataset color for visual consistency
- Default label format is "Target: {value}" if no custom label is provided

## TickTick Credential Security

- The TickTick password MUST NEVER be persisted to disk (plugin settings / `data.json`). It is held in memory only during the settings session and used solely to obtain an auth token.
- After a successful login, the password field in settings is explicitly cleared to empty string.
- On plugin load, any previously stored password is cleared from settings as a migration safeguard.
- Only the auth token and inboxId are persisted for session restoration.

## AI Integration

- AI analysis is opt-in: disabled by default, requires explicit enable + API key configuration.
- Supported providers: OpenAI (direct API) and OpenRouter (multi-model gateway). Both use the OpenAI-compatible chat completions API.
- API keys are persisted in plugin settings (user responsibility to secure vault).
- "Analyze after capture" sends all captured field values from the current note to the AI for brief insights. This fires on capture completion (handleDone), not on each field save.
- The "Generate daily summary" command scans vault files for a single day (today or yesterday), filters by tag, computes numeric averages, builds CSV data, and sends everything to the AI. Configured independently (tag, date range, prompt).
- The "Generate weekly summary" command scans vault files, filters by tag and date range, computes numeric averages, builds CSV data, and sends everything to the AI.
- The "Generate monthly summary" command works identically to weekly but uses calendar month boundaries (1st to last day). Configured independently (tag, date range, prompt).
- All summary reports (daily, weekly, monthly) include a dedicated "Undone tasks" section that highlights `tasks_undone`, `sprint_tasks_undone`, `habits_undone`, and their counts when present in note frontmatter.
- Custom system prompts override defaults; empty prompt fields fall back to built-in defaults.
- All AI network calls use Obsidian's `requestUrl` API for CORS-safe requests.
- The daily summary date range defaults to "today". Users can change to "yesterday" in settings.
- The weekly summary date range defaults to "this week" (Monday-Sunday, ISO week). Users can change to "last week" in settings.
- The monthly summary date range defaults to "this month" (1st to last day). Users can change to "last month" in settings.
- Weekly and monthly summary tag filters are case-insensitive, match frontmatter tags without `#` prefix.
- If AI is disabled or unconfigured, capture completes normally without AI analysis.

## AI Report Saving

- The AI analysis modal includes a "Save to note" button that creates a markdown note in the "Life Tracker Reports" folder.
- The folder is auto-created if it does not exist.
- File naming format: `YYYY-MM-DD - {sanitized title}.md`. Re-running for the same period overwrites the existing file.
- The saved note includes a metadata header with generation date, provider, and model info.
- Auto-save to note is enabled by default. When enabled, reports are automatically saved to a note after AI generation (in addition to showing the modal). This can be toggled in Settings → Life Tracker → Integrations → Report saving.

## Thoughts Capture

- Thoughts are stored as a frontmatter list property (configurable name, default: `thoughts`).
- The "Capture thought" command appends to the list; each entry is a string.
- Removing all thoughts clears the property from frontmatter.
- The property name is configured in Settings -> Life Tracker -> Property definitions tab.
