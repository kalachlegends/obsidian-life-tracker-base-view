import { Notice, type TFile } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { log } from '../../utils'
import {
    appHasDailyNotesPluginLoaded,
    createDailyNote,
    getAllDailyNotes,
    getDailyNote,
    getDailyNoteSettings
} from 'obsidian-daily-notes-interface'

/**
 * Options for findTodaysNote.
 */
interface FindOptions {
    /** If true, don't show a Notice when the note is not found */
    silent?: boolean
}

/**
 * Find today's daily note using obsidian-daily-notes-interface.
 *
 * If the Daily Notes (or Periodic Notes) plugin is loaded, uses its settings
 * (format, folder) to locate today's note. Otherwise falls back to scanning
 * all markdown files matching YYYY-MM-DD in the configured folder.
 *
 * Shows a Notice and returns null if the note is not found.
 */
export function findTodaysNote(plugin: LifeTrackerPlugin, options?: FindOptions): TFile | null {
    const today = window.moment()

    log(`[Today] Looking for today's note: ${today.format('YYYY-MM-DD')}`, 'debug')

    if (appHasDailyNotesPluginLoaded()) {
        // Use the daily-notes-interface to look up today's note.
        // Cast TFile because the package bundles its own obsidian types which
        // are structurally identical at runtime but differ in type identity.
        const allDailyNotes = getAllDailyNotes()
        const todayNote = getDailyNote(today, allDailyNotes) as TFile | null

        if (todayNote) {
            log(`[Today] Found today's note at: ${todayNote.path}`, 'debug')
            return todayNote
        }
    } else {
        // Fallback for vaults without Daily Notes / Periodic Notes plugin
        const folder = plugin.settings.dailyNotesFolder.trim()
        const todayStr = today.format('YYYY-MM-DD')
        const allFiles = plugin.app.vault.getMarkdownFiles()

        const match = allFiles.find((f) => {
            if (f.basename !== todayStr) return false
            if (folder) {
                const fileDir = f.path.substring(0, f.path.lastIndexOf('/'))
                return fileDir === folder || f.path.startsWith(`${folder}/`)
            }
            return true
        })

        if (match) {
            log(`[Today] Found today's note at: ${match.path}`, 'debug')
            return match
        }
    }

    if (!options?.silent) {
        const settings = appHasDailyNotesPluginLoaded() ? getDailyNoteSettings() : null
        const folder = settings?.folder || plugin.settings.dailyNotesFolder.trim()
        const location = folder ? `folder "${folder}"` : 'vault'
        new Notice(`No daily note found for today (${today.format('YYYY-MM-DD')}) in ${location}`)
    }

    log('[Today] Note not found', 'debug')
    return null
}

/**
 * Find today's daily note, or create it if it doesn't exist and
 * autoCreateDailyNote is enabled.
 *
 * Uses obsidian-daily-notes-interface's createDailyNote() which respects
 * the user's Daily Notes / Periodic Notes plugin settings (folder, template,
 * date format) and properly processes template variables.
 */
export async function findOrCreateTodaysNote(plugin: LifeTrackerPlugin): Promise<TFile | null> {
    // Try finding the existing note first (silent -- don't show a Notice yet)
    const existing = findTodaysNote(plugin, { silent: true })
    if (existing) return existing

    // If auto-creation is disabled, show a Notice and bail
    if (!plugin.settings.autoCreateDailyNote) {
        const today = window.moment()
        const settings = appHasDailyNotesPluginLoaded() ? getDailyNoteSettings() : null
        const folder = settings?.folder || plugin.settings.dailyNotesFolder.trim()
        const location = folder ? `folder "${folder}"` : 'vault'
        new Notice(`No daily note found for today (${today.format('YYYY-MM-DD')}) in ${location}`)
        return null
    }

    try {
        // createDailyNote handles folder creation, template resolution, and
        // date format -- all based on the user's Daily Notes plugin settings.
        // Cast for the same reason as above (package bundles its own obsidian types).
        const file = (await createDailyNote(window.moment())) as unknown as TFile
        log(`[Today] Created daily note: ${file.path}`, 'debug')
        new Notice(`Created daily note: ${file.basename}`)
        return file
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error'
        log(`[Today] Failed to create daily note: ${msg}`, 'error')
        new Notice(`Failed to create daily note: ${msg}`)
        return null
    }
}
