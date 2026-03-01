# Architecture

## Overview

Obsidian plugin providing a custom Base View ("Life Tracker") for visualizing tracked data.

## Directory Structure

```
src/
  main.ts                    # Re-export only
  app/
    plugin.ts                # Plugin lifecycle, settings management, view registration
    settings/
      settings-tab.ts        # Plugin settings UI
    types/
      plugin-settings.intf.ts      # PluginSettings, PropertyVisualizationPreset
      property-definition.types.ts # PropertyDefinition, PropertyType, NumberConstraint
      column-config.types.ts       # ColumnVisualizationConfig, ScaleConfig
      visualization-type.intf.ts   # VisualizationType enum
      time-granularity.intf.ts     # TimeGranularity enum
      visualization-options.intf.ts # UI options for menus/cards
      visualization.types.ts       # Data structures for visualizations
      date-anchor.types.ts         # Date anchor types
    commands/
      index.ts                     # Command registration
      capture-command.ts           # Property capture command (carousel)
      daily-capture-command.ts     # Daily capture command (all fields)
      thought-capture-command.ts   # Thought capture command
      meal-capture-command.ts      # Log meal command (active file)
      today-capture-command.ts     # Today's capture (auto-finds today's note)
      today-daily-capture-command.ts # Today's daily capture - all fields (auto-finds today's note)
      today-thought-command.ts     # Today's thought (auto-finds today's note)
      today-meal-command.ts        # Today's meal (auto-finds/creates today's note)
      scan-food-command.ts         # Scan food image with AI
      today-utils.ts               # Shared utility to find/create today's daily note
      sync-ticktick-command.ts     # Standalone TickTick sync for active file
      sync-hcgateway-command.ts    # Standalone HCGateway sync for active file
      analyze-note-command.ts      # AI analysis of active file's frontmatter
    services/
      date-anchor.service.ts       # Extract dates from entries (filename, properties)
      data-aggregation.service.ts  # Aggregate data for visualizations
      frontmatter.service.ts       # Read/write frontmatter properties
      meal.service.ts              # Parse, serialize, aggregate meal/nutrition data
      daily-note-creation.service.ts # Auto-create daily notes from template
      daily-note-format.utils.ts   # Moment.js to date-fns format conversion
      chart-aggregation.utils.ts   # Chart-specific aggregation
      date-grouping.utils.ts       # Time period grouping
    view/
      life-tracker-view.ts         # Main BasesView (visualizations)
      table-view/
        table-view.ts              # Table BasesView (spreadsheet editing)
        table-view-options.ts      # Table view options
      grid-view/
        grid-view.ts               # Grid BasesView (card editing)
        grid-view-options.ts       # Grid view options
      view-options.ts              # Life tracker view options
      column-config.service.ts     # Per-column config management
      maximize-state.service.ts    # Card maximize/minimize state
      visualization-config.helper.ts # Build visualization configs
    components/
      ui/
        card-context-menu.ts       # Right-click menu
        column-config-card.ts      # Unconfigured property card
        grid-controls.ts           # Column/height controls
        empty-state.ts             # No data states
        tooltip.ts                 # Shared tooltip
      editing/
        property-editor.ts         # Property editor factory
        text-editor.ts             # Text/dropdown editor
        number-editor.ts           # Number/slider editor
        boolean-editor.ts          # Toggle/checkbox editor
        date-editor.ts             # Date/datetime editor
        list-editor.ts             # Pill/chip list editor
        validation.utils.ts        # Validation functions
        dirty-state.service.ts     # Track unsaved changes
      modals/
         property-capture-modal.ts  # Carousel-style capture modal (one field at a time)
        daily-note-modal.ts        # Form-style modal (all fields at once)
        thoughts-modal.ts          # Quick thought capture modal
        meal-modal.ts              # Meal capture modal (manual + AI image analysis)
        daily-note-suggest-modal.ts # FuzzySuggestModal for picking a daily note
      visualizations/
        base-visualization.ts      # Abstract base class
        heatmap/                   # GitHub-style heatmap
        chart/                     # Chart.js wrapper (line, bar, area, pie, etc.)
        tag-cloud/                 # Frequency-sized tags
        timeline/                  # Date distribution
  utils/
    date-utils.ts            # Date parsing, formatting
    color-utils.ts           # Heatmap color scales
    value-extractors.ts      # Extract values from Obsidian Value types
    log.ts                   # Debug logging
  styles.src.css             # Tailwind source (compiled to styles.css)
  integrations/
    ai/
      types/
        ai-settings.types.ts   # AI provider, settings, result types
        index.ts               # Type re-exports
      services/
        AIService.ts           # OpenAI/OpenRouter compatible HTTP client
        index.ts               # Service re-exports
      index.ts                 # Integration re-exports
    ticktick/                  # TickTick task sync integration
```

