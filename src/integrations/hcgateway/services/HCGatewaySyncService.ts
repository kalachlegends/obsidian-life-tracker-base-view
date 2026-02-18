import type { App, TFile } from 'obsidian'
import type { HCGatewayAPI } from '../api/HCGatewayAPI'
import type { HCGatewayRecord, HCGatewayDataType } from '../types'
import { HCGATEWAY_DATA_TYPES, HCGATEWAY_DATA_TYPE_LABELS } from '../types'
import { log } from '../../../utils'

/**
 * Result from a single data type sync
 */
export interface DataTypeSyncResult {
    dataType: HCGatewayDataType
    label: string
    recordCount: number
    value: unknown
    /** True if no records were found for this date */
    empty: boolean
}

/**
 * Result from a full sync operation
 */
export interface SyncResult {
    success: boolean
    file: TFile
    date: string
    results: DataTypeSyncResult[]
    errors: string[]
    /** Total properties written to frontmatter */
    propertiesWritten: number
}

/**
 * Service for syncing HCGateway health data into note frontmatter.
 * Fetches all enabled data types for a given date and writes aggregated values
 * as frontmatter properties on the current note.
 */
export class HCGatewaySyncService {
    private api: HCGatewayAPI

    constructor(api: HCGatewayAPI) {
        this.api = api
    }

    /**
     * Fetch all enabled data types for a date and write results to a note's frontmatter.
     *
     * @param app Obsidian App instance
     * @param file Target note file
     * @param date ISO date string (YYYY-MM-DD) to fetch data for
     * @param enabledDataTypes Which data types to fetch (empty = all)
     * @param propertyPrefix Frontmatter property prefix (e.g., "health" -> "health_steps")
     */
    async syncToNote(
        app: App,
        file: TFile,
        date: string,
        enabledDataTypes: string[],
        propertyPrefix: string
    ): Promise<SyncResult> {
        const result: SyncResult = {
            success: false,
            file,
            date,
            results: [],
            errors: [],
            propertiesWritten: 0
        }

        // Determine which data types to fetch
        const allDataTypes = Object.keys(HCGATEWAY_DATA_TYPES) as HCGatewayDataType[]
        const dataTypesToFetch =
            enabledDataTypes.length > 0
                ? allDataTypes.filter((dt) => enabledDataTypes.includes(dt))
                : allDataTypes

        // Build date query for the entire day
        const startOfDay = `${date}T00:00:00`
        const endOfDay = `${date}T23:59:59`
        const dateQuery = {
            start: { $gte: startOfDay, $lte: endOfDay }
        }

        // Fetch all data types in parallel
        const fetchPromises = dataTypesToFetch.map(async (dataType) => {
            try {
                const records = await this.api.fetchData(dataType, dateQuery)
                return { dataType, records, error: null }
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error'
                return { dataType, records: [] as HCGatewayRecord[], error: msg }
            }
        })

        const fetchResults = await Promise.all(fetchPromises)

        // Process results and build frontmatter properties
        const frontmatterValues: Record<string, unknown> = {}

        for (const fetchResult of fetchResults) {
            if (fetchResult.error) {
                result.errors.push(
                    `${HCGATEWAY_DATA_TYPE_LABELS[fetchResult.dataType]}: ${fetchResult.error}`
                )
                continue
            }

            const aggregated = this.aggregateRecords(fetchResult.dataType, fetchResult.records)
            const propertyName = this.buildPropertyName(propertyPrefix, fetchResult.dataType)

            const syncResult: DataTypeSyncResult = {
                dataType: fetchResult.dataType,
                label: HCGATEWAY_DATA_TYPE_LABELS[fetchResult.dataType],
                recordCount: fetchResult.records.length,
                value: aggregated,
                empty: fetchResult.records.length === 0
            }

            result.results.push(syncResult)

            // Only write non-empty values to frontmatter
            if (!syncResult.empty && aggregated !== null) {
                frontmatterValues[propertyName] = aggregated
            }
        }

        // Write to frontmatter
        if (Object.keys(frontmatterValues).length > 0) {
            try {
                await app.fileManager.processFrontMatter(file, (frontmatter) => {
                    for (const [key, value] of Object.entries(frontmatterValues)) {
                        frontmatter[key] = value
                    }
                })
                result.propertiesWritten = Object.keys(frontmatterValues).length
                result.success = true
                log(
                    `HCGateway: Wrote ${result.propertiesWritten} properties to ${file.basename}`,
                    'debug'
                )
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error'
                result.errors.push(`Failed to write frontmatter: ${msg}`)
                log(`HCGateway: Failed to write frontmatter to ${file.basename}`, 'error', error)
            }
        } else {
            // No data to write is still a successful sync (just empty)
            result.success = true
            log(`HCGateway: No health data found for ${date}`, 'debug')
        }

        return result
    }

