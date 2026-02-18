/**
 * HCGateway API type definitions
 */

/** Login / refresh response */
export interface HCGatewayAuthResponse {
    token: string
    refresh: string
    expiry: string
}

/** A single health data record from the API */
export interface HCGatewayRecord {
    _id: string
    id: string
    data: Record<string, unknown>
    start: string
    end: string | null
    app: string
}

/** Error response from the API */
export interface HCGatewayErrorResponse {
    error: string
}

/** Fetch request body */
export interface HCGatewayFetchRequest {
    queries?: Record<string, unknown>
}

/**
 * All available data types in HCGateway.
 * Maps display name -> API route value.
 */
export const HCGATEWAY_DATA_TYPES = {
    // Activity
    steps: 'steps',
    stepsCadence: 'stepsCadence',
    distance: 'distance',
    elevationGained: 'elevationGained',
    floorsClimbed: 'floorsClimbed',
    speed: 'speed',
    power: 'power',
    exerciseSession: 'exerciseSession',
    wheelchairPushes: 'wheelchairPushes',
    // Calories
    activeCaloriesBurned: 'activeCaloriesBurned',
    totalCaloriesBurned: 'totalCaloriesBurned',
    basalMetabolicRate: 'basalMetabolicRate',
    // Heart
    heartRate: 'heartRate',
    restingHeartRate: 'restingHeartRate',
    vo2Max: 'vo2Max',
    // Respiratory
    oxygenSaturation: 'oxygenSaturation',
    respiratoryRate: 'respiratoryRate',
    // Body
    weight: 'weight',
    height: 'height',
    bodyFat: 'bodyFat',
    bodyTemperature: 'bodyTemperature',
    basalBodyTemperature: 'basalBodyTemperature',
    boneMass: 'boneMass',
    leanBodyMass: 'leanBodyMass',
    // Blood
    bloodGlucose: 'bloodGlucose',
    bloodPressure: 'bloodPressure',
    // Nutrition
    nutrition: 'nutrition',
    hydration: 'hydration',
    // Sleep
    sleepSession: 'sleepSession',
    // Reproductive
    cervicalMucus: 'cervicalMucus',
    menstruationFlow: 'menstruationFlow',
    menstruationPeriod: 'menstruationPeriod',
    ovulationTest: 'ovulationTest'
} as const

export type HCGatewayDataType = keyof typeof HCGATEWAY_DATA_TYPES

/**
 * Labels for data types (human-readable)
 */
export const HCGATEWAY_DATA_TYPE_LABELS: Record<HCGatewayDataType, string> = {
    steps: 'Steps',
    stepsCadence: 'Steps cadence',
    distance: 'Distance',
    elevationGained: 'Elevation gained',
    floorsClimbed: 'Floors climbed',
    speed: 'Speed',
    power: 'Power',
    exerciseSession: 'Exercise session',
    wheelchairPushes: 'Wheelchair pushes',
    activeCaloriesBurned: 'Active calories burned',
    totalCaloriesBurned: 'Total calories burned',
    basalMetabolicRate: 'Basal metabolic rate',
    heartRate: 'Heart rate',
    restingHeartRate: 'Resting heart rate',
    vo2Max: 'VO2 max',
    oxygenSaturation: 'Oxygen saturation',
    respiratoryRate: 'Respiratory rate',
    weight: 'Weight',
    height: 'Height',
    bodyFat: 'Body fat',
    bodyTemperature: 'Body temperature',
    basalBodyTemperature: 'Basal body temperature',
    boneMass: 'Bone mass',
    leanBodyMass: 'Lean body mass',
    bloodGlucose: 'Blood glucose',
    bloodPressure: 'Blood pressure',
    nutrition: 'Nutrition',
    hydration: 'Hydration',
    sleepSession: 'Sleep session',
    cervicalMucus: 'Cervical mucus',
    menstruationFlow: 'Menstruation flow',
    menstruationPeriod: 'Menstruation period',
    ovulationTest: 'Ovulation test'
}

/**
 * Data type categories for UI grouping
 */
export const HCGATEWAY_DATA_TYPE_CATEGORIES: Record<string, HCGatewayDataType[]> = {
    Activity: [
        'steps',
        'stepsCadence',
        'distance',
        'elevationGained',
        'floorsClimbed',
        'speed',
        'power',
        'exerciseSession',
        'wheelchairPushes'
    ],
    Calories: ['activeCaloriesBurned', 'totalCaloriesBurned', 'basalMetabolicRate'],
    Heart: ['heartRate', 'restingHeartRate', 'vo2Max'],
    Respiratory: ['oxygenSaturation', 'respiratoryRate'],
    Body: [
        'weight',
        'height',
        'bodyFat',
        'bodyTemperature',
        'basalBodyTemperature',
        'boneMass',
        'leanBodyMass'
    ],
    Blood: ['bloodGlucose', 'bloodPressure'],
    Nutrition: ['nutrition', 'hydration'],
    Sleep: ['sleepSession'],
    Reproductive: ['cervicalMucus', 'menstruationFlow', 'menstruationPeriod', 'ovulationTest']
}
