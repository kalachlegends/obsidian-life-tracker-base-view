import { test, expect } from 'bun:test'
import { TickTickToManualConverter } from '../src/integrations/ticktick/services/TickTickToManualConverter'
import type { ITask } from '../src/integrations/ticktick/api/types/Task'
import type { IProject } from '../src/integrations/ticktick/api/types/Project'

test('TickTick Converter - extract XP from title', () => {
    const converter = new TickTickToManualConverter()

    expect(converter.extractXpFromTitle('Task with #10xp')).toBe(10)
    expect(converter.extractXpFromTitle('Multiple #5xp and #15xp')).toBe(20)
    expect(converter.extractXpFromTitle('No XP here')).toBe(null)
    expect(converter.extractXpFromTitle('Negative #-5xp')).toBe(-5)
})

test('TickTick Converter - extract minutes', () => {
    const converter = new TickTickToManualConverter()

    expect(converter.extractMinutes('Task (Pomo×3 2h30m)')).toBe(150)
    expect(converter.extractMinutes('Quick #45min task')).toBe(45)
    expect(converter.extractMinutes('No time data')).toBe(0)
    expect(converter.extractMinutes('Multiple #30min and #15min')).toBe(45)
})

test('TickTick Converter - basic task conversion', () => {
    const converter = new TickTickToManualConverter()

    const tasks: ITask[] = [
        {
            id: 'task1',
            title: 'Review code',
            content: '',
            desc: '',
            status: 1,
            priority: 3, // medium = 15 XP
            projectId: 'proj1',
            modifiedTime: new Date().toISOString(),
            timeZone: 'America/New_York',
            isAllDay: false,
            reminders: [],
            repeatFlag: null,
            items: [],
            tags: [],
            childIds: [],
            parentId: null,
            sortOrder: 0,
            startDate: null,
            dueDate: null,
            progress: 100,
            deleted: 0,
            completedTime: null
        }
    ]

    const projects: IProject[] = [
        {
            id: 'proj1',
            name: 'Work',
            color: '#FF5722',
            sortOrder: 0,
            modifiedTime: '',
            closed: false,
            groupId: null,
            viewMode: 'list'
        }
    ]

    const result = converter.convertTasksToManualFormat(tasks, projects, 'January 7')

    expect(result).toContain('## Completed')
    expect(result).toContain('- [x] Review code #10xp <Work>')
    expect(result).toContain('# January 7')
})

test('TickTick Converter - task with existing XP', () => {
    const converter = new TickTickToManualConverter()

    const tasks: ITask[] = [
        {
            id: 'task1',
            title: 'Task with #25xp already set',
            content: '',
            desc: '',
            status: 1,
            priority: 0,
            projectId: 'proj1',
            modifiedTime: new Date().toISOString(),
            timeZone: 'America/New_York',
            isAllDay: false,
            reminders: [],
            repeatFlag: null,
            items: [],
            tags: [],
            childIds: [],
            parentId: null,
            sortOrder: 0,
            startDate: null,
            dueDate: null,
            progress: 100,
            deleted: 0,
            completedTime: null
        }
    ]

    const projects: IProject[] = [
        {
            id: 'proj1',
            name: 'Test',
            color: '#FF5722',
            sortOrder: 0,
            modifiedTime: '',
            closed: false,
            groupId: null,
            viewMode: 'list'
        }
    ]

    const result = converter.convertTasksToManualFormat(tasks, projects)

    // Should not add duplicate XP
    expect(result).toContain('#25xp')
    expect(result).not.toContain('#25xp #1xp')
})

test('TickTick Converter - uncompleted task', () => {
    const converter = new TickTickToManualConverter()

    const tasks: ITask[] = [
        {
            id: 'task1',
            title: 'Not done yet',
            content: '',
            desc: '',
            status: 0, // uncompleted
            priority: 0,
            projectId: 'proj1',
            modifiedTime: new Date().toISOString(),
            timeZone: 'America/New_York',
            isAllDay: false,
            reminders: [],
            repeatFlag: null,
            items: [],
            tags: [],
            childIds: [],
            parentId: null,
            sortOrder: 0,
            startDate: null,
            dueDate: null,
            progress: 0,
            deleted: 0,
            completedTime: null
        }
    ]

    const projects: IProject[] = [
        {
            id: 'proj1',
            name: 'Test',
            color: '#FF5722',
            sortOrder: 0,
            modifiedTime: '',
            closed: false,
            groupId: null,
            viewMode: 'list'
        }
    ]

    const result = converter.convertTasksToManualFormat(tasks, projects)

    expect(result).toContain('## Uncompleted')
    expect(result).toContain('- [ ]')
})

test('TickTick Converter - priority to XP mapping', () => {
    const converter = new TickTickToManualConverter()

    // Test different priorities
    const testCases = [
        { priority: 0, expected: 1 }, // none
        { priority: 1, expected: 5 }, // low
        { priority: 3, expected: 10 }, // medium
        { priority: 5, expected: 15 } // high
    ]

    for (const testCase of testCases) {
        const tasks: ITask[] = [
            {
                id: 'task1',
                title: 'Test task',
                content: '',
                desc: '',
                status: 1,
                priority: testCase.priority,
                projectId: 'proj1',
                modifiedTime: new Date().toISOString(),
                timeZone: 'America/New_York',
                isAllDay: false,
                reminders: [],
                repeatFlag: null,
                items: [],
                tags: [],
                childIds: [],
                parentId: null,
                sortOrder: 0,
                startDate: null,
                dueDate: null,
                progress: 100,
                deleted: 0,
                completedTime: null
            }
        ]

        const projects: IProject[] = [
            {
                id: 'proj1',
                name: 'Test',
                color: '#FF5722',
                sortOrder: 0,
                modifiedTime: '',
                closed: false,
                groupId: null,
                viewMode: 'list'
            }
        ]

        const result = converter.convertTasksToManualFormat(tasks, projects)
        expect(result).toContain(`#${testCase.expected}xp`)
    }
})
