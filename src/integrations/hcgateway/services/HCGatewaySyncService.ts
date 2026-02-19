import type { App, TFile } from 'obsidian'
import type { HCGatewayAPI } from '../api/HCGatewayAPI'
import type { HCGatewayRecord, HCGatewayDataType } from '../types'
import { HCGATEWAY_DATA_TYPES, HCGATEWAY_DATA_TYPE_LABELS } from '../types'
import { log, getTimezoneOffset } from '../../../utils'

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
     * @param timeZone IANA timezone for date boundary queries (e.g., "Asia/Almaty")
     */
    async syncToNote(
        app: App,
        file: TFile,
        date: string,
        enabledDataTypes: string[],
        propertyPrefix: string,
        timeZone: string
    ): Promise<SyncResult> {
        const result: SyncResult = {
            success: false,
            file,
            date,
            results: [],
            errors: [],
            propertiesWritten: 0
        }

        log(
            `[HCGateway Sync] syncToNote: file=${file.basename}, date=${date}, prefix=${propertyPrefix}, enabledDataTypes=[${enabledDataTypes.join(', ') || 'ALL'}]`,
            'debug'
        )

        // Determine which data types to fetch
        const allDataTypes = Object.keys(HCGATEWAY_DATA_TYPES) as HCGatewayDataType[]
        const dataTypesToFetch =
            enabledDataTypes.length > 0
                ? allDataTypes.filter((dt) => enabledDataTypes.includes(dt))
                : allDataTypes

        log(
            `[HCGateway Sync] Will fetch ${dataTypesToFetch.length} data types: [${dataTypesToFetch.join(', ')}]`,
            'debug'
        )

        // Build date queries with timezone offset
        const offset = getTimezoneOffset(date, timeZone)
        log(`[HCGateway Sync] Using timezone "${timeZone}" (offset ${offset})`, 'debug')

        const startOfDay = `${date}T00:00:00${offset}`
        const endOfDay = `${date}T23:59:59${offset}`
        const defaultDateQuery = {
            start: { $gte: startOfDay, $lte: endOfDay }
        }

        // Sleep sessions start the previous evening, so we extend the query
        // to capture sleep that began at 18:00 the day before.
        const prevDate = this.getPreviousDate(date, timeZone)
        const sleepDateQuery = {
            start: { $gte: `${prevDate}T18:00:00${offset}`, $lte: endOfDay }
        }

        log(`[HCGateway Sync] Default date query: ${JSON.stringify(defaultDateQuery)}`, 'debug')
        log(`[HCGateway Sync] Sleep date query: ${JSON.stringify(sleepDateQuery)}`, 'debug')

        // Fetch all data types in parallel
        const fetchPromises = dataTypesToFetch.map(async (dataType) => {
            const query = dataType === 'sleepSession' ? sleepDateQuery : defaultDateQuery
            try {
                const records = await this.api.fetchData(dataType, query)
                return { dataType, records, error: null }
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error'
                log(`[HCGateway Sync] Fetch error for ${dataType}: ${msg}`, 'error')
                return { dataType, records: [] as HCGatewayRecord[], error: msg }
            }
        })

        const fetchResults = await Promise.all(fetchPromises)

        log(
            `[HCGateway Sync] All fetches complete. Results: ${fetchResults.map((r) => `${r.dataType}=${r.records.length}rec${r.error ? '(ERR)' : ''}`).join(', ')}`,
            'debug'
        )

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
                log(
                    `[HCGateway Sync] ${fetchResult.dataType}: ${fetchResult.records.length} records -> ${propertyName}=${JSON.stringify(aggregated)}`,
                    'debug'
                )
            } else if (syncResult.empty) {
                log(`[HCGateway Sync] ${fetchResult.dataType}: 0 records (skipped)`, 'debug')
            } else {
                log(
                    `[HCGateway Sync] ${fetchResult.dataType}: ${fetchResult.records.length} records but aggregated to null (skipped)`,
                    'debug'
                )
            }
        }

        log(
            `[HCGateway Sync] Frontmatter values to write: ${JSON.stringify(frontmatterValues)}`,
            'debug'
        )

        // Write to frontmatter
        if (Object.keys(frontmatterValues).length > 0) {
            log(
                `[HCGateway Sync] Writing ${Object.keys(frontmatterValues).length} properties to ${file.basename}: [${Object.keys(frontmatterValues).join(', ')}]`,
                'debug'
            )
            try {
                await app.fileManager.processFrontMatter(file, (frontmatter) => {
                    for (const [key, value] of Object.entries(frontmatterValues)) {
                        frontmatter[key] = value
                    }
                })
                result.propertiesWritten = Object.keys(frontmatterValues).length
                result.success = true
                log(
                    `[HCGateway Sync] Successfully wrote ${result.propertiesWritten} properties to ${file.basename}`,
                    'debug'
                )
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error'
                result.errors.push(`Failed to write frontmatter: ${msg}`)
                log(
                    `[HCGateway Sync] Failed to write frontmatter to ${file.basename}: ${msg}`,
                    'error',
                    error
                )
            }
        } else {
            // No data to write is still a successful sync (just empty)
            result.success = true
            log(`[HCGateway Sync] No health data found for ${date}, nothing to write`, 'debug')
        }

        log(
            `[HCGateway Sync] syncToNote complete: success=${String(result.success)}, written=${result.propertiesWritten}, errors=${result.errors.length}${result.errors.length > 0 ? ` [${result.errors.join('; ')}]` : ''}`,
            'debug'
        )

        return result
    }

    /**
     * Aggregate records of a specific data type into a single frontmatter value.
     * Different data types require different aggregation strategies.
     *
     * Health Connect data from HCGateway uses nested structures:
     * - Samples arrays: heartRate has {samples: [{beatsPerMinute, time}]}
     * - Nested units: distance has {distance: {inMeters, inKilometers, ...}}
     * - Nested energy: calories have {energy: {inKilocalories, inCalories, ...}}
     *
     * Records are normalized before aggregation to flatten these structures.
     */
    private aggregateRecords(dataType: HCGatewayDataType, records: HCGatewayRecord[]): unknown {
        if (records.length === 0) return null

        // Normalize records to flatten nested Health Connect structures
        const normalized = records.map((r) => ({
            ...r,
            data: this.normalizeRecordData(dataType, r.data)
        }))

        log(
            `[HCGateway Sync] aggregateRecords(${dataType}): ${records.length} records, normalized sample=${JSON.stringify(normalized[0]?.data)}`,
            'debug'
        )

        switch (dataType) {
            // Sum-based metrics (accumulative over the day)
            case 'steps':
            case 'floorsClimbed':
            case 'wheelchairPushes':
                return this.sumDataField(normalized, 'count') ?? this.sumNumericData(normalized)

            case 'distance':
                return this.sumDataField(normalized, 'meters') ?? this.sumNumericData(normalized)

            case 'elevationGained':
                return this.sumDataField(normalized, 'meters') ?? this.sumNumericData(normalized)

            case 'activeCaloriesBurned':
            case 'totalCaloriesBurned':
                return (
                    this.sumDataField(normalized, 'kilocalories') ?? this.sumNumericData(normalized)
                )

            // Average-based metrics (point-in-time measurements)
            case 'heartRate':
            case 'restingHeartRate':
                return (
                    this.avgDataField(normalized, 'beatsPerMinute') ??
                    this.avgDataField(normalized, 'bpm') ??
                    this.avgNumericData(normalized)
                )

            case 'respiratoryRate':
                return this.avgDataField(normalized, 'rate') ?? this.avgNumericData(normalized)

            case 'oxygenSaturation':
                return (
                    this.avgDataField(normalized, 'percentage') ?? this.avgNumericData(normalized)
                )

            case 'bodyTemperature':
            case 'basalBodyTemperature':
                return (
                    this.avgDataField(normalized, 'temperature') ?? this.avgNumericData(normalized)
                )

            case 'basalMetabolicRate':
                return (
                    this.avgDataField(normalized, 'kilocalories') ?? this.avgNumericData(normalized)
                )

            case 'stepsCadence':
                return this.avgDataField(normalized, 'rate') ?? this.avgNumericData(normalized)

            case 'speed':
                return (
                    this.avgDataField(normalized, 'metersPerSecond') ??
                    this.avgNumericData(normalized)
                )

            case 'power':
                return this.avgDataField(normalized, 'watts') ?? this.avgNumericData(normalized)

            // Latest-value metrics (body measurements)
            case 'weight':
                return (
                    this.latestDataField(normalized, 'kilograms') ??
                    this.latestNumericData(normalized)
                )

            case 'height':
                return (
                    this.latestDataField(normalized, 'meters') ?? this.latestNumericData(normalized)
                )

            case 'bodyFat':
                return (
                    this.latestDataField(normalized, 'percentage') ??
                    this.latestNumericData(normalized)
                )

            case 'boneMass':
            case 'leanBodyMass':
                return (
                    this.latestDataField(normalized, 'kilograms') ??
                    this.latestNumericData(normalized)
                )

            case 'vo2Max':
                return this.latestDataField(normalized, 'vo2') ?? this.latestNumericData(normalized)

            case 'bloodGlucose':
                return (
                    this.latestDataField(normalized, 'level') ?? this.latestNumericData(normalized)
                )

            // Blood pressure: special format (systolic/diastolic)
            case 'bloodPressure':
                return this.aggregateBloodPressure(normalized)

            // Sleep: duration in hours
            case 'sleepSession':
                return this.aggregateSleepSession(records)

            // Exercise sessions: count
            case 'exerciseSession':
                return records.length

            // Hydration: sum volume
            case 'hydration':
                return (
                    this.sumDataField(normalized, 'liters') ??
                    this.sumDataField(normalized, 'volume') ??
                    this.sumNumericData(normalized)
                )

            // Nutrition: complex object, return count
            case 'nutrition':
                return records.length

            // Reproductive: return latest string/enum value or count
            case 'cervicalMucus':
            case 'menstruationFlow':
            case 'menstruationPeriod':
            case 'ovulationTest':
                return this.latestStringValue(normalized) ?? records.length

            default:
                return this.sumNumericData(normalized) ?? records.length
        }
    }

    /**
     * Normalize Health Connect record data by flattening nested structures.
     *
     * Health Connect data from HCGateway comes in nested formats:
     * - `{samples: [{beatsPerMinute, time}]}` -> flatten to avg `{beatsPerMinute: N}`
     * - `{distance: {inMeters: N, inKilometers: N}}` -> flatten to `{meters: N}`
     * - `{energy: {inKilocalories: N, inCalories: N}}` -> flatten to `{kilocalories: N}`
     * - `{elevation: {inMeters: N}}` -> flatten to `{meters: N}`
     * - `{weight: {inKilograms: N}}` -> flatten to `{kilograms: N}`
     * - `{height: {inMeters: N}}` -> flatten to `{meters: N}`
     * - `{volume: {inLiters: N}}` -> flatten to `{liters: N}`
     * - `{speed: {inMetersPerSecond: N}}` -> flatten to `{metersPerSecond: N}`
     * - `{power: {inWatts: N}}` -> flatten to `{watts: N}`
     * - `{temperature: {inCelsius: N}}` -> flatten to `{temperature: N}`
     */
    private normalizeRecordData(
        _dataType: HCGatewayDataType,
        data: Record<string, unknown>
    ): Record<string, unknown> {
        const result: Record<string, unknown> = {}

        // Handle samples arrays (heartRate, stepsCadence, speed, etc.)
        if (Array.isArray(data['samples'])) {
            const samples = data['samples'] as Record<string, unknown>[]

            // Average all numeric fields in the samples
            if (samples.length > 0) {
                const numericKeys = new Set<string>()
                for (const sample of samples) {
                    for (const [key, value] of Object.entries(sample)) {
                        if (typeof value === 'number') {
                            numericKeys.add(key)
                        }
                    }
                }

                for (const key of numericKeys) {
                    let sum = 0
                    let count = 0
                    for (const sample of samples) {
                        const value = sample[key]
                        if (typeof value === 'number') {
                            sum += value
                            count++
                        }
                    }
                    if (count > 0) {
                        result[key] = Math.round((sum / count) * 100) / 100
                    }
                }
            }

            return result
        }

        // Handle nested unit objects
        // Distance: {distance: {inMeters, inKilometers, ...}}
        const distanceObj = data['distance']
        if (distanceObj && typeof distanceObj === 'object' && !Array.isArray(distanceObj)) {
            const d = distanceObj as Record<string, unknown>
            result['meters'] = typeof d['inMeters'] === 'number' ? d['inMeters'] : undefined
            result['kilometers'] =
                typeof d['inKilometers'] === 'number' ? d['inKilometers'] : undefined
            return this.cleanResult(result, data)
        }

        // Energy: {energy: {inKilocalories, inCalories, ...}}
        const energyObj = data['energy']
        if (energyObj && typeof energyObj === 'object' && !Array.isArray(energyObj)) {
            const e = energyObj as Record<string, unknown>
            result['kilocalories'] =
                typeof e['inKilocalories'] === 'number' ? e['inKilocalories'] : undefined
            result['calories'] = typeof e['inCalories'] === 'number' ? e['inCalories'] : undefined
            return this.cleanResult(result, data)
        }

        // Elevation: {elevation: {inMeters, ...}}
        const elevationObj = data['elevation']
        if (elevationObj && typeof elevationObj === 'object' && !Array.isArray(elevationObj)) {
            const el = elevationObj as Record<string, unknown>
            result['meters'] = typeof el['inMeters'] === 'number' ? el['inMeters'] : undefined
            return this.cleanResult(result, data)
        }

        // Weight: {weight: {inKilograms, ...}}
        const weightObj = data['weight']
        if (weightObj && typeof weightObj === 'object' && !Array.isArray(weightObj)) {
            const w = weightObj as Record<string, unknown>
            result['kilograms'] =
                typeof w['inKilograms'] === 'number' ? w['inKilograms'] : undefined
            return this.cleanResult(result, data)
        }

        // Height: {height: {inMeters, ...}}
        const heightObj = data['height']
        if (heightObj && typeof heightObj === 'object' && !Array.isArray(heightObj)) {
            const h = heightObj as Record<string, unknown>
            result['meters'] = typeof h['inMeters'] === 'number' ? h['inMeters'] : undefined
            return this.cleanResult(result, data)
        }

        // Volume: {volume: {inLiters, ...}}
        const volumeObj = data['volume']
        if (volumeObj && typeof volumeObj === 'object' && !Array.isArray(volumeObj)) {
            const v = volumeObj as Record<string, unknown>
            result['liters'] = typeof v['inLiters'] === 'number' ? v['inLiters'] : undefined
            return this.cleanResult(result, data)
        }

        // Speed: {speed: {inMetersPerSecond, ...}}
        const speedObj = data['speed']
        if (speedObj && typeof speedObj === 'object' && !Array.isArray(speedObj)) {
            const s = speedObj as Record<string, unknown>
            result['metersPerSecond'] =
                typeof s['inMetersPerSecond'] === 'number' ? s['inMetersPerSecond'] : undefined
            return this.cleanResult(result, data)
        }

        // Power: {power: {inWatts, ...}}
        const powerObj = data['power']
        if (powerObj && typeof powerObj === 'object' && !Array.isArray(powerObj)) {
            const p = powerObj as Record<string, unknown>
            result['watts'] = typeof p['inWatts'] === 'number' ? p['inWatts'] : undefined
            return this.cleanResult(result, data)
        }

        // Temperature: {temperature: {inCelsius, ...}}
        const tempObj = data['temperature']
        if (tempObj && typeof tempObj === 'object' && !Array.isArray(tempObj)) {
            const t = tempObj as Record<string, unknown>
            result['temperature'] = typeof t['inCelsius'] === 'number' ? t['inCelsius'] : undefined
            return this.cleanResult(result, data)
        }

        // Percentage: {percentage: N} — already flat (oxygenSaturation, bodyFat)
        if (typeof data['percentage'] === 'number') {
            return data
        }

        // No nested structure detected, return as-is
        return data
    }

    /**
     * Merge normalized result with any remaining flat fields from original data,
     * filtering out undefined values.
     */
    private cleanResult(
        normalized: Record<string, unknown>,
        original: Record<string, unknown>
    ): Record<string, unknown> {
        const result: Record<string, unknown> = {}

        // Copy flat numeric/string fields from original that weren't nested objects
        for (const [key, value] of Object.entries(original)) {
            if (typeof value === 'number' || typeof value === 'string') {
                result[key] = value
            }
        }

        // Override with normalized values (removing undefined)
        for (const [key, value] of Object.entries(normalized)) {
            if (value !== undefined) {
                result[key] = value
            }
        }

        return result
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

    /**
     * Get the previous date in YYYY-MM-DD format.
     * Used to extend sleep queries into the previous evening.
     */
    private getPreviousDate(dateStr: string, timeZone: string): string {
        const offset = getTimezoneOffset(dateStr, timeZone)
        const d = new Date(dateStr + 'T12:00:00' + offset)
        d.setDate(d.getDate() - 1)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
    }
}
