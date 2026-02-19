import { Notice } from 'obsidian'
import type { LifeTrackerPlugin } from '../plugin'
import { log } from '../../utils'

/**
 * Register the "Sync HCGateway" command.
 * Fetches Health Connect data for the active file's date and writes it to frontmatter.
 * Performs a fresh login on every invocation.
 */
export function registerSyncHCGatewayCommand(plugin: LifeTrackerPlugin): void {
    plugin.addCommand({
        id: 'sync-hcgateway',
        name: 'Sync Health Connect data',
        callback: () => {
            void executeSyncHCGateway(plugin)
        }
    })
}

async function executeSyncHCGateway(plugin: LifeTrackerPlugin): Promise<void> {
    // Check integration is enabled and credentials are set
    if (!plugin.settings.hcgateway.enabled) {
        new Notice(
            'HCGateway integration is not enabled. Enable it in Settings \u2192 Integrations.'
        )
        return
    }

    const { username, password, baseUrl, enabledDataTypes, propertyPrefix, timeZone } =
        plugin.settings.hcgateway

    if (!username || !password) {
        new Notice(
            'HCGateway credentials not set. Configure them in Settings \u2192 Integrations \u2192 Health Connect.'
        )
        return
    }

    const file = plugin.app.workspace.getActiveFile()
    if (!file || file.extension !== 'md') {
        new Notice('Please open a markdown file first')
        return
    }

    log(`[SyncHCGateway] Fetching health data for ${file.basename}`, 'debug')
    new Notice('Fetching health data...')

    try {
        const { parseDateFromFilename } = await import('../../utils/date.utils')
        const { HCGatewaySyncService } =
            await import('../../integrations/hcgateway/services/HCGatewaySyncService')
        const { HCGatewayAPI } = await import('../../integrations/hcgateway/api/HCGatewayAPI')

        const parsed = parseDateFromFilename(file.basename)
        if (!parsed) {
            new Notice(
                `Cannot parse date from "${file.basename}" \u2014 HCGateway sync requires a date-based filename`
            )
            return
        }

        // Format as YYYY-MM-DD
        const year = parsed.date.getFullYear()
        const month = String(parsed.date.getMonth() + 1).padStart(2, '0')
        const day = String(parsed.date.getDate()).padStart(2, '0')
        const dateStr = `${year}-${month}-${day}`

        log(
            `[SyncHCGateway] Date: ${dateStr}, baseUrl=${baseUrl}, prefix=${propertyPrefix}, timeZone=${timeZone}`,
            'debug'
        )

        // Fresh login
        const api = new HCGatewayAPI(baseUrl)
        try {
            await api.login(username, password)
        } catch (loginError) {
            const msg = loginError instanceof Error ? loginError.message : String(loginError)
            log(`[SyncHCGateway] Login failed: ${msg}`, 'error')
            new Notice(`HCGateway login failed: ${msg}`)
            return
        }

        log('[SyncHCGateway] Login successful, starting sync', 'debug')

        const syncService = new HCGatewaySyncService(api)
        const result = await syncService.syncToNote(
            plugin.app,
            file,
            dateStr,
            enabledDataTypes,
            propertyPrefix,
            timeZone
        )

        log(
            `[SyncHCGateway] Result: success=${String(result.success)}, properties=${result.propertiesWritten}, errors=${result.errors.length}`,
            'debug'
        )

        if (result.errors.length > 0) {
            for (const err of result.errors) {
                new Notice(`HCGateway error: ${err}`)
            }
        }

        if (result.success && result.propertiesWritten > 0) {
            const nonEmpty = result.results.filter((r) => !r.empty)
            new Notice(
                `Health data saved: ${result.propertiesWritten} properties (${nonEmpty.length} data types)`
            )
        } else if (result.propertiesWritten === 0 && result.errors.length === 0) {
            new Notice(`HCGateway: no health data found for ${dateStr}`)
        }
    } catch (error) {
        log(`[SyncHCGateway] Error: ${String(error)}`, 'error')
        console.error('[SyncHCGateway] Error:', error)
        new Notice(`HCGateway error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}
