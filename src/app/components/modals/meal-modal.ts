import { Modal, Notice, type TFile } from 'obsidian'
import type { LifeTrackerPlugin } from '../../plugin'
import { FrontmatterService } from '../../services/frontmatter.service'
import {
    MealService,
    DEFAULT_MEAL_ANALYSIS_PROMPT,
    type MealEntry,
    type NutritionTotals
} from '../../services/meal.service'
import { formatFileTitleWithWeekday, log } from '../../../utils'

/** View state within the modal */
type ModalView = 'list' | 'manual' | 'image'

/** Status of a single image analysis */
type AnalysisStatus = 'pending' | 'analyzing' | 'done' | 'error' | 'accepted'

/** Tracks one image being analyzed */
interface ImageAnalysisItem {
    /** Original filename for display */
    fileName: string
    /** Current status */
    status: AnalysisStatus
    /** Parsed meal from AI (null if unrecognized) */
    meal: MealEntry | null
    /** Raw AI response text */
    rawContent: string
    /** Error message if failed */
    error: string
}

/**
 * Modal for capturing and managing meal/nutrition entries.
 * Stores meals as a frontmatter list and aggregates nutrition totals.
 * Supports manual entry and AI-powered food image analysis (multiple images).
 */
export class MealModal extends Modal {
    private plugin: LifeTrackerPlugin
    private file: TFile
    private frontmatterService: FrontmatterService

    /** Raw stored meal strings from frontmatter */
    private mealStrings: string[] = []
    /** Parsed meal entries (null for unparseable strings) */
    private parsedMeals: Array<MealEntry | null> = []

    /** Current active view */
    private currentView: ModalView = 'list'

    /** Root container element for the modal content */
    private rootEl: HTMLElement | null = null

    /** Number of images currently being analyzed */
    private analyzingCount = 0

    /** All image analysis items for the current session */
    private analysisItems: ImageAnalysisItem[] = []

    /** Pre-filled meal entry from AI analysis (for editing before save) */
    private pendingAIMeal: MealEntry | null = null

    constructor(plugin: LifeTrackerPlugin, file: TFile) {
        super(plugin.app)
        this.plugin = plugin
        this.file = file
        this.frontmatterService = new FrontmatterService(plugin.app)
    }

    override onOpen(): void {
        const { contentEl } = this
        contentEl.empty()
        contentEl.addClass('lt-meal-modal')

        this.loadMeals()
        this.renderCurrentView()
    }

    override onClose(): void {
        this.contentEl.empty()
    }

    // ==========================================
    // Data management
    // ==========================================

    private loadMeals(): void {
        const propertyName = this.plugin.settings.mealsPropertyName
        const frontmatter = this.frontmatterService.read(this.file)
        const raw = frontmatter[propertyName]

        this.mealStrings = MealService.loadFromFrontmatter(raw)
        this.parsedMeals = this.mealStrings.map((s) => MealService.parse(s))
    }

    private async saveMeals(): Promise<void> {
        const mealsProperty = this.plugin.settings.mealsPropertyName
        const prefix = this.plugin.settings.nutritionPropertyPrefix

        // Compute aggregated totals from all parseable meals
        const validMeals = this.parsedMeals.filter((m): m is MealEntry => m !== null)
        const totals: NutritionTotals = MealService.aggregate(validMeals)

        try {
            const values: Record<string, unknown> = {
                [mealsProperty]: this.mealStrings.length > 0 ? [...this.mealStrings] : null,
                [`${prefix}_calories`]: totals.calories > 0 ? totals.calories : null,
                [`${prefix}_protein`]: totals.protein > 0 ? totals.protein : null,
                [`${prefix}_carbs`]: totals.carbs > 0 ? totals.carbs : null,
                [`${prefix}_fat`]: totals.fat > 0 ? totals.fat : null
            }

            await this.frontmatterService.write(this.file, values)
        } catch (error) {
            log('Failed to save meals', 'error', error)
            new Notice('Failed to save meal data')
        }
    }

    private async addMeal(entry: MealEntry): Promise<void> {
        const serialized = MealService.serialize(entry)
        this.mealStrings.push(serialized)
        this.parsedMeals.push(entry)

        await this.saveMeals()
    }

