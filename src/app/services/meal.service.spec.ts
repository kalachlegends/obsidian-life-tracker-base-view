import { describe, test, expect } from 'bun:test'
import { MealService, type MealEntry } from './meal.service'

describe('MealService', () => {
    describe('parse', () => {
        test('should parse a valid meal string', () => {
            const result = MealService.parse('[08:30] Oatmeal with berries | cal:350 p:12 c:58 f:8')

            expect(result).not.toBeNull()
            expect(result!.time).toBe('08:30')
            expect(result!.name).toBe('Oatmeal with berries')
            expect(result!.calories).toBe(350)
            expect(result!.protein).toBe(12)
            expect(result!.carbs).toBe(58)
            expect(result!.fat).toBe(8)
        })

        test('should parse a meal with extra whitespace', () => {
            const result = MealService.parse(
                '  [12:00] Grilled chicken   | cal:420 p:35 c:18 f:22  '
            )

            expect(result).not.toBeNull()
            expect(result!.name).toBe('Grilled chicken')
            expect(result!.calories).toBe(420)
        })

        test('should return null for invalid format', () => {
            expect(MealService.parse('just some text')).toBeNull()
            expect(MealService.parse('')).toBeNull()
            expect(MealService.parse('[08:30] Food without macros')).toBeNull()
        })

        test('should return null for missing time', () => {
            expect(MealService.parse('No time | cal:100 p:10 c:20 f:5')).toBeNull()
        })

        test('should handle zero values', () => {
            const result = MealService.parse('[09:00] Water | cal:0 p:0 c:0 f:0')

            expect(result).not.toBeNull()
            expect(result!.calories).toBe(0)
            expect(result!.protein).toBe(0)
        })
    })

    describe('serialize', () => {
        test('should serialize a meal entry', () => {
            const entry: MealEntry = {
                time: '08:30',
                name: 'Oatmeal with berries',
                calories: 350,
                protein: 12,
                carbs: 58,
                fat: 8
            }

            const result = MealService.serialize(entry)
            expect(result).toBe('[08:30] Oatmeal with berries | cal:350 p:12 c:58 f:8')
        })

        test('should round-trip parse and serialize', () => {
            const original = '[12:15] Grilled chicken salad | cal:420 p:35 c:18 f:22'
            const parsed = MealService.parse(original)
            expect(parsed).not.toBeNull()

            const serialized = MealService.serialize(parsed!)
            expect(serialized).toBe(original)
        })
    })

    describe('aggregate', () => {
        test('should aggregate multiple meals', () => {
            const meals: MealEntry[] = [
                {
                    time: '08:00',
                    name: 'Breakfast',
                    calories: 300,
                    protein: 15,
                    carbs: 40,
                    fat: 10
                },
                { time: '12:00', name: 'Lunch', calories: 500, protein: 30, carbs: 50, fat: 20 },
                { time: '19:00', name: 'Dinner', calories: 600, protein: 35, carbs: 55, fat: 25 }
            ]

            const totals = MealService.aggregate(meals)

            expect(totals.calories).toBe(1400)
            expect(totals.protein).toBe(80)
            expect(totals.carbs).toBe(145)
            expect(totals.fat).toBe(55)
        })

        test('should return zero totals for empty array', () => {
            const totals = MealService.aggregate([])

            expect(totals.calories).toBe(0)
            expect(totals.protein).toBe(0)
            expect(totals.carbs).toBe(0)
            expect(totals.fat).toBe(0)
        })

        test('should handle single meal', () => {
            const meals: MealEntry[] = [
                { time: '12:00', name: 'Lunch', calories: 500, protein: 30, carbs: 50, fat: 20 }
            ]

            const totals = MealService.aggregate(meals)

            expect(totals.calories).toBe(500)
            expect(totals.protein).toBe(30)
        })
    })

    describe('parseAIResponse', () => {
        test('should parse a valid AI response', () => {
            const response = `FOOD: Grilled chicken salad
CALORIES: 420
PROTEIN: 35
CARBS: 18
FAT: 22`

            const result = MealService.parseAIResponse(response)

            expect(result).not.toBeNull()
            expect(result!.name).toBe('Grilled chicken salad')
            expect(result!.calories).toBe(420)
            expect(result!.protein).toBe(35)
            expect(result!.carbs).toBe(18)
            expect(result!.fat).toBe(22)
        })

        test('should handle extra whitespace in AI response', () => {
            const response = `FOOD:   Oatmeal with berries  
CALORIES:  350
PROTEIN: 12
CARBS: 58
FAT: 8`

            const result = MealService.parseAIResponse(response)

            expect(result).not.toBeNull()
            expect(result!.name).toBe('Oatmeal with berries')
            expect(result!.calories).toBe(350)
        })

        test('should return null for incomplete AI response', () => {
            expect(MealService.parseAIResponse('FOOD: Something\nCALORIES: 100')).toBeNull()
            expect(MealService.parseAIResponse('')).toBeNull()
            expect(MealService.parseAIResponse('Some random text')).toBeNull()
        })

        test('should set current time on parsed result', () => {
            const response = `FOOD: Test food
CALORIES: 100
PROTEIN: 10
CARBS: 20
FAT: 5`

            const result = MealService.parseAIResponse(response)

            expect(result).not.toBeNull()
            expect(result!.time).toMatch(/^\d{2}:\d{2}$/)
        })
    })

    describe('loadFromFrontmatter', () => {
        test('should load from an array', () => {
            const result = MealService.loadFromFrontmatter(['meal1', 'meal2'])
            expect(result).toEqual(['meal1', 'meal2'])
        })

        test('should load from a single string', () => {
            const result = MealService.loadFromFrontmatter('single meal')
            expect(result).toEqual(['single meal'])
        })

        test('should return empty array for null/undefined', () => {
            expect(MealService.loadFromFrontmatter(null)).toEqual([])
            expect(MealService.loadFromFrontmatter(undefined)).toEqual([])
        })

        test('should return empty array for empty string', () => {
            expect(MealService.loadFromFrontmatter('')).toEqual([])
            expect(MealService.loadFromFrontmatter('   ')).toEqual([])
        })
    })

    describe('currentTime', () => {
        test('should return HH:mm format', () => {
            const result = MealService.currentTime()
            expect(result).toMatch(/^\d{2}:\d{2}$/)
        })
    })
})
