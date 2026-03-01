/**
 * Represents a parsed meal entry with nutritional data.
 */
export interface MealEntry {
    /** Time of the meal in HH:mm format */
    time: string
    /** Name/description of the meal */
    name: string
    /** Calories in kcal */
    calories: number
    /** Protein in grams */
    protein: number
    /** Carbohydrates in grams */
    carbs: number
    /** Fat in grams */
    fat: number
}

/**
 * Aggregated nutrition totals for a day.
 */
export interface NutritionTotals {
    calories: number
    protein: number
    carbs: number
    fat: number
}

/**
 * Regex for parsing stored meal strings.
 * Format: "[HH:mm] Name | cal:N p:N c:N f:N"
 */
const MEAL_REGEX = /^\[(\d{2}:\d{2})]\s+(.+?)\s*\|\s*cal:(\d+)\s+p:(\d+)\s+c:(\d+)\s+f:(\d+)$/

/**
 * Regex for parsing AI response lines.
 * Each line: "KEY: value"
 */
const AI_FOOD_REGEX = /^FOOD:\s*(.+)$/m
const AI_CALORIES_REGEX = /^CALORIES:\s*(\d+)/m
const AI_PROTEIN_REGEX = /^PROTEIN:\s*(\d+)/m
const AI_CARBS_REGEX = /^CARBS:\s*(\d+)/m
const AI_FAT_REGEX = /^FAT:\s*(\d+)/m

/**
 * Default system prompt for AI food image analysis.
 */
export const DEFAULT_MEAL_ANALYSIS_PROMPT = `You are a nutrition analysis assistant. Analyze the food shown in the image and estimate its nutritional content.

Respond in EXACTLY this format (one line per field, no extra text):
FOOD: [name of the food/meal]
CALORIES: [estimated calories in kcal, integer]
PROTEIN: [estimated protein in grams, integer]
CARBS: [estimated carbohydrates in grams, integer]
FAT: [estimated fat in grams, integer]

Guidelines:
- If multiple food items are visible, combine them into one meal estimate
- Use reasonable portion-size assumptions
- If you cannot identify the food, respond with: FOOD: Unknown
- Round all numbers to the nearest integer
- Be conservative in estimates`

/**
 * Service for parsing, serializing, and aggregating meal data.
 * Meals are stored as simple strings in frontmatter lists,
 * following the same pattern as thoughts.
 */
export class MealService {
    /**
     * Parse a stored meal string into a MealEntry.
     * Returns null if the string doesn't match the expected format.
     *
     * Format: "[HH:mm] Name | cal:N p:N c:N f:N"
     */
    static parse(raw: string): MealEntry | null {
        const match = MEAL_REGEX.exec(raw.trim())
        if (!match) return null

        const time = match[1]
        const name = match[2]
        const calories = match[3]
        const protein = match[4]
        const carbs = match[5]
        const fat = match[6]

        if (!time || !name || !calories || !protein || !carbs || !fat) return null

        return {
            time,
            name: name.trim(),
            calories: parseInt(calories, 10),
            protein: parseInt(protein, 10),
            carbs: parseInt(carbs, 10),
            fat: parseInt(fat, 10)
        }
    }

    /**
     * Serialize a MealEntry to the storage format string.
     */
    static serialize(entry: MealEntry): string {
        return `[${entry.time}] ${entry.name} | cal:${entry.calories} p:${entry.protein} c:${entry.carbs} f:${entry.fat}`
    }

    /**
     * Aggregate all meals into nutrition totals.
     */
    static aggregate(meals: MealEntry[]): NutritionTotals {
        return meals.reduce(
            (acc, meal) => ({
                calories: acc.calories + meal.calories,
                protein: acc.protein + meal.protein,
                carbs: acc.carbs + meal.carbs,
                fat: acc.fat + meal.fat
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
        )
    }

    /**
     * Parse AI response text into a MealEntry.
     * Expects the structured format from the default prompt.
     * Returns null if parsing fails.
     */
    static parseAIResponse(aiContent: string): MealEntry | null {
        const foodMatch = AI_FOOD_REGEX.exec(aiContent)
        const caloriesMatch = AI_CALORIES_REGEX.exec(aiContent)
        const proteinMatch = AI_PROTEIN_REGEX.exec(aiContent)
        const carbsMatch = AI_CARBS_REGEX.exec(aiContent)
        const fatMatch = AI_FAT_REGEX.exec(aiContent)

        const foodName = foodMatch?.[1]?.trim()
        const caloriesStr = caloriesMatch?.[1]
        const proteinStr = proteinMatch?.[1]
        const carbsStr = carbsMatch?.[1]
        const fatStr = fatMatch?.[1]

        if (!foodName || !caloriesStr || !proteinStr || !carbsStr || !fatStr) {
            return null
        }

        // Generate current time
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = String(now.getMinutes()).padStart(2, '0')

        return {
            time: `${hh}:${mm}`,
            name: foodName,
            calories: parseInt(caloriesStr, 10),
            protein: parseInt(proteinStr, 10),
            carbs: parseInt(carbsStr, 10),
            fat: parseInt(fatStr, 10)
        }
    }

    /**
     * Parse raw frontmatter value into an array of meal strings.
     */
    static loadFromFrontmatter(raw: unknown): string[] {
        if (Array.isArray(raw)) {
            return raw.map(String)
        }
        if (typeof raw === 'string' && raw.trim()) {
            return [raw]
        }
        return []
    }

    /**
     * Return the current local time as HH:mm.
     */
    static currentTime(): string {
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = String(now.getMinutes()).padStart(2, '0')
        return `${hh}:${mm}`
    }
}