    private async addMeals(entries: MealEntry[]): Promise<void> {
        for (const entry of entries) {
            const serialized = MealService.serialize(entry)
            this.mealStrings.push(serialized)
            this.parsedMeals.push(entry)
        }

        await this.saveMeals()
    }

    private async removeMeal(index: number): Promise<void> {
        this.mealStrings.splice(index, 1)
        this.parsedMeals.splice(index, 1)

        await this.saveMeals()
    }

    // ==========================================
    // View routing
    // ==========================================

    private renderCurrentView(): void {
        const { contentEl } = this
        contentEl.empty()

        this.rootEl = contentEl.createDiv({ cls: 'lt-meal-container' })

        switch (this.currentView) {
            case 'list':
                this.renderListView()
                break
            case 'manual':
                this.renderManualEntryView()
                break
            case 'image':
                this.renderImageAnalysisView()
                break
        }
    }

    private switchView(view: ModalView): void {
        this.currentView = view
        this.pendingAIMeal = null
        this.renderCurrentView()
    }

    // ==========================================
    // List view (main view)
    // ==========================================

    private renderListView(): void {
        if (!this.rootEl) return

        // Title
        const title = formatFileTitleWithWeekday(this.file.basename)
        this.rootEl.createDiv({ cls: 'lt-meal-title', text: title })

        // Property hint
        const propertyName = this.plugin.settings.mealsPropertyName
        this.rootEl.createDiv({
            cls: 'lt-meal-property-hint',
            text: `Storing in: ${propertyName}`
        })

        // Meals list
        const listEl = this.rootEl.createDiv({ cls: 'lt-meal-list' })
        this.renderMealsList(listEl)

        // Daily totals
        this.renderDailyTotals()

        // Action buttons
        const actionsEl = this.rootEl.createDiv({ cls: 'lt-meal-actions' })

        const manualBtn = actionsEl.createEl('button', {
            cls: 'lt-meal-action-btn',
            text: 'Manual entry'
        })
        manualBtn.addEventListener('click', () => {
            this.switchView('manual')
        })

        // Only show image scan if AI is configured
        if (this.plugin.settings.ai.enabled && this.plugin.settings.ai.provider.apiKey) {
            const imageBtn = actionsEl.createEl('button', {
                cls: 'lt-meal-action-btn lt-meal-action-btn-primary',
                text: 'Scan food image'
            })
            imageBtn.addEventListener('click', () => {
                this.analysisItems = []
                this.switchView('image')
            })
        }
    }

    private renderMealsList(container: HTMLElement): void {
        if (this.mealStrings.length === 0) {
            container.createDiv({
                cls: 'lt-meal-empty',
                text: 'No meals logged yet.'
            })
            return
        }

        for (let i = 0; i < this.mealStrings.length; i++) {
            const parsed = this.parsedMeals[i] ?? null
            const raw = this.mealStrings[i]
            if (raw === undefined) continue

            const itemEl = container.createDiv({ cls: 'lt-meal-item' })

            if (parsed) {
                // Parsed meal display
                const headerRow = itemEl.createDiv({ cls: 'lt-meal-item-header' })
                headerRow.createSpan({ cls: 'lt-meal-item-time', text: parsed.time })
                headerRow.createSpan({ cls: 'lt-meal-item-name', text: parsed.name })

                const macrosRow = itemEl.createDiv({ cls: 'lt-meal-item-macros' })
                macrosRow.createSpan({
                    cls: 'lt-meal-item-calories',
                    text: `${parsed.calories} cal`
                })
                macrosRow.createSpan({
                    cls: 'lt-meal-item-macro',
                    text: `P:${parsed.protein}g`
                })
                macrosRow.createSpan({
                    cls: 'lt-meal-item-macro',
                    text: `C:${parsed.carbs}g`
                })
                macrosRow.createSpan({
                    cls: 'lt-meal-item-macro',
                    text: `F:${parsed.fat}g`
                })
            } else {
                // Unparseable entry -- show raw text with warning
                const headerRow = itemEl.createDiv({ cls: 'lt-meal-item-header' })
                headerRow.createSpan({
                    cls: 'lt-meal-item-raw',
                    text: raw
                })
            }

            // Delete button
            const deleteBtn = itemEl.createEl('button', {
                cls: 'lt-meal-item-delete',
                attr: { 'aria-label': 'Remove meal' }
            })
            deleteBtn.textContent = '\u00D7'
            deleteBtn.addEventListener('click', () => {
                void this.removeMeal(i).then(() => this.renderCurrentView())
            })
        }
    }

