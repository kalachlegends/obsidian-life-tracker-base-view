import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { FrontmatterService } from '../services/frontmatter.service'
import { AIAnalysisModal } from '../components/modals/ai-analysis-modal'
import { log } from '../../utils'

/** Default system prompt for note analysis */
const DEFAULT_NOTE_ANALYSIS_PROMPT = `You are a personal life tracking analyst. The user is sharing their daily tracking data from a single note. Analyze the values provided and give brief, actionable insights.

Guidelines:
- Be concise (3-5 bullet points max)
- Highlight anything that stands out (very high, very low, or unusual values)
- If you notice patterns or correlations between fields, mention them
- Offer one brief, encouraging or practical suggestion
- Use a supportive but direct tone
- Format your response in markdown`

/**
 * Register the "Analyze note" command.
 * Reads all frontmatter from the active file and sends it to the AI for analysis.
 */
export function registerAnalyzeNoteCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'analyze-note',
        name: 'Analyze note with AI',
        callback: () => {
            void executeAnalyzeNote(plugin)
        }
    })
}

async function executeAnalyzeNote(plugin: LifeTrackerPlugin): Promise<void> {
    // Check AI is enabled and configured
    if (!plugin.settings.ai.enabled) {
        new Notice(
            'AI integration is not enabled. Enable it in Settings \u2192 Integrations \u2192 AI.'
        )
        return
    }

    if (!plugin.settings.ai.provider.apiKey) {
        new Notice(
            'AI API key is not configured. Set it in Settings \u2192 Integrations \u2192 AI.'
        )
        return
    }

    const file = plugin.app.workspace.getActiveFile()
    if (!file || file.extension !== 'md') {
        new Notice('Please open a markdown file first')
        return
    }

    log(`[AnalyzeNote] Analyzing ${file.basename}`, 'debug')

    // Read frontmatter
    const frontmatterService = new FrontmatterService(plugin.app)
    const frontmatter = frontmatterService.read(file)

    // Obsidian internal keys to exclude
    const excludedKeys = new Set(['position', 'cssclasses', 'cssclass'])

    const dataLines: string[] = []
    dataLines.push(`Note: ${file.basename}`)
    dataLines.push('')

    let hasData = false
    for (const [key, value] of Object.entries(frontmatter)) {
        if (excludedKeys.has(key)) continue
        if (value === null || value === undefined) continue

        hasData = true
        const valueStr =
            value === '' ? '(not set)' : Array.isArray(value) ? value.join(', ') : String(value)
        dataLines.push(`- ${key}: ${valueStr}`)
    }

    if (!hasData) {
        new Notice('No frontmatter data found in this note to analyze')
        return
    }

    const userMessage = dataLines.join('\n')
    log(`[AnalyzeNote] Data:\n${userMessage}`, 'debug')

    // Use custom prompt or default
    const systemPrompt =
        plugin.settings.ai.captureAnalysisPrompt.trim() || DEFAULT_NOTE_ANALYSIS_PROMPT

    new Notice('Analyzing note with AI...')

    const result = await plugin.aiService.analyze(systemPrompt, userMessage)

    log(
        `[AnalyzeNote] Result: success=${String(result.success)}, length=${result.content.length}`,
        'debug'
    )

    new AIAnalysisModal(plugin, result, `Analysis: ${file.basename}`).open()
}
