import { FuzzySuggestModal, type FuzzyMatch, type TFile } from 'obsidian'
import type { LifeTrackerPlugin } from '../../plugin'
import {
    appHasDailyNotesPluginLoaded,
    createDailyNote,
    getAllDailyNotes,
    getDateFromFile
} from 'obsidian-daily-notes-interface'
import { formatFileTitleWithWeekday } from '../../../utils'

/** Sentinel value representing the "create today's note" option */
const CREATE_TODAY_SENTINEL = '__create_today__'

interface DailyNoteItem {
    /** The TFile, or null for the "create today" sentinel */
    file: TFile | null
    /** Display label */
    label: string
    /** Sort key (ISO date string or '0000' for sentinel at top) */
    sortKey: string
}

/**
 * Fuzzy suggest modal that lists all daily notes in the vault (most recent
 * first). If today's note does not exist and autoCreateDailyNote is enabled,
 * a "Create today's note" option is shown at the top.
 */
export class DailyNoteSuggestModal extends FuzzySuggestModal<DailyNoteItem> {
    private plugin: LifeTrackerPlugin
    private items: DailyNoteItem[] = []
    private onChoose: (file: TFile) => void

    constructor(plugin: LifeTrackerPlugin, onChoose: (file: TFile) => void) {
        super(plugin.app)
        this.plugin = plugin
        this.onChoose = onChoose
        this.setPlaceholder('Pick a daily note...')
        this.buildItems()
    }

    private buildItems(): void {
        const items: DailyNoteItem[] = []
        const todayStr = window.moment().format('YYYY-MM-DD')

        if (appHasDailyNotesPluginLoaded()) {
            const allNotes = getAllDailyNotes()
            let todayExists = false

            for (const [, file] of Object.entries(allNotes)) {
                // Cast because package bundles its own obsidian types
                const tfile = file as unknown as TFile
                const date = getDateFromFile(tfile as Parameters<typeof getDateFromFile>[0], 'day')
                const dateStr = date ? date.format('YYYY-MM-DD') : tfile.basename

                if (dateStr === todayStr) {
                    todayExists = true
                }

                items.push({
                    file: tfile,
                    label: formatFileTitleWithWeekday(tfile.basename),
                    sortKey: dateStr
                })
            }

            // If today's note doesn't exist and auto-create is enabled, add sentinel
            if (!todayExists && this.plugin.settings.autoCreateDailyNote) {
                items.push({
                    file: null,
                    label: `+ Create today's note (${todayStr})`,
                    sortKey: CREATE_TODAY_SENTINEL
                })
            }
        } else {
            // Fallback: scan markdown files matching YYYY-MM-DD
            const folder = this.plugin.settings.dailyNotesFolder.trim()
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/

            for (const file of this.app.vault.getMarkdownFiles()) {
                if (!dateRegex.test(file.basename)) continue
                if (folder) {
                    const fileDir = file.path.substring(0, file.path.lastIndexOf('/'))
                    if (fileDir !== folder && !file.path.startsWith(`${folder}/`)) continue
                }

                items.push({
                    file,
                    label: formatFileTitleWithWeekday(file.basename),
                    sortKey: file.basename
                })
            }

            // Check if today exists
            const todayExists = items.some((i) => i.sortKey === todayStr)
            if (!todayExists && this.plugin.settings.autoCreateDailyNote) {
                items.push({
                    file: null,
                    label: `+ Create today's note (${todayStr})`,
                    sortKey: CREATE_TODAY_SENTINEL
                })
            }
        }

        // Sort: sentinel at top, then by date descending
        items.sort((a, b) => {
            if (a.sortKey === CREATE_TODAY_SENTINEL) return -1
            if (b.sortKey === CREATE_TODAY_SENTINEL) return 1
            return b.sortKey.localeCompare(a.sortKey)
        })

        this.items = items
    }

    override getItems(): DailyNoteItem[] {
        return this.items
    }

    override getItemText(item: DailyNoteItem): string {
        return item.label
    }

    override onChooseItem(item: DailyNoteItem, _evt: MouseEvent | KeyboardEvent): void {
        if (item.file) {
            this.onChoose(item.file)
        } else {
            // Create today's note
            void createDailyNote(window.moment()).then((created) => {
                // Cast for the same reason as in today-utils
                this.onChoose(created as unknown as TFile)
            })
        }
    }

    /**
     * Custom rendering to highlight today's note and the create sentinel.
     */
    override renderSuggestion(match: FuzzyMatch<DailyNoteItem>, el: HTMLElement): void {
        super.renderSuggestion(match, el)

        const todayStr = window.moment().format('YYYY-MM-DD')

        if (match.item.sortKey === CREATE_TODAY_SENTINEL) {
            el.addClass('lt-suggest-create')
        } else if (match.item.sortKey === todayStr) {
            el.addClass('lt-suggest-today')
        }
    }
}