    private renderDailyTotals(): void {
        if (!this.rootEl) return

        const validMeals = this.parsedMeals.filter((m): m is MealEntry => m !== null)
        if (validMeals.length === 0) return

        const totals = MealService.aggregate(validMeals)
        const totalsEl = this.rootEl.createDiv({ cls: 'lt-meal-totals' })

        totalsEl.createDiv({
            cls: 'lt-meal-totals-calories',
            text: `Daily total: ${totals.calories} cal`
        })

        const macrosEl = totalsEl.createDiv({ cls: 'lt-meal-totals-macros' })
        macrosEl.createSpan({ text: `P: ${totals.protein}g` })
        macrosEl.createSpan({ text: `C: ${totals.carbs}g` })
        macrosEl.createSpan({ text: `F: ${totals.fat}g` })
    }

    // ==========================================
    // Manual entry view
    // ==========================================

    private renderManualEntryView(): void {
        if (!this.rootEl) return

        this.rootEl.createDiv({ cls: 'lt-meal-title', text: 'Add meal' })

        const formEl = this.rootEl.createDiv({ cls: 'lt-meal-form' })

        // Pre-fill from pending AI meal if available
        const prefill = this.pendingAIMeal

        const nameInput = this.createFormField(
            formEl,
            'Name',
            'text',
            'e.g., Grilled chicken salad',
            prefill?.name ?? ''
        )
        const calInput = this.createFormField(
            formEl,
            'Calories',
            'number',
            'kcal',
            prefill ? String(prefill.calories) : ''
        )
        const proteinInput = this.createFormField(
            formEl,
            'Protein',
            'number',
            'grams',
            prefill ? String(prefill.protein) : ''
        )
        const carbsInput = this.createFormField(
            formEl,
            'Carbs',
            'number',
            'grams',
            prefill ? String(prefill.carbs) : ''
        )
        const fatInput = this.createFormField(
            formEl,
            'Fat',
            'number',
            'grams',
            prefill ? String(prefill.fat) : ''
        )

        // Buttons
        const buttonsEl = this.rootEl.createDiv({ cls: 'lt-meal-form-buttons' })

        const cancelBtn = buttonsEl.createEl('button', {
            text: 'Cancel'
        })
        cancelBtn.addEventListener('click', () => {
            this.switchView('list')
        })

        const addBtn = buttonsEl.createEl('button', {
            cls: 'mod-cta',
            text: 'Add meal'
        })
        addBtn.addEventListener('click', () => {
            void this.handleManualSubmit(nameInput, calInput, proteinInput, carbsInput, fatInput)
        })

        // Focus first input
        setTimeout(() => {
            nameInput.focus()
        }, 50)
    }