    /**
     * Aggregate records of a specific data type into a single frontmatter value.
     * Different data types require different aggregation strategies.
     */
    private aggregateRecords(dataType: HCGatewayDataType, records: HCGatewayRecord[]): unknown {
        if (records.length === 0) return null

        switch (dataType) {
            // Sum-based metrics (accumulative over the day)
            case 'steps':
            case 'distance':
            case 'elevationGained':
            case 'floorsClimbed':
            case 'activeCaloriesBurned':
            case 'totalCaloriesBurned':
            case 'wheelchairPushes':
                return (
                    this.sumDataField(records, 'count') ??
                    this.sumDataField(records, 'distance') ??
                    this.sumDataField(records, 'elevation') ??
                    this.sumDataField(records, 'floors') ??
                    this.sumDataField(records, 'energy') ??
                    this.sumNumericData(records)
                )

            // Average-based metrics (point-in-time measurements)
            case 'heartRate':
            case 'restingHeartRate':
            case 'respiratoryRate':
            case 'oxygenSaturation':
            case 'bodyTemperature':
            case 'basalBodyTemperature':
            case 'basalMetabolicRate':
            case 'stepsCadence':
            case 'speed':
            case 'power':
                return (
                    this.avgDataField(records, 'bpm') ??
                    this.avgDataField(records, 'rate') ??
                    this.avgDataField(records, 'percentage') ??
                    this.avgDataField(records, 'temperature') ??
                    this.avgDataField(records, 'energy') ??
                    this.avgDataField(records, 'rate') ??
                    this.avgNumericData(records)
                )

            // Latest-value metrics (body measurements)
            case 'weight':
            case 'height':
            case 'bodyFat':
            case 'boneMass':
            case 'leanBodyMass':
            case 'vo2Max':
            case 'bloodGlucose':
                return (
                    this.latestDataField(records, 'weight') ??
                    this.latestDataField(records, 'height') ??
                    this.latestDataField(records, 'percentage') ??
                    this.latestDataField(records, 'mass') ??
                    this.latestDataField(records, 'vo2') ??
                    this.latestDataField(records, 'level') ??
                    this.latestNumericData(records)
                )

            // Blood pressure: special format (systolic/diastolic)
            case 'bloodPressure':
                return this.aggregateBloodPressure(records)

            // Sleep: duration in hours
            case 'sleepSession':
                return this.aggregateSleepSession(records)

            // Exercise sessions: count
            case 'exerciseSession':
                return records.length

            // Hydration: sum volume
            case 'hydration':
                return this.sumDataField(records, 'volume') ?? this.sumNumericData(records)

            // Nutrition: complex object, return count
            case 'nutrition':
                return records.length

            // Reproductive: return latest string/enum value or count
            case 'cervicalMucus':
            case 'menstruationFlow':
            case 'menstruationPeriod':
            case 'ovulationTest':
                return this.latestStringValue(records) ?? records.length

            default:
                return this.sumNumericData(records) ?? records.length
        }
    }

    // ---- Aggregation Helpers ----

    /**
     * Sum a specific numeric field from record data objects.
     */
    private sumDataField(records: HCGatewayRecord[], field: string): number | null {
        let sum = 0
        let found = false

        for (const record of records) {
            const value = record.data[field]
            if (typeof value === 'number') {
                sum += value
                found = true
            }
        }

        return found ? Math.round(sum * 100) / 100 : null
    }

    /**
     * Average a specific numeric field from record data objects.
     */
    private avgDataField(records: HCGatewayRecord[], field: string): number | null {
        let sum = 0
        let count = 0

        for (const record of records) {
            const value = record.data[field]
            if (typeof value === 'number') {
                sum += value
                count++
            }
        }

        return count > 0 ? Math.round((sum / count) * 100) / 100 : null
    }