## Key Components

### Plugin (`plugin.ts`)

- Registers BasesViews: life-tracker, life-tracker-grid
- Manages immutable settings with immer
- Notifies views on settings changes
- Registers commands (capture, weekly summary)
- Initializes integration services (TickTick, AI)

### Base Views

#### LifeTrackerView (`view/life-tracker-view.ts`)

- Extends `BasesView`
- Renders grid of visualization cards
- Delegates to services for data processing
- Creates visualization instances per property

#### TableView (`view/table-view/table-view.ts`)

- Spreadsheet-style editing interface
- One row per note, one column per property definition
- Inline editors for all property types
- Per-row Save/Reset buttons (disabled when clean)
- Highlights rows with missing/invalid values

#### GridView (`view/grid-view/grid-view.ts`)

- Card-based editing interface
- One card per note with all property fields
- Full-size editors (not compact)
- Per-card Save/Reset buttons
- Visual indicators for dirty/invalid state

### Property Editors

Factory pattern (`property-editor.ts`) creates type-specific editors:

- **TextEditor**: Plain input or dropdown if `allowedValues` defined
- **NumberEditor**: Number input with optional slider for ranges
- **BooleanEditor**: Toggle switch or compact checkbox
- **DateEditor**: Native date/datetime-local picker
- **ListEditor**: Pill/chip interface with autocomplete suggestions

All editors:

- Validate input against property definitions
- Report changes via `onChange` callback
- Support compact mode for table cells

### Services

- **DateAnchorService**: Resolves date for each entry (filename pattern > property > file metadata)
- **DataAggregationService**: Groups data by time granularity, produces visualization-ready structures
- **FrontmatterService**: Read/write frontmatter, validate against property definitions
- **ColumnConfigService**: Manages per-property visualization configs (persisted in view config)
- **MaximizeStateService**: Handles card maximize/minimize state, escape key handler
- **AIService**: OpenAI/OpenRouter compatible chat completions client for data analysis (supports vision/multimodal)
- **MealService**: Parse, serialize, and aggregate meal entries with nutritional data
- **DailyNoteCreationService**: Auto-create daily notes using core Daily Notes plugin template settings

### Commands

- **Capture properties** (`capture-properties`): Carousel-style property capture with batch mode
- **Daily capture** (`daily-capture`): Form-style modal showing all fields at once for the active note
- **Capture thought** (`capture-thought`): Dedicated modal for quick thought capture, stores as list in frontmatter
- **Today's capture** (`today-capture`): Auto-finds today's daily note in the configured folder, opens property capture carousel
- **Today's daily capture** (`today-daily-capture`): Auto-finds today's daily note, opens form-style modal with all fields at once
- **Today's thought** (`today-thought`): Auto-finds today's daily note in the configured folder, opens thought capture modal
- **Log meal** (`log-meal`): Opens meal capture modal on the active file (manual entry + AI image analysis)
- **Today's meal** (`today-meal`): Auto-finds/creates today's daily note, opens meal capture modal
- **Scan food image** (`scan-food`): Opens meal modal for AI-powered food image analysis
- **Sync TickTick data** (`sync-ticktick`): Fetches TickTick data for the active file's date and writes to frontmatter
- **Sync Health Connect data** (`sync-hcgateway`): Fetches HCGateway health data for the active file's date and writes to frontmatter
- **Analyze note with AI** (`analyze-note`): Reads frontmatter from the active file and sends to AI for analysis
- **Generate weekly summary** (`weekly-summary`): Collects weekly data by tag/date range, computes averages, generates CSV, sends to AI for analysis

### Visualizations

All extend `BaseVisualization`:

- `HeatmapVisualization`: GitHub contribution-style grid
- `ChartVisualization`: Chart.js wrapper for 9 chart types
- `TagCloudVisualization`: Frequency-weighted tags
- `TimelineVisualization`: Horizontal date distribution

## Data Flow

```
BasesEntry[] → DateAnchorService → DataAggregationService → Visualization.render()
```

1. Entries from Obsidian Bases API
2. Date anchors resolved per entry
3. Data aggregated by granularity
4. Visualization renders to DOM
