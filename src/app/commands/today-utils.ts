import { Notice, normalizePath, type TFile } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { formatDateISO, log } from '../../utils'

/**
 * Find today's daily note in the configured folder.
 * Searches for a markdown file whose basename matches today's date (YYYY-MM-DD)
 * within the folder specified in settings (or vault root if empty).
 *
 * Shows a Notice and returns null if the note is not found.
 */
export function findTodaysNote(plugin: LifeTrackerPlugin): TFile | null {
    const todayStr = formatDateISO(new Date())
    const folder = plugin.settings.dailyNotesFolder.trim()

    log(`[Today] Looking for today's note: ${todayStr}, folder setting: "${folder}"`, 'debug')

    // Try direct path lookup first (fastest)
    if (folder) {
        const expectedPath = normalizePath(`${folder}/${todayStr}.md`)
        const file = plugin.app.vault.getFileByPath(expectedPath)
        if (file) {
            log(`[Today] Found today's note at: ${file.path}`, 'debug')
            return file
        }
        log(`[Today] Direct lookup failed for: ${expectedPath}`, 'debug')
    }

    // Fallback: scan all markdown files
    const allFiles = plugin.app.vault.getMarkdownFiles()

    const todayFile = allFiles.find((f) => {
        if (f.basename !== todayStr) return false

        // If a folder is configured, check the file is inside it
        if (folder) {
            const normalizedFolder = normalizePath(folder)
            const fileDir = f.path.substring(0, f.path.lastIndexOf('/'))
            return fileDir === normalizedFolder || f.path.startsWith(`${normalizedFolder}/`)
        }

        return true
    })

    if (!todayFile) {
        const location = folder ? `folder "${folder}"` : 'vault'
        new Notice(`No daily note found for today (${todayStr}) in ${location}`)
        log(`[Today] Note not found. Searched ${allFiles.length} files in ${location}`, 'debug')
        return null
    }

    log(`[Today] Found today's note at: ${todayFile.path}`, 'debug')
    return todayFile
}
