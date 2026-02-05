# TickTick Integration

The Life Tracker plugin now supports integration with TickTick for automatic task data synchronization and analysis.

## Features

- **Automatic Sync**: Import your TickTick tasks into your Obsidian vault
- **Fixed XP Values**: TickTick priorities automatically map to XP (None/Low: 5, Medium: 15, High: 25)
- **Manual Format Support**: Export tasks in the format compatible with your `parseTasks` workflow
- **Real-time Metrics**: Get today's completed tasks count and XP directly in your property definitions

## Setup

### 1. Enable TickTick Integration

1. Open **Settings → Life Tracker → Integrations**
2. Toggle **Enable TickTick integration**
3. Enter your TickTick credentials:
    - **Username**: Your TickTick email address
    - **Password**: Your TickTick password

⚠️ **Security Notice**: Your credentials are sent to `api.ticktick.com` for authentication. They are stored locally in your Obsidian vault settings.

### 2. Test Connection

Click the **Test Connection** button to verify your credentials work. You will see an Obsidian notice with the result.

### 3. Configure Sync Mode

Choose how TickTick data should be synchronized:

- **Manual only**: Sync only when you manually trigger it
- **Auto sync on startup**: Automatically sync when Obsidian starts
- **Via script**: Sync when using `TickTickInput` or `TickTickSync` in Property Definition scripts

## XP Values

XP is automatically assigned based on TickTick task priority:

| Priority | XP Value |
| -------- | -------- |
| None     | 5 XP     |
| Low      | 5 XP     |
| Medium   | 15 XP    |
| High     | 25 XP    |

If a task title already contains `#XXxp`, that value will be used instead.

## Usage

### Using Script Commands

Add these commands to the **Script** field of your Property Definitions:

#### `TickTickInput`

Returns task metrics for quick data entry and automatically adds them to frontmatter:

```typescript
// In Property Definition Script field:
TickTickInput

// Automatically creates these fields in frontmatter:
{
    tasks_completed_today: 5,
    ticktick_xp_today: 47
}
```

**How it works:**

- When you capture a property with `TickTickInput` script, it automatically fetches today's completed tasks count and XP from TickTick
- These values are automatically written to your note's frontmatter
- No manual data entry needed!

#### `TickTickSync`

Syncs all tasks and saves data to frontmatter:

```typescript
// In Property Definition Script field:
TickTickSync

// Automatically creates these fields in frontmatter:
{
    ticktick_data: `# January 7
## Completed
- [x] Review code #15xp <⚒️Work>
- [x] English practice #15xp <💫Personal>
## Uncompleted
- [ ] Plan sprint tasks #5xp <Productivity>`,
    ticktick_tasks_completed: 2,
    ticktick_total_xp: 47
}
```

**How it works:**

- Syncs all your TickTick tasks
- Converts them to your manual format with XP values
- Saves the data to frontmatter fields
- You can then use `ticktick_data` with your existing `parseTasks` function

#### `ticktick:today`

Returns today's completed tasks count:

```typescript
// Returns: 5 (number of completed tasks today)
```

#### `ticktick:week`

Returns this week's statistics:

```typescript
// Returns aggregated metrics for the week
```

### Property Definition Example

Create property definitions to track daily TickTick metrics:

**Example 1: Track Completed Tasks**

1. **Name**: `tasks_completed_today`
2. **Type**: `number`
3. **Script**: `TickTickInput`
4. **Mappings**: Apply to your daily notes

**Example 2: Track TickTick XP**

1. **Name**: `ticktick_xp_today`
2. **Type**: `number`
3. **Script**: `TickTickInput`
4. **Mappings**: Apply to your daily notes

**What happens:**
When you capture either property, both `tasks_completed_today` and `ticktick_xp_today` are automatically populated from TickTick and saved to your note's frontmatter. You don't need to enter any values manually!

## Data Flow

```
TickTick API → Converter → Manual Format → parseTasks() → Unified Metrics
     ↓              ↓            ↓              ↓              ↓
  Задачи ТТ    Маппинг XP   Ваш формат   Существующая    Итоговые
  Проекты ТТ   Проекты      с тегами     логика         метрики
```

## Troubleshooting

### Connection Test Fails

1. Verify your username and password are correct
2. Check your internet connection
3. Ensure TickTick API is accessible
4. Check the Obsidian notice for error details

### Tasks Not Syncing

1. Check **Sync mode** is set correctly
2. Verify **Enable TickTick integration** is toggled on
3. Check the Obsidian console for error messages (Ctrl+Shift+I)

### Wrong XP Values

1. XP values are fixed based on priority (see XP Values table above)
2. Tasks with existing `#XXxp` in the title will use that value instead

## Privacy & Security

- **Data Storage**: Your credentials are stored in Obsidian's plugin settings (local only)
- **Network Requests**: Data is only sent to `api.ticktick.com` (TickTick's official API)
- **No Telemetry**: No data is sent to any other servers
- **Opt-in**: TickTick integration is disabled by default

## API Reference

The integration uses TickTick API v2 with the following features:

- Authentication via username/password
- Incremental synchronization using checkpoints
- Batch operations for task updates
- Full project and task data retrieval

For technical details, see the source code in `src/integrations/ticktick/`.