    private createFormField(
        container: HTMLElement,
        label: string,
        type: string,
        placeholder: string,
        value: string
    ): HTMLInputElement {
        const fieldEl = container.createDiv({ cls: 'lt-meal-form-field' })
        fieldEl.createEl('label', { text: label, cls: 'lt-meal-form-label' })
        const input = fieldEl.createEl('input', {
            cls: 'lt-meal-form-input',
            attr: {
                type,
                placeholder
            }
        })
        input.value = value

        // Allow Enter to submit in number fields
        if (type === 'number') {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    // Find the add button and click it
                    const addBtn = this.rootEl?.querySelector(
                        '.mod-cta'
                    ) as HTMLButtonElement | null
                    addBtn?.click()
                }
            })
        }

        return input
    }

    private async handleManualSubmit(
        nameInput: HTMLInputElement,
        calInput: HTMLInputElement,
        proteinInput: HTMLInputElement,
        carbsInput: HTMLInputElement,
        fatInput: HTMLInputElement
    ): Promise<void> {
        const name = nameInput.value.trim()
        if (!name) {
            new Notice('Please enter a meal name')
            return
        }

        const calories = parseInt(calInput.value, 10)
        const protein = parseInt(proteinInput.value, 10)
        const carbs = parseInt(carbsInput.value, 10)
        const fat = parseInt(fatInput.value, 10)

        if (isNaN(calories) || calories < 0) {
            new Notice('Please enter valid calories')
            return
        }

        const entry: MealEntry = {
            time: MealService.currentTime(),
            name,
            calories,
            protein: isNaN(protein) ? 0 : protein,
            carbs: isNaN(carbs) ? 0 : carbs,
            fat: isNaN(fat) ? 0 : fat
        }

        await this.addMeal(entry)
        new Notice(`Meal logged: ${name} (${calories} cal)`)
        this.switchView('list')
    }

    // ==========================================
    // Image analysis view (multi-image)
    // ==========================================

    private renderImageAnalysisView(): void {
        if (!this.rootEl) return

        this.rootEl.createDiv({ cls: 'lt-meal-title', text: 'Scan food images' })

        // Drop zone
        const dropZone = this.rootEl.createDiv({ cls: 'lt-meal-dropzone' })
        dropZone.createDiv({
            cls: 'lt-meal-dropzone-text',
            text: 'Drop images here, click to browse, or paste from clipboard'
        })

        // Hidden file input with multiple
        const fileInput = this.rootEl.createEl('input', {
            attr: {
                type: 'file',
                accept: 'image/*',
                multiple: '',
                style: 'display: none'
            }
        })

        // Click to browse
        dropZone.addEventListener('click', () => {
            fileInput.click()
        })

        // Files selected
        fileInput.addEventListener('change', () => {
            const files = fileInput.files
            if (files && files.length > 0) {
                this.processImageFiles(files)
            }
        })

        // Drag and drop (multiple files)
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dropZone.addClass('lt-meal-dropzone-active')
        })

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dropZone.removeClass('lt-meal-dropzone-active')
        })

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dropZone.removeClass('lt-meal-dropzone-active')

            const files = e.dataTransfer?.files
            if (files && files.length > 0) {
                // Filter to image files only
                const imageFiles: File[] = []
                for (let i = 0; i < files.length; i++) {
                    const f = files[i]
                    if (f?.type.startsWith('image/')) {
                        imageFiles.push(f)
                    }
                }
                if (imageFiles.length > 0) {
                    this.processImageFiles(imageFiles)
                } else {
                    new Notice('Please drop image files')
                }
            }
        })

        // Paste from clipboard
        const pasteHandler = (e: ClipboardEvent): void => {
            const items = e.clipboardData?.items
            if (!items) return

            const imageFiles: File[] = []
            for (let i = 0; i < items.length; i++) {
                const item = items[i]
                if (item?.type.startsWith('image/')) {
                    const file = item.getAsFile()
                    if (file) {
                        imageFiles.push(file)
                    }
                }
            }

            if (imageFiles.length > 0) {
                e.preventDefault()
                this.processImageFiles(imageFiles)
            }
        }

        // Register paste listener
        document.addEventListener('paste', pasteHandler)

        // Clean up on view change -- store reference for removal
        const origSwitchView = this.switchView.bind(this)
        this.switchView = (view: ModalView): void => {
            document.removeEventListener('paste', pasteHandler)
            this.switchView = origSwitchView
            origSwitchView(view)
        }

        // Results area (list of analysis cards)
        this.rootEl.createDiv({ cls: 'lt-meal-analysis-results' })

        // Bottom actions area (accept all, back)
        const bottomActions = this.rootEl.createDiv({ cls: 'lt-meal-analysis-bottom' })

        const backBtn = bottomActions.createEl('button', {
            text: 'Back',
            cls: 'lt-meal-back-btn'
        })
        backBtn.addEventListener('click', () => {
            this.switchView('list')
        })

        // Re-render existing items if returning to this view
        if (this.analysisItems.length > 0) {
            this.renderAllAnalysisItems()
        }
    }

    // ==========================================
    // Multi-image processing
    // ==========================================

    /**
     * Accept a FileList or File array and queue each for analysis.
     */
    private processImageFiles(files: FileList | File[]): void {
        const fileArray = Array.from(files)

        for (const file of fileArray) {
            if (!file.type.startsWith('image/')) continue

            // Create a tracking item
            const item: ImageAnalysisItem = {
                fileName: file.name || 'Pasted image',
                status: 'pending',
                meal: null,
                rawContent: '',
                error: ''
            }
            this.analysisItems.push(item)

            // Start analysis
            void this.analyzeOneImage(file, item)
        }

        this.renderAllAnalysisItems()
    }

    /**
     * Analyze a single image file and update its tracking item.
     */
    private async analyzeOneImage(file: File, item: ImageAnalysisItem): Promise<void> {
        item.status = 'analyzing'
        this.analyzingCount++
        this.renderAllAnalysisItems()

        try {
            const base64 = await this.readFileAsBase64(file)
            const mimeType = file.type || 'image/jpeg'

            const customPrompt = this.plugin.settings.mealAnalysisPrompt.trim()
            const systemPrompt = customPrompt || DEFAULT_MEAL_ANALYSIS_PROMPT

            const result = await this.plugin.aiService.analyzeWithImage(
                systemPrompt,
                'Analyze this food image and provide nutritional estimates.',
                base64,
                mimeType
            )

            if (!result.success) {
                item.status = 'error'
                item.error = result.error ?? 'Analysis failed'
            } else {
                const meal = MealService.parseAIResponse(result.content)
                item.rawContent = result.content

                if (meal && meal.name !== 'Unknown') {
                    item.status = 'done'
                    item.meal = meal
                } else {
                    item.status = 'error'
                    item.error = 'Could not identify food'
                    item.rawContent = result.content
                }
            }
        } catch (error) {
            item.status = 'error'
            item.error = error instanceof Error ? error.message : 'Unknown error'
        } finally {
            this.analyzingCount--
            this.renderAllAnalysisItems()
        }
    }

    /**
     * Re-render the analysis results list and bottom actions.
     */
    private renderAllAnalysisItems(): void {
        const resultsEl = this.rootEl?.querySelector(
            '.lt-meal-analysis-results'
        ) as HTMLElement | null
        if (!resultsEl) return

        resultsEl.empty()

        if (this.analysisItems.length === 0) return

        for (let i = 0; i < this.analysisItems.length; i++) {
            const item = this.analysisItems[i]
            if (!item) continue
            this.renderAnalysisCard(resultsEl, item, i)
        }

        // Update bottom actions
        this.renderBottomActions()
    }

    /**
     * Render a single analysis result card.
     */
    private renderAnalysisCard(
        container: HTMLElement,
        item: ImageAnalysisItem,
        index: number
    ): void {
        const cardEl = container.createDiv({ cls: 'lt-meal-analysis-card' })

        // Header with filename and status
        const headerEl = cardEl.createDiv({ cls: 'lt-meal-analysis-card-header' })
        headerEl.createSpan({ cls: 'lt-meal-analysis-card-name', text: item.fileName })

        if (item.status === 'analyzing') {
            cardEl.addClass('lt-meal-analysis-card--analyzing')
            headerEl.createSpan({ cls: 'lt-meal-analysis-card-status', text: 'Analyzing...' })
            return
        }

        if (item.status === 'accepted') {
            cardEl.addClass('lt-meal-analysis-card--accepted')
            headerEl.createSpan({ cls: 'lt-meal-analysis-card-status', text: 'Saved' })
            if (item.meal) {
                const infoEl = cardEl.createDiv({ cls: 'lt-meal-analysis-card-info' })
                infoEl.createSpan({ text: item.meal.name })
                infoEl.createSpan({
                    cls: 'lt-meal-analysis-card-macros',
                    text: `${item.meal.calories} cal`
                })
            }
            return
        }

        if (item.status === 'error') {
            cardEl.addClass('lt-meal-analysis-card--error')
            cardEl.createDiv({
                cls: 'lt-meal-analysis-card-error',
                text: item.error
            })

            if (item.rawContent) {
                cardEl.createEl('details', { cls: 'lt-meal-analysis-card-raw' }, (details) => {
                    details.createEl('summary', { text: 'AI response' })
                    details.createEl('pre', { text: item.rawContent })
                })
            }

            // Dismiss button
            const actionsEl = cardEl.createDiv({ cls: 'lt-meal-analysis-card-actions' })
            const dismissBtn = actionsEl.createEl('button', { text: 'Dismiss' })
            dismissBtn.addEventListener('click', () => {
                this.analysisItems.splice(index, 1)
                this.renderAllAnalysisItems()
            })
            return
        }

        // Status: done -- show meal info and actions
        if (item.meal) {
            const infoEl = cardEl.createDiv({ cls: 'lt-meal-analysis-card-info' })
            infoEl.createSpan({ cls: 'lt-meal-analysis-card-meal-name', text: item.meal.name })

            const macrosEl = infoEl.createDiv({ cls: 'lt-meal-analysis-card-macros' })
            macrosEl.createSpan({ text: `${item.meal.calories} cal` })
            macrosEl.createSpan({ text: `P:${item.meal.protein}g` })
            macrosEl.createSpan({ text: `C:${item.meal.carbs}g` })
            macrosEl.createSpan({ text: `F:${item.meal.fat}g` })
        }

        const actionsEl = cardEl.createDiv({ cls: 'lt-meal-analysis-card-actions' })

        // Edit button
        const editBtn = actionsEl.createEl('button', { text: 'Edit' })
        editBtn.addEventListener('click', () => {
            if (item.meal) {
                this.pendingAIMeal = item.meal
            }
            this.switchView('manual')
        })

        // Dismiss button
        const dismissBtn = actionsEl.createEl('button', { text: 'Dismiss' })
        dismissBtn.addEventListener('click', () => {
            this.analysisItems.splice(index, 1)
            this.renderAllAnalysisItems()
        })

        // Accept button
        const acceptBtn = actionsEl.createEl('button', {
            cls: 'mod-cta',
            text: 'Accept'
        })
        acceptBtn.addEventListener('click', () => {
            if (!item.meal) return
            void this.addMeal(item.meal).then(() => {
                item.status = 'accepted'
                new Notice(
                    `Meal logged: ${item.meal?.name ?? 'meal'} (${item.meal?.calories ?? 0} cal)`
                )
                this.renderAllAnalysisItems()
            })
        })
    }

    /**
     * Render bottom action bar (accept all, progress info).
     */
    private renderBottomActions(): void {
        const bottomEl = this.rootEl?.querySelector('.lt-meal-analysis-bottom')
        if (!bottomEl) return

        // Remove old accept-all button if present
        const existing = bottomEl.querySelector('.lt-meal-accept-all')
        if (existing) existing.remove()

        const existingProgress = bottomEl.querySelector('.lt-meal-analysis-progress')
        if (existingProgress) existingProgress.remove()

        // Show progress if still analyzing
        if (this.analyzingCount > 0) {
            const progressEl = document.createElement('div')
            progressEl.className = 'lt-meal-analysis-progress'
            progressEl.textContent = `Analyzing ${this.analyzingCount} image${this.analyzingCount > 1 ? 's' : ''}...`
            bottomEl.prepend(progressEl)
        }

        // Count meals ready to accept
        const readyMeals = this.analysisItems.filter(
            (item) => item.status === 'done' && item.meal !== null
        )

        if (readyMeals.length >= 2) {
            const acceptAllBtn = document.createElement('button')
            acceptAllBtn.className = 'mod-cta lt-meal-accept-all'
            acceptAllBtn.textContent = `Accept all (${readyMeals.length})`
            acceptAllBtn.addEventListener('click', () => {
                void this.acceptAllReady()
            })
            bottomEl.prepend(acceptAllBtn)
        }
    }

    /**
     * Accept all ready (done) meals at once.
     */
    private async acceptAllReady(): Promise<void> {
        const readyItems = this.analysisItems.filter(
            (item) => item.status === 'done' && item.meal !== null
        )
        const meals = readyItems.map((item) => item.meal).filter((m): m is MealEntry => m !== null)

        if (meals.length === 0) return

        await this.addMeals(meals)

        for (const item of readyItems) {
            item.status = 'accepted'
        }

        const totalCal = meals.reduce((sum, m) => sum + m.calories, 0)
        new Notice(`${meals.length} meals logged (${totalCal} cal total)`)

        this.renderAllAnalysisItems()
    }

    // ==========================================
    // Image reading
    // ==========================================

    private readFileAsBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (): void => {
                const result = reader.result as string
                // Remove the data:mime;base64, prefix
                const base64 = result.split(',')[1]
                if (base64) {
                    resolve(base64)
                } else {
                    reject(new Error('Failed to read image as base64'))
                }
            }
            reader.onerror = (): void => {
                reject(new Error('Failed to read image file'))
            }
            reader.readAsDataURL(file)
        })
    }
}