    /**
     * Get the latest value of a specific field (by record start time).
     */
    private latestDataField(records: HCGatewayRecord[], field: string): number | null {
        // Records are not guaranteed to be sorted; find the latest by start time
        let latest: HCGatewayRecord | null = null

        for (const record of records) {
            if (record.data[field] !== undefined) {
                if (!latest || record.start > latest.start) {
                    latest = record
                }
            }
        }

        if (!latest) return null
        const value = latest.data[field]
        return typeof value === 'number' ? Math.round(value * 100) / 100 : null
    }

    /**
     * Sum the first numeric value found in each record's data.
     */
    private sumNumericData(records: HCGatewayRecord[]): number | null {
        let sum = 0
        let found = false

        for (const record of records) {
            const numericValue = this.findFirstNumericValue(record.data)
            if (numericValue !== null) {
                sum += numericValue
                found = true
            }
        }

        return found ? Math.round(sum * 100) / 100 : null
    }

    /**
     * Average the first numeric value found in each record's data.
     */
    private avgNumericData(records: HCGatewayRecord[]): number | null {
        let sum = 0
        let count = 0

        for (const record of records) {
            const numericValue = this.findFirstNumericValue(record.data)
            if (numericValue !== null) {
                sum += numericValue
                count++
            }
        }

        return count > 0 ? Math.round((sum / count) * 100) / 100 : null
    }

    /**
     * Get the latest first-numeric-value from records.
     */
    private latestNumericData(records: HCGatewayRecord[]): number | null {
        let latest: HCGatewayRecord | null = null

        for (const record of records) {
            if (this.findFirstNumericValue(record.data) !== null) {
                if (!latest || record.start > latest.start) {
                    latest = record
                }
            }
        }

        if (!latest) return null
        const val = this.findFirstNumericValue(latest.data)
        return val !== null ? Math.round(val * 100) / 100 : null
    }

    /**
     * Find the first numeric value in a data object.
     */
    private findFirstNumericValue(data: Record<string, unknown>): number | null {
        for (const value of Object.values(data)) {
            if (typeof value === 'number') return value
        }
        return null
    }

    /**
     * Get the latest string/enum value from records.
     */
    private latestStringValue(records: HCGatewayRecord[]): string | null {
        let latest: HCGatewayRecord | null = null

        for (const record of records) {
            if (!latest || record.start > latest.start) {
                latest = record
            }
        }

        if (!latest) return null

        // Return the first string value found in data
        for (const value of Object.values(latest.data)) {
            if (typeof value === 'string') return value
        }

        return null
    }

    /**
     * Aggregate blood pressure records into "systolic/diastolic" format.
     */
    private aggregateBloodPressure(records: HCGatewayRecord[]): string | null {
        // Find latest record
        let latest: HCGatewayRecord | null = null
        for (const record of records) {
            if (!latest || record.start > latest.start) {
                latest = record
            }
        }

        if (!latest) return null

        const systolic = latest.data['systolic'] ?? latest.data['systolicPressure']
        const diastolic = latest.data['diastolic'] ?? latest.data['diastolicPressure']

        if (typeof systolic === 'number' && typeof diastolic === 'number') {
            return `${Math.round(systolic)}/${Math.round(diastolic)}`
        }

        return null
    }

    /**
     * Aggregate sleep session records into total hours.
     */
    private aggregateSleepSession(records: HCGatewayRecord[]): number | null {
        let totalMinutes = 0
        let found = false

        for (const record of records) {
            if (record.start && record.end) {
                const start = new Date(record.start)
                const end = new Date(record.end)
                const durationMs = end.getTime() - start.getTime()
                if (durationMs > 0) {
                    totalMinutes += durationMs / (1000 * 60)
                    found = true
                }
            }
            // Also check for duration field in data
            const duration = record.data['duration'] ?? record.data['durationMinutes']
            if (typeof duration === 'number' && !found) {
                totalMinutes += duration
                found = true
            }
        }

        // Return hours rounded to 1 decimal
        return found ? Math.round((totalMinutes / 60) * 10) / 10 : null
    }

    /**
     * Build the frontmatter property name from prefix and data type.
     * Example: prefix="health", dataType="heartRate" -> "health_heart_rate"
     */
    private buildPropertyName(prefix: string, dataType: string): string {
        // Convert camelCase to snake_case
        const snakeCase = dataType.replace(/([A-Z])/g, '_$1').toLowerCase()
        const cleanPrefix = prefix.trim()

        if (!cleanPrefix) return snakeCase
        return `${cleanPrefix}_${snakeCase}`
    }
}
