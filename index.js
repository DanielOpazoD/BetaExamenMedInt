

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from "@google/genai";
// Import the database helper from a separate module.  This replaces the
// inline IndexedDB implementation and keeps the rest of the code unchanged.
import db from './db.js';
import { makeTableResizable } from './table-resize.js';
import { setupAdvancedSearchReplace } from './search-replace.js';
import { setupKeyboardShortcuts } from './shortcuts.js';
import { setupCloudIntegration } from './cloud-sync.js';

const pdfjsLib = typeof window !== 'undefined' ? window['pdfjsLib'] : null;
if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// API Key for Google Gemini.  For simplicity and to avoid relying on build
// environment variables, insert your key directly here.  Replace the
// placeholder string below with your actual Gemini API key.  Note: embedding
// secrets in client-side code exposes them to anyone who can view your
// website, so only use this approach in personal or non-sensitive projects.
const API_KEY = 'AIzaSyA9-VXmB8QyNS_wt5WclUlMVfXgbPuaLj4';

// --- IndexedDB Helper ---
// NOTE: The IndexedDB helper has been moved into db.js.  The following
// object remains only to preserve its source for reference but is not
// used.  It has been renamed to `_unusedDb` to avoid naming conflicts.
const _unusedDb = {
    _dbPromise: null,
    connect() {
        if (this._dbPromise) return this._dbPromise;

        this._dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open('temarioDB', 1);
            
            request.onerror = (e) => {
                console.error("IndexedDB error:", request.error);
                reject('Error opening IndexedDB.');
            };
            
            request.onsuccess = (e) => {
                resolve(e.target.result);
            };
            
            request.onupgradeneeded = (e) => {
                const dbInstance = e.target.result;
                if (!dbInstance.objectStoreNames.contains('topics')) {
                    dbInstance.createObjectStore('topics', { keyPath: 'id' });
                }
                if (!dbInstance.objectStoreNames.contains('sections')) {
                    dbInstance.createObjectStore('sections', { keyPath: 'id' });
                }
                if (!dbInstance.objectStoreNames.contains('keyvalue')) {
                    dbInstance.createObjectStore('keyvalue', { keyPath: 'key' });
                }
            };
        });
        return this._dbPromise;
    },

    async _getStore(storeName, mode) {
        const db = await this.connect();
        return db.transaction(storeName, mode).objectStore(storeName);
    },
    
    async set(storeName, value) {
        const store = await this._getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => {
                console.error(`Error setting value in ${storeName}:`, e.target.error);
                reject(e.target.error);
            };
        });
    },
    
    async get(storeName, key) {
        const store = await this._getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => {
                console.error(`Error getting value from ${storeName}:`, e.target.error);
                reject(e.target.error);
            };
        });
    },

    async getAll(storeName) {
        const store = await this._getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => {
                console.error(`Error getting all from ${storeName}:`, e.target.error);
                reject(e.target.error);
            };
        });
    }
};


document.addEventListener('DOMContentLoaded', function () {
    // --- DOM Element Cache ---
    const getElem = (id) => document.getElementById(id);
    const tableBody = getElem('table-body');
    const notesModal = getElem('notes-modal');
    const notesModalTitle = getElem('notes-modal-title');
    const notesEditor = getElem('notes-editor');
    const editorToolbar = notesModal.querySelector('.editor-toolbar');
    const saveNoteBtn = getElem('save-note-btn');
    const saveAndCloseNoteBtn = getElem('save-and-close-note-btn');
    const cancelNoteBtn = getElem('cancel-note-btn');
    const unmarkNoteBtn = getElem('unmark-note-btn');
    const progressBar = getElem('progress-bar');
    const askAiBtn = getElem('ask-ai-btn');
    const aiQaModal = getElem('ai-qa-modal');
    const aiResponseArea = getElem('ai-response-area');
    const aiQaLoader = getElem('ai-qa-loader');
    const aiQuestionInput = getElem('ai-question-input');
    const cancelAiQaBtn = getElem('cancel-ai-qa-btn');
    const sendAiQaBtn = getElem('send-ai-qa-btn');
    const aiToolsModal = getElem('ai-tools-modal');
    const aiToolsThinking = getElem('ai-tools-thinking');
    const aiToolsResponse = getElem('ai-tools-response');
    const aiToolsLoader = getElem('ai-tools-loader');
    const aiToolsInput = getElem('ai-tools-input');
    const cancelAiToolsBtn = getElem('cancel-ai-tools-btn');
    const sendAiToolsBtn = getElem('send-ai-tools-btn');
    const insertAiToolsBtn = getElem('insert-ai-tools-btn');
    const printAllBtn = getElem('print-all-btn');
    const exportBtn = getElem('export-btn');
    const importBtn = getElem('import-btn');
    const importFileInput = getElem('import-file-input');
    const exportNoteBtn = getElem('export-note-btn');
    const importNoteBtn = getElem('import-note-btn');
    const importNoteFileInput = getElem('import-note-file-input');
    const settingsBtn = getElem('settings-btn');
    const settingsDropdown = getElem('settings-dropdown');
    const statusFiltersContainer = getElem('status-filters');
    const saveConfirmation = getElem('save-confirmation');
    const toggleReadOnlyBtn = getElem('toggle-readonly-btn');
    const toggleAllSectionsBtn = getElem('toggle-all-sections-btn');

    const openAiPanelBtn = getElem('open-ai-panel');
    const aiPanel = getElem('ai-panel');
    const closeAiPanelBtn = getElem('close-ai-panel');
    const aiMessages = getElem('ai-messages');
    const aiInput = getElem('ai-input');
    const sendAiPanelBtn = getElem('send-ai-btn');
    const aiStatus = getElem('ai-status');
    const aiToolSelect = getElem('ai-tool-select');
    const toneSelect = getElem('tone-select');
    const lengthRange = getElem('length-range');
    const langSelect = getElem('lang-select');
    const fileUploadInput = getElem('file-upload');
    const generateCanvasBtn = getElem('generate-canvas-btn');
    const aiCanvas = getElem('ai-canvas');
    const aiCanvasReasoning = getElem('ai-canvas-reasoning');
    let uploadedFileText = '';
    
    // References modal elements
    const referencesModal = getElem('references-modal');
    const referencesEditor = getElem('references-editor');
    const saveReferencesBtn = getElem('save-references-btn');
    const cancelReferencesBtn = getElem('cancel-references-btn');
    const addReferenceSlotBtn = getElem('add-reference-slot-btn');
    
    // Icon Picker Modal elements
    const iconPickerModal = getElem('icon-picker-modal');
    const iconPickerCategories = getElem('icon-picker-categories');
    const emojiGrid = getElem('emoji-grid');
    const cancelIconPickerBtn = getElem('cancel-icon-picker-btn');

    // Custom icon input elements
    const newIconInput = getElem('new-icon-input');
    const addIconBtn = getElem('add-icon-btn');

    // Icon manager modal elements
    const openIconManagerBtn = getElem('open-icon-manager-btn');
    const iconManagerModal = getElem('icon-manager-modal');
    const currentIcons = getElem('current-icons');
    const newIconInputManager = getElem('new-icon-input-manager');
    const addNewIconBtn = getElem('add-new-icon-btn');
    const closeIconManagerBtn = getElem('close-icon-manager-btn');

    // Character manager modal elements
    const charManagerModal = getElem('char-manager-modal');
    const currentChars = getElem('current-chars');
    const newCharInputManager = getElem('new-char-input-manager');
    const addNewCharBtn = getElem('add-new-char-btn');
    const closeCharManagerBtn = getElem('close-char-manager-btn');

    // HTML code modal elements
    const htmlCodeModal = getElem('html-code-modal');
    const htmlCodeInput = getElem('html-code-input');
    const insertHtmlBtn = getElem('insert-html-btn');
    const cancelHtmlBtn = getElem('cancel-html-btn');
    const saveHtmlFavoriteBtn = getElem('save-html-favorite-btn');
    const htmlFavoriteName = getElem('html-favorite-name');
    const htmlFavoritesList = getElem('html-favorites-list');
    let currentHtmlEditor = null;

    const selectedHtmlModal = getElem('selected-html-modal');
    const selectedHtmlOutput = getElem('selected-html-output');
    const copySelectedHtmlBtn = getElem('copy-selected-html-btn');
    const closeSelectedHtmlBtn = getElem('close-selected-html-btn');

    // Table grid element
    const tableGridEl = getElem('table-grid');

    // Flag to prevent multiple table insertions if user double-clicks or if events overlap
    let isInsertingTable = false;


    /**
     * Initialize the table size selection grid.  This creates the 10x10 cells
     * and binds mouseover and click events to highlight and insert tables.
     * This function should be called once after DOMContentLoaded.
     */
    function initTableGrid() {
        if (!tableGridEl) return;
        // Create cells only once
        if (tableGridEl.children.length === 0) {
            for (let r = 1; r <= 10; r++) {
                for (let c = 1; c <= 10; c++) {
                    const cell = document.createElement('div');
                    cell.className = 'cell';
                    cell.dataset.rows = r;
                    cell.dataset.cols = c;
                    tableGridEl.appendChild(cell);
                }
            }
        }
        // Hover to highlight selection
        tableGridEl.addEventListener('mouseover', (e) => {
            const target = e.target.closest('.cell');
            if (!target) return;
            const rows = parseInt(target.dataset.rows);
            const cols = parseInt(target.dataset.cols);
            tableGridEl.querySelectorAll('.cell').forEach(cell => {
                const r = parseInt(cell.dataset.rows);
                const c = parseInt(cell.dataset.cols);
                if (r <= rows && c <= cols) {
                    cell.classList.add('highlight');
                } else {
                    cell.classList.remove('highlight');
                }
            });
        });
        // Click to insert table
        tableGridEl.addEventListener('click', (e) => {
            const target = e.target.closest('.cell');
            if (!target) return;
            const rows = parseInt(target.dataset.rows);
            const cols = parseInt(target.dataset.cols);
            hideTableGrid();
            insertTableWithDimensions(rows, cols);
        });
    }

    // --- Customizable Icon and Character Lists ---
    // These variables will be initialized later, after EMOJI_CATEGORIES is
    // defined.  Using let allows us to assign values subsequently without
    // triggering temporal dead zone errors.  See below for initialization.
    let defaultSuggestedIcons;
    let customIconsList;
    let globalSpecialChars;

    // Multi-note panel elements
    const notesPanelToggle = getElem('notes-panel-toggle');
    const notesSidePanel = getElem('notes-side-panel');
    const notesList = getElem('notes-list');
    const addNotePanelBtn = getElem('add-note-panel-btn');
    const notesMainContent = getElem('notes-main-content');
    const notesModalCounter = getElem('notes-modal-counter');

    // Custom Dialog Modals
    const confirmationModal = getElem('confirmation-modal');
    const confirmationTitle = getElem('confirmation-title');
    const confirmationMessage = getElem('confirmation-message');
    const confirmConfirmationBtn = getElem('confirm-confirmation-btn');
    const cancelConfirmationBtn = getElem('cancel-confirmation-btn');
    const alertModal = getElem('alert-modal');
    const alertTitle = getElem('alert-title');
    const alertMessage = getElem('alert-message');
    const okAlertBtn = getElem('ok-alert-btn');

    // Note Info Modal
    const noteInfoBtn = getElem('note-info-btn');
    const noteInfoModal = getElem('note-info-modal');
    const infoWordCount = getElem('info-word-count');
    const infoNoteSize = getElem('info-note-size');
    const infoLastEdited = getElem('info-last-edited');
    const closeNoteInfoBtn = getElem('close-note-info-btn');

    // Image Gallery Modals
    const imageGalleryLinkModal = getElem('image-gallery-link-modal');
    const imageGalleryInputs = getElem('image-gallery-inputs');
    const addGalleryImageUrlBtn = getElem('add-gallery-image-url-btn');
    const cancelGalleryLinkBtn = getElem('cancel-gallery-link-btn');
    const saveGalleryLinkBtn = getElem('save-gallery-link-btn');
    const imageLightboxModal = getElem('image-lightbox-modal');
    const closeLightboxBtn = getElem('close-lightbox-btn');
    const prevLightboxBtn = getElem('prev-lightbox-btn');
    const nextLightboxBtn = getElem('next-lightbox-btn');
    const lightboxImage = getElem('lightbox-image');
    const lightboxCaption = getElem('lightbox-caption');
    const lightboxCaptionText = getElem('lightbox-caption-text');
    const deleteCaptionBtn = getElem('delete-caption-btn');
    const zoomInLightboxBtn = getElem('zoom-in-lightbox-btn');
    const zoomOutLightboxBtn = getElem('zoom-out-lightbox-btn');
    const downloadLightboxBtn = getElem('download-lightbox-btn');

    // Post-it Note Modal
    const postitNoteModal = getElem('postit-note-modal');
    const postitNoteTextarea = getElem('postit-note-textarea');
    const savePostitBtn = getElem('save-postit-icon-btn');
    const deletePostitBtn = getElem('delete-postit-icon-btn');
    const closePostitBtn = getElem('close-postit-icon-btn');

    // Quick note and sub-note elements
    const quickNoteBtn = getElem('quick-note-btn');
    const subNoteModal = getElem('subnote-modal');
    const subNoteTitle = getElem('subnote-title');
    const subNoteEditor = getElem('subnote-editor');
    const subNoteToolbar = getElem('subnote-toolbar');
    const saveCloseSubnoteBtn = getElem('save-close-subnote-btn');
    const saveSubnoteBtn = getElem('save-subnote-btn');
    const cancelSubnoteBtn = getElem('cancel-subnote-btn');
    const toggleSubnoteReadOnlyBtn = getElem('toggle-subnote-readonly-btn');

    // Note style modal elements
    const noteStyleModal = getElem('note-style-modal');
    const noteStyleTabPre = getElem('note-style-tab-pre');
    const noteStyleTabCustom = getElem('note-style-tab-custom');
    const noteStylePre = getElem('note-style-pre');
    const noteStyleCustom = getElem('note-style-custom');
    const noteBgColorInput = getElem('note-bg-color');
    const noteBorderColorInput = getElem('note-border-color');
    const noteRadiusInput = getElem('note-radius');
    const noteBorderWidthInput = getElem('note-border-width');
    const notePaddingInput = getElem('note-padding');
    const noteMarginInput = getElem('note-margin');
    const noteShadowInput = getElem('note-shadow');
    const applyNoteStyleBtn = getElem('apply-note-style-btn');
    const cancelNoteStyleBtn = getElem('cancel-note-style-btn');

    /*
     * Build the simplified toolbar for sub-note editing.  This toolbar intentionally omits
     * certain controls available in the main note editor, such as line height, image
     * insertion from HTML, exporting to HTML, gallery links, collapsible blocks, and
     * creating nested sub-notes.  The sub-note editor retains only basic formatting
     * options like bold, italic, underline, lists, and hyperlink management.
     */
    function setupSubnoteToolbar() {
        if (!subNoteToolbar) return;
        subNoteToolbar.innerHTML = '';

        // Local state for sub-note toolbar color selections
        let savedSubnoteSelection = null;

        // Collapse the current selection so formatting doesn't persist beyond the selected range
        const collapseSelectionSN = () => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const collapsed = range.cloneRange();
                collapsed.collapse(false);
                sel.removeAllRanges();
                sel.addRange(collapsed);
            }
        };

        // Helper to create a toolbar button for sub-note editor
        const createSNButton = (title, content, command, value = null, action = null) => {
            const btn = document.createElement('button');
            btn.className = 'toolbar-btn';
            btn.title = title;
            btn.innerHTML = content;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (command) {
                    document.execCommand(command, false, value);
                    collapseSelectionSN();
                }
                if (action) {
                    action();
                    collapseSelectionSN();
                }
                subNoteEditor.focus();
            });
            return btn;
        };

        const createSNSeparator = () => {
            const sep = document.createElement('div');
            sep.className = 'toolbar-separator';
            return sep;
        };

        // Color palette generator for sub-notes (similar to main editor)
        const createSNColorPalette = (title, action, mainColors, extraColors, iconSVG) => {
            const group = document.createElement('div');
            group.className = 'color-palette-group';
            mainColors.forEach(color => {
                const swatch = document.createElement('button');
                swatch.className = 'color-swatch toolbar-btn';
                if (color === 'transparent') {
                    swatch.style.backgroundImage = 'linear-gradient(to top left, transparent calc(50% - 1px), red, transparent calc(50% + 1px))';
                    swatch.style.backgroundColor = 'var(--bg-secondary)';
                    swatch.title = 'Sin color';
                } else {
                    swatch.style.backgroundColor = color;
                    swatch.title = color;
                }
                swatch.addEventListener('click', (e) => {
                    e.preventDefault();
                    action(color);
                    collapseSelectionSN();
                    subNoteEditor.focus();
                });
                group.appendChild(swatch);
            });
            const otherBtn = document.createElement('button');
            otherBtn.className = 'other-colors-btn toolbar-btn';
            otherBtn.innerHTML = iconSVG;
            otherBtn.title = title;
            group.appendChild(otherBtn);
            const submenu = document.createElement('div');
            submenu.className = 'color-submenu';
            extraColors.forEach(color => {
                const swatch = document.createElement('button');
                swatch.className = 'color-swatch';
                if (color === 'transparent') {
                    swatch.style.backgroundImage = 'linear-gradient(to top left, transparent calc(50% - 1px), red, transparent calc(50% + 1px))';
                    swatch.style.backgroundColor = 'var(--bg-secondary)';
                    swatch.title = 'Sin color';
                } else {
                    swatch.style.backgroundColor = color;
                    swatch.title = color;
                }
                swatch.addEventListener('mousedown', (e) => e.preventDefault());
                swatch.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (savedSubnoteSelection) {
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(savedSubnoteSelection);
                    }
                    action(color);
                    collapseSelectionSN();
                    submenu.classList.remove('visible');
                    savedSubnoteSelection = null;
                    subNoteEditor.focus();
                });
                submenu.appendChild(swatch);
            });
            const customColorLabel = document.createElement('label');
            customColorLabel.className = 'toolbar-btn';
            customColorLabel.title = 'Color personalizado';
            customColorLabel.innerHTML = '🎨';
            const customColorInput = document.createElement('input');
            customColorInput.type = 'color';
            customColorInput.style.width = '0';
            customColorInput.style.height = '0';
            customColorInput.style.opacity = '0';
            customColorInput.style.position = 'absolute';
            customColorLabel.appendChild(customColorInput);
            customColorInput.addEventListener('input', (e) => {
                if (savedSubnoteSelection) {
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(savedSubnoteSelection);
                }
                action(e.target.value);
                collapseSelectionSN();
                savedSubnoteSelection = null;
                subNoteEditor.focus();
            });
            customColorInput.addEventListener('click', (e) => e.stopPropagation());
            submenu.appendChild(customColorLabel);
            group.appendChild(submenu);
            otherBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const selection = window.getSelection();
                if (selection.rangeCount > 0 && subNoteEditor.contains(selection.anchorNode)) {
                    savedSubnoteSelection = selection.getRangeAt(0).cloneRange();
                } else {
                    savedSubnoteSelection = null;
                }
            });
            otherBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
                    if (d !== submenu) d.classList.remove('visible');
                });
                submenu.classList.toggle('visible');
            });
            return group;
        };

        const createSNSymbolDropdown = (symbols, title, icon) => {
            const dropdown = document.createElement('div');
            dropdown.className = 'symbol-dropdown';
            const btn = document.createElement('button');
            btn.className = 'toolbar-btn';
            btn.title = title;
            btn.innerHTML = icon;
            dropdown.appendChild(btn);
            const content = document.createElement('div');
            content.className = 'symbol-dropdown-content';
            const renderSNSyms = () => {
                content.innerHTML = '';
                symbols.forEach((sym) => {
                    const sBtn = createSNButton(sym, sym, 'insertText', sym);
                    sBtn.classList.add('symbol-btn');
                    sBtn.addEventListener('click', () => {
                        content.classList.remove('visible');
                    });
                    content.appendChild(sBtn);
                });
            };
            renderSNSyms();
            dropdown.appendChild(content);
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
                    if (d !== content) d.classList.remove('visible');
                });
                content.classList.toggle('visible');
            });
            return dropdown;
        };

        // Dropdown for adjusting line highlight size (vertical padding)
        const createSNHighlightSizeDropdown = () => {
            const dropdown = document.createElement('div');
            dropdown.className = 'symbol-dropdown';
            const iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down w-4 h-4"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>`;
            const btn = createSNButton('Ajustar altura de destacado', iconSVG, null, null, null);
            dropdown.appendChild(btn);
            const content = document.createElement('div');
            content.className = 'symbol-dropdown-content flex-dropdown';
            content.style.minWidth = '60px';
            const sizes = { 'N': 0, '+1': 1, '+2': 2, '+3': 3, '+4': 4, '+5': 5 };
            const applyBlockVerticalPaddingSN = (level) => {
                const paddingValues = [0, 2, 4, 6, 8, 10];
                const padding = paddingValues[level] || 0;
                const blocks = getSelectedBlocksSN();
                blocks.forEach(block => {
                    if (block && subNoteEditor.contains(block)) {
                        block.style.paddingTop = `${padding}px`;
                        block.style.paddingBottom = `${padding}px`;
                    }
                });
            };
            for (const [name, value] of Object.entries(sizes)) {
                const sizeBtn = document.createElement('button');
                sizeBtn.className = 'toolbar-btn';
                sizeBtn.textContent = name;
                sizeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    applyBlockVerticalPaddingSN(value);
                    content.classList.remove('visible');
                    subNoteEditor.focus();
                });
                content.appendChild(sizeBtn);
            }
            dropdown.appendChild(content);
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
                    if (d !== content) d.classList.remove('visible');
                });
                content.classList.toggle('visible');
            });
            return dropdown;
        };

        // Begin constructing toolbar
        // Basic formatting
        subNoteToolbar.appendChild(createSNButton('Negrita', '<b>B</b>', 'bold'));
        subNoteToolbar.appendChild(createSNButton('Cursiva', '<i>I</i>', 'italic'));
        subNoteToolbar.appendChild(createSNButton('Subrayado', '<u>U</u>', 'underline'));
        subNoteToolbar.appendChild(createSNButton('Tachado', '<s>S</s>', 'strikeThrough'));
        subNoteToolbar.appendChild(createSNButton('Superíndice', 'X²', 'superscript'));
        // Erase format
        const eraserSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eraser w-5 h-5"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21H7Z"/><path d="M22 21H7"/><path d="m5 12 5 5"/></svg>`;
        subNoteToolbar.appendChild(createSNButton('Borrar formato', eraserSVG, 'removeFormat'));
        // Font size selector
        const selectSNSize = document.createElement('select');
        selectSNSize.className = 'toolbar-select';
        selectSNSize.title = 'Tamaño de letra';
        const sizePlaceholder = document.createElement('option');
        sizePlaceholder.value = "";
        sizePlaceholder.textContent = 'Ajustar tamaño';
        sizePlaceholder.disabled = true;
        sizePlaceholder.selected = true;
        selectSNSize.appendChild(sizePlaceholder);
        const sizeValues = { 'Muy Pequeño': '1', 'Pequeño': '2', 'Normal': '3', 'Grande': '5', 'Muy Grande': '6' };
        for (const [name, value] of Object.entries(sizeValues)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = name;
            selectSNSize.appendChild(option);
        }
        selectSNSize.addEventListener('change', () => {
            if (selectSNSize.value) {
                document.execCommand('fontSize', false, selectSNSize.value);
                selectSNSize.selectedIndex = 0;
                subNoteEditor.focus();
            }
        });
        subNoteToolbar.appendChild(selectSNSize);

        // Line height selector
        const selectSNLineHeight = document.createElement('select');
        selectSNLineHeight.className = 'toolbar-select';
        selectSNLineHeight.title = 'Interlineado';
        const lhPlaceholder = document.createElement('option');
        lhPlaceholder.value = "";
        lhPlaceholder.textContent = 'Interlineado';
        lhPlaceholder.disabled = true;
        lhPlaceholder.selected = true;
        selectSNLineHeight.appendChild(lhPlaceholder);
        const lineHeights = { 'Grande': '2.0', 'Normal': '', 'Pequeño': '1.4', 'Muy Pequeño': '1.2', 'Extremo Pequeño': '1.0' };
        for (const [name, value] of Object.entries(lineHeights)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = name;
            selectSNLineHeight.appendChild(option);
        }
        selectSNLineHeight.addEventListener('change', () => {
            const value = selectSNLineHeight.value;
            if (value !== null) {
                const elements = getSelectedBlocksSN();
                if (elements.length > 0) {
                    elements.forEach(block => {
                        if (block && subNoteEditor.contains(block)) {
                            block.style.lineHeight = value;
                        }
                    });
                }
                selectSNLineHeight.selectedIndex = 0;
                subNoteEditor.focus();
            }
        });
        subNoteToolbar.appendChild(selectSNLineHeight);
        subNoteToolbar.appendChild(createSNSeparator());
        // Color palettes (text, highlight, line highlight)
        const textColors = ['#000000'];
        const extraTextColors = ['#FF0000', '#0000FF', '#008000', '#FFA500', '#FFFF00', '#800080', '#FFC0CB', '#00FFFF', '#00008B', '#8B0000', '#FF8C00', '#FFD700', '#ADFF2F', '#4B0082', '#48D1CC', '#191970', '#A52A2A', '#F0E68C', '#ADD8E6', '#DDA0DD', '#90EE90', '#FA8072'];
        const highlightColors = ['#FAFAD2'];
        const extraHighlightColors = ['transparent', '#FFFFFF', '#FFFF00', '#ADD8E6', '#F0FFF0', '#FFF0F5', '#F5FFFA', '#F0F8FF', '#E6E6FA', '#FFF5EE', '#FAEBD7', '#FFE4E1', '#FFFFE0', '#D3FFD3', '#B0E0E6', '#FFB6C1', '#F5DEB3', '#C8A2C8', '#FFDEAD', '#E0FFFF', '#FDF5E6', '#FFFACD', '#F8F8FF', '#D3D3D3', '#A9A9A9', '#696969', '#C4A484', '#A0522D', '#8B4513'];
        const applySubnoteForeColor = (color) => document.execCommand('foreColor', false, color);
        const applySubnoteHiliteColor = (color) => document.execCommand('hiliteColor', false, color);
        // Helper to get selected block elements within the sub-note editor
        const getSelectedBlocksSN = () => {
            const selection = window.getSelection();
            if (!selection.rangeCount) return [];
            const range = selection.getRangeAt(0);
            let commonAncestor = range.commonAncestorContainer;
            if (!subNoteEditor.contains(commonAncestor)) return [];
            let startNode = range.startContainer;
            let endNode = range.endContainer;
            const findBlock = (node) => {
                while (node && node !== subNoteEditor) {
                    if (node.nodeType === 1 && getComputedStyle(node).display !== 'inline') {
                        return node;
                    }
                    node = node.parentNode;
                }
                return startNode.nodeType === 1 ? startNode : startNode.parentNode;
            };
            let startBlock = findBlock(startNode);
            let endBlock = findBlock(endNode);
            if (startBlock === endBlock) {
                return [startBlock];
            }
            const allBlocks = Array.from(subNoteEditor.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, li, blockquote, pre, details'));
            const startIndex = allBlocks.indexOf(startBlock);
            const endIndex = allBlocks.indexOf(endBlock);
            if (startIndex !== -1 && endIndex !== -1) {
                return allBlocks.slice(startIndex, endIndex + 1);
            }
            return [startBlock];
        };
        const applySubnoteLineHighlight = (color) => {
            let elements = getSelectedBlocksSN();
            if (elements.length === 0 || (elements.length === 1 && !elements[0])) {
                document.execCommand('formatBlock', false, 'p');
                elements = getSelectedBlocksSN();
            }
            elements.forEach((block, index) => {
                if (block && subNoteEditor.contains(block)) {
                    if (color === 'transparent') {
                        block.style.backgroundColor = '';
                        block.style.paddingLeft = '';
                        block.style.paddingRight = '';
                        block.style.borderTopLeftRadius = '';
                        block.style.borderTopRightRadius = '';
                        block.style.borderBottomLeftRadius = '';
                        block.style.borderBottomRightRadius = '';
                    } else {
                        block.style.backgroundColor = color;
                        block.style.paddingLeft = '6px';
                        block.style.paddingRight = '6px';
                        const first = index === 0;
                        const last = index === elements.length - 1;
                        block.style.borderTopLeftRadius = first ? '6px' : '0';
                        block.style.borderTopRightRadius = first ? '6px' : '0';
                        block.style.borderBottomLeftRadius = last ? '6px' : '0';
                        block.style.borderBottomRightRadius = last ? '6px' : '0';
                    }
                }
            });
        };
        const typeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-type w-4 h-4"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>`;
        const highlighterIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-highlighter w-4 h-4"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`;
        const subTextPalette = createSNColorPalette('Color de Texto', applySubnoteForeColor, textColors, extraTextColors, typeIcon);
        const subHighlightPalette = createSNColorPalette('Color de Resaltado', applySubnoteHiliteColor, highlightColors, extraHighlightColors, highlighterIcon);
        const subLineHighlightPalette = createSNColorPalette('Color de fondo de línea', applySubnoteLineHighlight, ['#FFFFFF'], extraHighlightColors.concat(highlightColors), highlighterIcon);
        subNoteToolbar.appendChild(subTextPalette);
        subNoteToolbar.appendChild(subHighlightPalette);
        subNoteToolbar.appendChild(subLineHighlightPalette);
        // Highlight size dropdown
        subNoteToolbar.appendChild(createSNHighlightSizeDropdown());
        // Horizontal rule
        subNoteToolbar.appendChild(createSNButton('Insertar línea separadora', '—', 'insertHorizontalRule'));
        subNoteToolbar.appendChild(createSNSeparator());
        // Indent/outdent
        const outdentSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-indent-decrease w-5 h-5"><polyline points="7 8 3 12 7 16"/><line x1="21" x2="3" y1="12" y2="12"/><line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="3" y1="18" y2="18"/></svg>`;
        const indentSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-indent-increase w-5 h-5"><polyline points="17 8 21 12 17 16"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="17" y1="6" y2="6"/><line x1="3" x2="17" y1="18" y2="18"/></svg>`;
        subNoteToolbar.appendChild(createSNButton('Disminuir sangría', outdentSVG, 'outdent'));
        subNoteToolbar.appendChild(createSNButton('Aumentar sangría', indentSVG, 'indent'));
        // Collapsible list item
        const collapsibleListSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-tree w-5 h-5"><path d="M21 7H9"/><path d="M21 12H9"/><path d="M21 17H9"/><path d="M3 17v-6a4 4 0 0 1 4-4h4"/></svg>`;
        const collapsibleListHTML = `<details class="collapsible-list"><summary>Elemento</summary><div>Texto...<br></div></details><p><br></p>`;
        subNoteToolbar.appendChild(createSNButton('Insertar lista colapsable', collapsibleListSVG, 'insertHTML', collapsibleListHTML));

        subNoteToolbar.appendChild(createSNButton('Insertar HTML', '&lt;/&gt;', null, null, () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                savedEditorSelection = selection.getRangeAt(0).cloneRange();
            } else {
                savedEditorSelection = null;
            }
            currentHtmlEditor = subNoteEditor;
            openHtmlCodeModal();
        }));

        subNoteToolbar.appendChild(createSNButton('Ver HTML del seleccionado', '&lt;HTML&gt;', null, null, () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                showAlert('No hay selección para mostrar.');
                return;
            }
            const range = selection.getRangeAt(0);
            const container = document.createElement('div');
            container.appendChild(range.cloneContents());
            selectedHtmlOutput.value = container.innerHTML;
            currentHtmlEditor = subNoteEditor;
            showModal(selectedHtmlModal);
            setTimeout(() => selectedHtmlOutput.select(), 0);
        }));

        subNoteToolbar.appendChild(createSNSeparator());
        // Symbols and special characters
        const symbols = ["💡", "⚠️", "📌", "📍", "✴️", "🟢", "🟡", "🔴", "✅", "☑️", "❌", "➡️", "⬅️", "➔", "👉", "↳", "▪️", "▫️", "🔵", "🔹", "🔸", "➕", "➖", "📂", "📄", "📝", "📋", "📎", "🔑", "📈", "📉", "🩺", "💉", "💊", "🩸", "🧪", "🔬", "🩻", "🦠"];
        subNoteToolbar.appendChild(createSNSymbolDropdown(symbols, 'Insertar Símbolo', '📌'));
        const specialChars = ['∞','±','≈','•','‣','↑','↓','→','←','↔','⇧','⇩','⇨','⇦','↗','↘','↙','↖'];
        subNoteToolbar.appendChild(createSNSymbolDropdown(specialChars, 'Caracteres Especiales', 'Ω'));
        // Image from URL
        subNoteToolbar.appendChild(createSNButton('Insertar Imagen desde URL', '🖼️', null, null, () => {
            const url = prompt('Ingresa la URL de la imagen:');
            if (url) {
                subNoteEditor.focus();
                document.execCommand('insertImage', false, url);
            }
        }));
        // Gallery link insertion
        const gallerySVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-gallery-horizontal-end w-5 h-5"><path d="M2 7v10"/><path d="M6 5v14"/><rect width="12" height="18" x="10" y="3" rx="2"/></svg>`;
        subNoteToolbar.appendChild(createSNButton('Crear Galería de Imágenes', gallerySVG, null, null, () => {
            // Capture selection for gallery range
            const selection = window.getSelection();
            if (selection.rangeCount > 0 && subNoteEditor.contains(selection.anchorNode)) {
                activeGalleryRange = selection.getRangeAt(0).cloneRange();
            } else {
                activeGalleryRange = null;
            }
            openGalleryLinkEditor();
        }));
        // Insert hyperlink and remove hyperlink
        subNoteToolbar.appendChild(createSNButton('Insertar enlace', '🔗', null, null, () => {
            const url = prompt('Ingresa la URL:');
            if (url) {
                document.execCommand('createLink', false, url);
            }
        }));
        subNoteToolbar.appendChild(createSNButton('Quitar enlace', '❌', 'unlink'));
        // Resize image buttons
        subNoteToolbar.appendChild(createSNButton('Aumentar tamaño de imagen (+10%)', '➕', null, null, () => resizeSelectedImage(1.1)));
        subNoteToolbar.appendChild(createSNButton('Disminuir tamaño de imagen (-10%)', '➖', null, null, () => resizeSelectedImage(0.9)));
        subNoteToolbar.appendChild(createSNSeparator());
        // Print (save as PDF) within subnote editor
        subNoteToolbar.appendChild(createSNButton('Imprimir o Guardar como PDF', '💾', null, null, () => {
            const printArea = getElem('print-area');
            printArea.innerHTML = `<div>${subNoteEditor.innerHTML}</div>`;
            window.print();
        }));
    }
    // Initialize sub-note toolbar on load
    setupSubnoteToolbar();

    // Save and close sub-note
    if (saveCloseSubnoteBtn) {
        saveCloseSubnoteBtn.addEventListener('click', () => {
            if (activeSubnoteLink && currentNotesArray[activeNoteIndex]) {
                const subnoteId = activeSubnoteLink.dataset.subnoteId || activeSubnoteLink.dataset.postitId;
                if (!currentNotesArray[activeNoteIndex].postits) {
                    currentNotesArray[activeNoteIndex].postits = {};
                }
                currentNotesArray[activeNoteIndex].postits[subnoteId] = {
                    title: subNoteTitle.textContent.trim(),
                    content: subNoteEditor.innerHTML
                };
                // Persist changes to note
                saveCurrentNote();
            }
            hideModal(subNoteModal);
            activeSubnoteLink = null;
        });
    }

    // Save sub-note without closing the modal
    if (saveSubnoteBtn) {
        saveSubnoteBtn.addEventListener('click', () => {
            if (activeSubnoteLink && currentNotesArray[activeNoteIndex]) {
                const subnoteId = activeSubnoteLink.dataset.subnoteId || activeSubnoteLink.dataset.postitId;
                if (!currentNotesArray[activeNoteIndex].postits) {
                    currentNotesArray[activeNoteIndex].postits = {};
                }
                currentNotesArray[activeNoteIndex].postits[subnoteId] = {
                    title: subNoteTitle.textContent.trim(),
                    content: subNoteEditor.innerHTML
                };
                saveCurrentNote();
            }
            // Do not close the modal, keep editing
        });
    }

    // Close sub-note without saving
    if (cancelSubnoteBtn) {
        cancelSubnoteBtn.addEventListener('click', () => {
            hideModal(subNoteModal);
            activeSubnoteLink = null;
        });
    }

    // Toggle read-only mode for sub-notes
    if (toggleSubnoteReadOnlyBtn) {
        toggleSubnoteReadOnlyBtn.addEventListener('click', () => {
            const modalContent = subNoteModal.querySelector('.notes-modal-content');
            modalContent.classList.toggle('readonly-mode');
            const isReadOnly = modalContent.classList.contains('readonly-mode');
            subNoteEditor.contentEditable = !isReadOnly;
            subNoteTitle.contentEditable = !isReadOnly;
            if (!isReadOnly) {
                subNoteEditor.focus();
            }
        });
    }

    // Attach quick note button handler: opens the sticky note modal for a single note associated with the main note
    if (quickNoteBtn) {
        quickNoteBtn.addEventListener('click', () => {
            // Ensure there is a current note to attach quick note to
            if (!currentNotesArray || currentNotesArray.length === 0) return;
            editingQuickNote = true;
            const noteData = currentNotesArray[activeNoteIndex] || {};
            postitNoteTextarea.value = noteData.quickNote || '';
            showModal(postitNoteModal);
            postitNoteTextarea.focus();
        });
    }

    // --- State Variables ---
    let activeStatusFilter = 'all';
    let activeNoteIcon = null;
    let selectedImageForResize = null;
    let saveTimeout;
    let activeReferencesCell = null;
    let activeIconPickerButton = null;
    let currentNotesArray = [];
    let activeNoteIndex = 0;
    let isResizing = false;
    let resolveConfirmation;
    let activeGalleryRange = null;
    let lightboxImages = [];
    let currentLightboxIndex = 0;
    let currentNoteRow = null;
    let activeSubnoteLink = null;
    let currentInlineNoteIcon = 'ℹ️';
    let editingQuickNote = false;
    let savedEditorSelection = null;
    let currentCallout = null;
    let aiToolsGeneratedText = '';
    let lineEraseMode = false;

    // Image selection handling within the sub-note editor
    if (subNoteEditor) {
        subNoteEditor.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG') {
                subNoteEditor.querySelectorAll('img').forEach(img => img.classList.remove('selected-for-resize'));
                e.target.classList.add('selected-for-resize');
                selectedImageForResize = e.target;
            } else {
                subNoteEditor.querySelectorAll('img').forEach(img => img.classList.remove('selected-for-resize'));
                selectedImageForResize = null;
            }
        });
    }

    notesEditor.addEventListener('click', (e) => {
        if (!lineEraseMode) return;
        const block = e.target.closest('p, h1, h2, h3, h4, h5, h6, div, li, blockquote, pre, details');
        if (block && notesEditor.contains(block)) {
            block.innerHTML = '<br>';
        }
    });

    // ------------------------------------------------------------------------
    // Icon Manager and Character Manager Functions
    //
    // The icon manager allows users to add or remove emojis from the default
    // suggested list (EMOJI_CATEGORIES['Sugeridos']).  A plus/gear button in
    // the icon picker opens this manager.  Icons are displayed without
    // deletion controls in the normal picker; deletion is only possible
    // through the manager modal.  Character manager logic is similar but
    // operates on the globalSpecialChars array.

    /**
     * Render the current list of icons into the icon manager modal.  Each
     * entry shows the emoji and a small × button for deletion.  Icons are
     * sourced from both the default suggested list and the user-defined
     * customIconsList.
     */
    function renderIconManager() {
        if (!currentIcons) return;
        currentIcons.innerHTML = '';
        // Merge default and custom icons; duplicates are not filtered.
        const icons = EMOJI_CATEGORIES['Sugeridos'];
        icons.forEach((icon, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'relative inline-flex items-center justify-center m-1';
            const span = document.createElement('span');
            span.textContent = icon;
            span.className = 'text-2xl';
            wrapper.appendChild(span);
            const delBtn = document.createElement('button');
            delBtn.textContent = '×';
            delBtn.title = 'Eliminar icono';
            delBtn.className = 'absolute -top-1 -right-1 text-red-500 text-xs';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Remove this icon from the list
                EMOJI_CATEGORIES['Sugeridos'].splice(index, 1);
                renderIconManager();
                // If the removed icon came from customIconsList, also remove it there
                const customIndex = customIconsList.indexOf(icon);
                if (customIndex > -1) customIconsList.splice(customIndex, 1);
                // Refresh the emoji grid if we are currently on the suggested tab
                if (selectedIconCategory === 'Sugeridos') {
                    loadEmojisForCategory('Sugeridos');
                }
            });
            wrapper.appendChild(delBtn);
            currentIcons.appendChild(wrapper);
        });
    }

    /**
     * Render the current list of special characters into the character
     * manager modal.  Similar to icon manager but acts on the global
     * special character array.  Each character can be removed or new
     * characters can be added.
     */
    function renderCharManager() {
        if (!currentChars) return;
        currentChars.innerHTML = '';
        globalSpecialChars.forEach((char, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'relative inline-flex items-center justify-center m-1';
            const span = document.createElement('span');
            span.textContent = char;
            span.className = 'text-xl';
            wrapper.appendChild(span);
            const delBtn = document.createElement('button');
            delBtn.textContent = '×';
            delBtn.title = 'Eliminar carácter';
            delBtn.className = 'absolute -top-1 -right-1 text-red-500 text-xs';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                globalSpecialChars.splice(index, 1);
                renderCharManager();
            });
            wrapper.appendChild(delBtn);
            currentChars.appendChild(wrapper);
        });
    }

    // Open icon manager modal
    if (openIconManagerBtn) {
        openIconManagerBtn.addEventListener('click', () => {
            // Ensure the combined list includes custom icons appended to the default
            EMOJI_CATEGORIES['Sugeridos'] = defaultSuggestedIcons.concat(customIconsList);
            renderIconManager();
            showModal(iconManagerModal);
        });
    }
    // Close icon manager modal
    if (closeIconManagerBtn) {
        closeIconManagerBtn.addEventListener('click', () => {
            hideModal(iconManagerModal);
            // Update the picker if the suggested tab is active
            if (selectedIconCategory === 'Sugeridos') {
                loadEmojisForCategory('Sugeridos');
            }
        });
    }
    // Add new icon from manager
    if (addNewIconBtn) {
        addNewIconBtn.addEventListener('click', () => {
            const val = newIconInputManager.value.trim();
            if (!val) return;
            // Push into custom list and update suggested list
            customIconsList.push(val);
            EMOJI_CATEGORIES['Sugeridos'] = defaultSuggestedIcons.concat(customIconsList);
            newIconInputManager.value = '';
            renderIconManager();
            // Refresh the emoji grid if needed
            if (selectedIconCategory === 'Sugeridos') {
                loadEmojisForCategory('Sugeridos');
            }
        });
    }

    // Open character manager modal when user clicks the char manager gear.
    // Currently there is no dedicated open button in the UI; you can create
    // one if desired.  For demonstration purposes, we bind it to the icon
    // manager open button when the user holds Shift.
    if (openIconManagerBtn && charManagerModal) {
        openIconManagerBtn.addEventListener('dblclick', (e) => {
            e.preventDefault();
            renderCharManager();
            showModal(charManagerModal);
        });
    }
    if (closeCharManagerBtn) {
        closeCharManagerBtn.addEventListener('click', () => hideModal(charManagerModal));
    }
    if (addNewCharBtn) {
        addNewCharBtn.addEventListener('click', () => {
            const val = newCharInputManager.value.trim();
            if (!val) return;
            globalSpecialChars.push(val);
            newCharInputManager.value = '';
            renderCharManager();
        });
    }

    // ----------------------------------------------------------------------
    // Floating Image Insertion and Dragging
    //
    // These helper functions allow inserting an image into the editor with
    // floating alignment (left or right).  The image is wrapped in a figure
    // with a class that sets float and margins so that text flows around it.
    // The figure is draggable within the bounds of the notes editor but
    // remains outside of the contenteditable context (contentEditable=false).

    /**
     * Insert a floating image at the current selection.  The image will be
     * wrapped in a figure element with classes .float-image and .float-left
     * or .float-right, depending on the align parameter.  The selection is
     * collapsed after insertion so that typing resumes after the image.
     * @param {string} url The URL of the image to insert
     * @param {string} align Either 'left' or 'right'
     */
    function insertFloatingImageAtSelection(url, align = 'left') {
        const fig = document.createElement('figure');
        fig.className = `float-image float-${align}`;
        fig.contentEditable = 'false';
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        fig.appendChild(img);
        // Insert the figure at the current caret position
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(fig);
            // Insert a paragraph break after the figure so the user can type below
            const spacer = document.createTextNode('\u00A0');
            fig.parentNode.insertBefore(spacer, fig.nextSibling);
            // Move caret after spacer
            const newRange = document.createRange();
            newRange.setStartAfter(spacer);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
        // Focus back to editor
        notesEditor.focus();
    }

    /**
     * Enable dragging for a floating image (figure element).  The figure is
     * positioned relative to its parent and can be dragged within the
     * boundaries of the notesEditor.  Dragging is done by mouse events on
     * the figure itself and the document.
     * @param {HTMLElement} fig The figure element containing the image
     */
    function enableDragForFloatingImage(fig) {
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;
        let startLeft = 0;
        let startTop = 0;
        let startMarginLeft = 0;
        let startMarginTop = 0;
        // Use relative positioning so that text flows around normally
        fig.style.position = fig.style.position || 'relative';
        fig.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = fig.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            // Record starting positions and margins
            startLeft = rect.left;
            startTop = rect.top;
            const computed = window.getComputedStyle(fig);
            startMarginLeft = parseFloat(computed.marginLeft) || 0;
            startMarginTop = parseFloat(computed.marginTop) || 0;
            // Temporarily absolute to allow free dragging
            fig.style.position = 'absolute';
            fig.style.left = rect.left + window.scrollX + 'px';
            fig.style.top = rect.top + window.scrollY + 'px';
            fig.style.zIndex = '1000';
            // Prevent text selection while dragging
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            // Move figure with cursor, bounded to editor container
            const editorRect = notesEditor.getBoundingClientRect();
            let left = e.clientX - offsetX;
            let top = e.clientY - offsetY;
            // Constrain within editor
            left = Math.max(editorRect.left, Math.min(left, editorRect.right - fig.offsetWidth));
            top = Math.max(editorRect.top, Math.min(top, editorRect.bottom - fig.offsetHeight));
            fig.style.left = `${left}px`;
            fig.style.top = `${top}px`;
        });
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                // Calculate delta movement relative to starting position
                const rect = fig.getBoundingClientRect();
                const deltaX = (rect.left - startLeft);
                const deltaY = (rect.top - startTop);
                // Restore relative positioning and apply margins
                fig.style.position = 'relative';
                fig.style.left = '';
                fig.style.top = '';
                fig.style.zIndex = '';
                fig.style.marginLeft = (startMarginLeft + deltaX) + 'px';
                fig.style.marginTop = (startMarginTop + deltaY) + 'px';
            }
        });
    }

    /**
     * Envuelve la imagen seleccionada o actualmente seleccionada para redimensionar
     * dentro de un contenedor figure flotante. Si la imagen ya está envuelta,
     * simplemente actualiza la alineación. Se inserta un espacio no separable
     * después de la figura para evitar que el hipervínculo/selección continúe.
     * @param {string} align 'left' o 'right'
     */
    function wrapSelectedImage(align = 'left') {
        // La imagen puede estar en selectedImageForResize (al ser clicada) o en la selección actual
        let img = selectedImageForResize;
        if (!img) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
                let node = sel.getRangeAt(0).startContainer;
                if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
                if (node.tagName === 'IMG') {
                    img = node;
                } else if (node.querySelector) {
                    const found = node.querySelector('img');
                    if (found) img = found;
                }
            }
        }
        if (!img) {
            // Si no se encuentra imagen, mostrar un mensaje sutil usando nuestro modal de alerta
            alertMessage.textContent = 'Selecciona primero una imagen para aplicar el estilo cuadrado.';
            alertTitle.textContent = 'Imagen no seleccionada';
            showModal(alertModal);
            return;
        }
        // Si ya está en un figure flotante, actualiza la clase de alineación
        const existingFig = img.closest('figure.float-image');
        if (existingFig) {
            existingFig.classList.remove('float-left', 'float-right');
            existingFig.classList.add(`float-${align}`);
            return;
        }
        // Crear figure y mover la imagen dentro
        const fig = document.createElement('figure');
        fig.className = `float-image float-${align}`;
        fig.contentEditable = 'false';
        img.parentNode.insertBefore(fig, img);
        fig.appendChild(img);
        // Insertar espacio NBSP para que el cursor siga después del figure
        const spacer = document.createTextNode('\u00A0');
        fig.parentNode.insertBefore(spacer, fig.nextSibling);
        // Actualizar selección de imagen para redimensionar
        selectedImageForResize = img;
    }

    /**
     * Wraps at least two selected images in a flex container so they appear side by side.
     */
    function wrapSelectedImagesSideBySide() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const contents = range.cloneContents();
        const imgCount = contents.querySelectorAll('img').length;
        if (imgCount < 2) {
            alertMessage.textContent = 'Selecciona al menos dos imágenes para alinearlas en fila.';
            alertTitle.textContent = 'Imágenes insuficientes';
            showModal(alertModal);
            return;
        }
        const fragment = range.extractContents();
        const div = document.createElement('div');
        div.className = 'image-row';
        div.appendChild(fragment);
        // Replace paragraphs containing only an image with the image itself
        div.querySelectorAll('p').forEach(p => {
            if (p.childElementCount === 1 && p.firstElementChild.tagName === 'IMG') {
                div.replaceChild(p.firstElementChild, p);
            }
        });
        range.insertNode(div);
        // Move caret after the inserted container
        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.setStartAfter(div);
        newRange.collapse(true);
        sel.addRange(newRange);
        notesEditor.focus();
    }

    // When loading a note into the editor, ensure any existing floating
    // images become draggable again.  This runs after setting the editor's
    // innerHTML in loadNoteIntoEditor().
    const originalLoadNoteIntoEditor = loadNoteIntoEditor;
    loadNoteIntoEditor = function(index) {
        // Reutilizamos la implementación original sin habilitar arrastre para imágenes flotantes
        originalLoadNoteIntoEditor(index);
    };

    // ----------------------------------------------------------------------
    // Table size selector grid
    //
    // showTableGrid displays a floating 10x10 grid near the toolbar button
    // that triggered it.  Hovering over cells highlights a selection of
    // rows/cols; clicking inserts a table of that size.  The grid hides on
    // selection or when clicking outside of it.

    /**
     * Show the table size selection grid near the specified button element.
     * @param {HTMLElement} buttonEl The toolbar button that triggered the grid
     */
    function showTableGrid(buttonEl) {
        if (!tableGridEl) return;
        // Si ya estamos insertando una tabla, no mostrar otra vez la cuadrícula
        if (isInsertingTable) return;
        // Position the grid below the button
        const rect = buttonEl.getBoundingClientRect();
        tableGridEl.style.left = `${rect.left + window.scrollX}px`;
        tableGridEl.style.top = `${rect.bottom + window.scrollY + 4}px`;
        // Mostrar la cuadrícula inicializada en la posición adecuada
        tableGridEl.classList.remove('hidden');
        // Cuando el usuario haga clic fuera, ocultar la cuadrícula
        const hideHandler = (ev) => {
            if (!tableGridEl.contains(ev.target) && !buttonEl.contains(ev.target)) {
                hideTableGrid();
                document.removeEventListener('click', hideHandler);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', hideHandler);
        }, 0);
    }

    /**
     * Hide the table size selection grid and clear highlights.
     */
    function hideTableGrid() {
        if (!tableGridEl) return;
        tableGridEl.classList.add('hidden');
        tableGridEl.querySelectorAll('.cell').forEach(cell => cell.classList.remove('highlight'));
    }

    /**
     * Insert a table with the specified number of rows and columns.  After
     * insertion, initialize column resizers and row/column editing controls.
     * @param {number} rows Number of rows
     * @param {number} cols Number of columns
     */
    function insertTableWithDimensions(rows, cols) {
        // Establecer flag para evitar inserciones múltiples en cascada
        if (isInsertingTable) return;
        isInsertingTable = true;
        // Construir la tabla como elemento DOM en lugar de usar execCommand.
        const table = document.createElement('table');
        table.className = 'resizable-table';
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';
        for (let r = 0; r < rows; r++) {
            const tr = document.createElement('tr');
            for (let c = 0; c < cols; c++) {
                const td = document.createElement('td');
                td.style.border = '1px solid var(--border-color)';
                td.style.padding = '4px';
                td.style.minWidth = '30px';
                td.innerHTML = '&nbsp;';
                td.contentEditable = true;
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
        // Insertar la tabla en la posición actual del cursor mediante Range
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.collapse(true);
            range.deleteContents();
            range.insertNode(table);
            // Insertar un salto de línea después de la tabla para permitir continuar escribiendo
            const br = document.createElement('p');
            br.innerHTML = '<br>';
            table.parentNode.insertBefore(br, table.nextSibling);
            // Colocar el cursor después del nuevo párrafo
            const newRange = document.createRange();
            newRange.setStart(br, 0);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
        // Inicializar redimensionadores y controles tras un breve tiempo
        setTimeout(() => {
            initTableResize(table);
            enableTableEditing(table);
            // Liberar flag de inserción
            isInsertingTable = false;
        }, 50);
    }

    /**
     * Enable advanced table editing features on the given table.  When the user
     * hovers over a cell, controls for inserting or deleting rows/columns
     * appear.  Resizing columns is handled by initTableResize().
     * @param {HTMLTableElement} table
     */
    function enableTableEditing(table) {
        if (!table) return;
        table.addEventListener('mouseover', (e) => {
            const cell = e.target.closest('td, th');
            if (!cell || !table.contains(cell)) return;
            showRowColControls(table, cell);
        });
    }

    /**
     * Remove any existing row/column controls from the document.
     */
    function removeTableControls() {
        document.querySelectorAll('.table-insert-row-btn, .table-insert-col-btn, .table-delete-row-btn, .table-delete-col-btn').forEach(btn => btn.remove());
    }

    /**
     * Display controls to insert or delete rows and columns based on the
     * hovered cell.  Controls are appended to the document body and
     * absolutely positioned relative to the cell.
     * @param {HTMLTableElement} table
     * @param {HTMLTableCellElement} cell
     */
    function showRowColControls(table, cell) {
        removeTableControls();
        const rowIndex = cell.parentElement.rowIndex;
        const colIndex = cell.cellIndex;
        const cellRect = cell.getBoundingClientRect();
        // Insert row button (+) below the cell
        const insertRowBtn = document.createElement('button');
        insertRowBtn.textContent = '+';
        insertRowBtn.title = 'Insertar fila debajo';
        insertRowBtn.className = 'table-insert-row-btn toolbar-btn';
        insertRowBtn.style.position = 'absolute';
        insertRowBtn.style.left = `${cellRect.left + cellRect.width / 2 - 8 + window.scrollX}px`;
        insertRowBtn.style.top = `${cellRect.bottom - 8 + window.scrollY}px`;
        insertRowBtn.addEventListener('click', () => {
            const newRow = table.insertRow(rowIndex + 1);
            for (let i = 0; i < table.rows[0].cells.length; i++) {
                const newCell = newRow.insertCell();
                newCell.contentEditable = true;
                newCell.style.border = '1px solid var(--border-color)';
                newCell.style.padding = '4px';
            }
            // After inserting, re-add resizers and controls
            initTableResize(table);
            removeTableControls();
        });
        document.body.appendChild(insertRowBtn);
        // Insert column button (+) to the right of the cell
        const insertColBtn = document.createElement('button');
        insertColBtn.textContent = '+';
        insertColBtn.title = 'Insertar columna a la derecha';
        insertColBtn.className = 'table-insert-col-btn toolbar-btn';
        insertColBtn.style.position = 'absolute';
        insertColBtn.style.left = `${cellRect.right - 8 + window.scrollX}px`;
        insertColBtn.style.top = `${cellRect.top + cellRect.height / 2 - 8 + window.scrollY}px`;
        insertColBtn.addEventListener('click', () => {
            Array.from(table.rows).forEach(row => {
                const newCell = row.insertCell(colIndex + 1);
                newCell.contentEditable = true;
                newCell.style.border = '1px solid var(--border-color)';
                newCell.style.padding = '4px';
            });
            initTableResize(table);
            removeTableControls();
        });
        document.body.appendChild(insertColBtn);
        // Delete row button (×) above the cell
        const deleteRowBtn = document.createElement('button');
        deleteRowBtn.textContent = '×';
        deleteRowBtn.title = 'Eliminar fila';
        deleteRowBtn.className = 'table-delete-row-btn toolbar-btn';
        deleteRowBtn.style.position = 'absolute';
        deleteRowBtn.style.left = `${cellRect.left + cellRect.width / 2 - 8 + window.scrollX}px`;
        deleteRowBtn.style.top = `${cellRect.top - 16 + window.scrollY}px`;
        deleteRowBtn.addEventListener('click', () => {
            table.deleteRow(rowIndex);
            removeTableControls();
        });
        document.body.appendChild(deleteRowBtn);
        // Delete column button (×) to the left of the cell
        const deleteColBtn = document.createElement('button');
        deleteColBtn.textContent = '×';
        deleteColBtn.title = 'Eliminar columna';
        deleteColBtn.className = 'table-delete-col-btn toolbar-btn';
        deleteColBtn.style.position = 'absolute';
        deleteColBtn.style.left = `${cellRect.left - 16 + window.scrollX}px`;
        deleteColBtn.style.top = `${cellRect.top + cellRect.height / 2 - 8 + window.scrollY}px`;
        deleteColBtn.addEventListener('click', () => {
            Array.from(table.rows).forEach(row => {
                if (row.cells.length > colIndex) {
                    row.deleteCell(colIndex);
                }
            });
            initTableResize(table);
            removeTableControls();
        });
        document.body.appendChild(deleteColBtn);
    }

    // Zoom state for image lightbox
    let currentZoom = 1;
    const zoomStep = 0.25;
    const maxZoom = 3;
    const minZoom = 0.5;
    // Keeps track of the gallery link that opened the lightbox so that caption edits can be persisted
    let activeGalleryLinkForLightbox = null;


    const grandTotalSpans = {
        references: getElem('total-references'),
        lectura: getElem('total-lectura')
    };
    const grandPercentSpans = {
        lectura: getElem('percent-lectura')
    };
    const progressRings = {
        lectura: document.getElementById('progress-ring-lectura'),
    };
    
    const sections = {};
    document.querySelectorAll('[data-section-header]').forEach(headerEl => {
        const headerRow = headerEl;
        const sectionName = headerRow.dataset.sectionHeader;
        sections[sectionName] = {
            headerRow,
            totalRow: getElem(`total-row-${sectionName}`)
        };
    });

    const EMOJI_CATEGORIES = {
        'Sugeridos': ['🔗', '📄', '📹', '🖼️', '💡', '📌', '✅', '⭐', '📖', '📚'],
        'Símbolos': ['✅', '☑️', '❌', '➡️', '⬅️', '➕', '➖', '❓', '❕', '❤️', '💔', '🔥', '💯', '⚠️', '⬆️', '⬇️'],
        'Objetos': ['🔗', '📄', '📝', '📋', '📎', '🔑', '📈', '📉', '💡', '📌', '📖', '📚', '💻', '🖱️', '📱', '📹', '🎥', '🎬', '📺', '🖼️', '🎨', '📷'],
        'Medicina': ['🩺', '💉', '💊', '🩸', '🧪', '🔬', '🩻', '🦠', '🧬', '🧠', '❤️‍🩹', '🦴', '🫀', '🫁'],
        'Personas': ['🧑‍⚕️', '👨‍⚕️', '👩‍⚕️', '🧑‍🏫', '👨‍🏫', '👩‍🏫', '🤔', '🧐', '👍', '👎', '💪', '👈', '👉', '👆', '👇'],
    };

    // Initialize customizable icon and character lists after EMOJI_CATEGORIES is defined.
    // At this point EMOJI_CATEGORIES is available, so we can safely copy its
    // suggested category.  We also set up the array for user-added icons and
    // default special characters for character insertion.  These variables
    // were declared earlier with let.
    defaultSuggestedIcons = Array.isArray(EMOJI_CATEGORIES['Sugeridos']) ? [...EMOJI_CATEGORIES['Sugeridos']] : [];
    customIconsList = [];
    globalSpecialChars = ['∞','±','≈','•','‣','↑','↓','→','←','↔','⇧','⇩','⇨','⇦','↗','↘','↙','↖'];
    
    // --- Core Logic Functions ---

    function formatBytes(bytes, decimals = 2) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    function renderReferencesCell(cell) {
        const row = cell.closest('tr');
        if (!row) return;

        cell.innerHTML = '';
        const container = document.createElement('div');
        container.className = 'references-container';

        const references = JSON.parse(row.dataset.references || '[]');
        
        if (references.length > 0) {
            references.forEach(ref => {
                if (ref.url && ref.icon) {
                    const link = document.createElement('a');
                    link.href = ref.url;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.className = 'reference-icon-link';
                    link.title = ref.url;
                    link.innerHTML = ref.icon;
                    link.addEventListener('click', e => e.stopPropagation()); // Prevent opening modal
                    container.appendChild(link);
                }
            });
        } else {
            const addIcon = document.createElement('span');
            addIcon.className = 'add-reference-icon toolbar-btn';
            addIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>`;
            addIcon.title = 'Añadir referencia';
            container.appendChild(addIcon);
        }
        cell.appendChild(container);
    }
    
    function createLecturaCellContent() {
        const fragment = document.createDocumentFragment();
        const container = document.createElement('div');
        container.className = 'flex items-center justify-center space-x-2';
        
        const counterSpan = document.createElement('span');
        counterSpan.className = 'lectura-counter';
        counterSpan.textContent = '0';

        const noteIconSvg = `<svg class="solid-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 15.25z" clip-rule="evenodd" /></svg><svg class="outline-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>`;

        const noteIcon = document.createElement('span');
        noteIcon.className = 'note-icon';
        noteIcon.dataset.noteType = 'topic';
        noteIcon.title = 'Notas del tema';
        noteIcon.innerHTML = noteIconSvg;

        container.appendChild(counterSpan);
        container.appendChild(noteIcon);
        fragment.appendChild(container);
        return fragment;
    }
    
    function initializeCells() {
        document.querySelectorAll('td.references-cell').forEach(cell => {
            renderReferencesCell(cell);
        });

        document.querySelectorAll('td.lectura-cell[data-col="lectura"]').forEach(cellEl => {
            cellEl.innerHTML = '';
            cellEl.appendChild(createLecturaCellContent());
        });

        document.querySelectorAll('tr[data-topic-id] td:nth-child(2)').forEach((td) => {
            const topicTextSpan = document.createElement('span');
            topicTextSpan.className = 'topic-text';
            while (td.firstChild) {
                topicTextSpan.appendChild(td.firstChild);
            }
            td.innerHTML = ''; // Clear td before appending
            td.appendChild(topicTextSpan);
            
            const confidenceContainer = document.createElement('span');
            confidenceContainer.className = 'ml-2 inline-flex items-center align-middle';
            const confidenceDot = document.createElement('span');
            confidenceDot.className = 'confidence-dot';
            confidenceDot.dataset.confidenceLevel = '0';
            confidenceDot.title = "Nivel de confianza";
            confidenceContainer.appendChild(confidenceDot);
            td.appendChild(confidenceContainer);
        });
    }

    function getSelectedBlockElements() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return [];

        const range = selection.getRangeAt(0);
        let commonAncestor = range.commonAncestorContainer;
        if (!notesEditor.contains(commonAncestor)) return [];
        
        let startNode = range.startContainer;
        let endNode = range.endContainer;

        const findBlock = (node) => {
             while (node && node !== notesEditor) {
                if (node.nodeType === 1 && getComputedStyle(node).display !== 'inline') {
                    return node;
                }
                node = node.parentNode;
            }
            return startNode.nodeType === 1 ? startNode : startNode.parentNode;
        };
        
        let startBlock = findBlock(startNode);
        let endBlock = findBlock(endNode);

        if (startBlock === endBlock) {
             return [startBlock];
        }

        const allBlocks = Array.from(notesEditor.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, li, blockquote, pre, details'));
        const startIndex = allBlocks.indexOf(startBlock);
        const endIndex = allBlocks.indexOf(endBlock);

        if (startIndex !== -1 && endIndex !== -1) {
            return allBlocks.slice(startIndex, endIndex + 1);
        }

        return [startBlock]; // Fallback
    }
    
    function setupEditorToolbar() {
        editorToolbar.innerHTML = ''; // Clear existing toolbar

        // Utility to collapse the current selection so formatting doesn't persist beyond the selected range
        const collapseSelection = (editor) => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                // Collapse to the end of the current range
                const collapsed = range.cloneRange();
                collapsed.collapse(false);
                sel.removeAllRanges();
                sel.addRange(collapsed);
            }
        };

        const createButton = (title, content, command, value = null, action = null) => {
            const btn = document.createElement('button');
            btn.className = 'toolbar-btn';
            btn.title = title;
            btn.innerHTML = content;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (command) {
                    document.execCommand(command, false, value);
                    // Collapse the selection after applying the command
                    collapseSelection(notesEditor);
                }
                if (action) {
                    action();
                    // Collapse again after custom actions
                    collapseSelection(notesEditor);
                }
                notesEditor.focus();
            });
            return btn;
        };

        const createSeparator = () => {
            const sep = document.createElement('div');
            sep.className = 'toolbar-separator';
            return sep;
        };
        
        const createColorPalette = (title, action, mainColors, extraColors, iconSVG) => {
            const group = document.createElement('div');
            group.className = 'color-palette-group';
            
            mainColors.forEach(color => {
                const swatch = document.createElement('button');
                swatch.className = 'color-swatch toolbar-btn';
                 if (color === 'transparent') {
                    swatch.style.backgroundImage = 'linear-gradient(to top left, transparent calc(50% - 1px), red, transparent calc(50% + 1px))';
                    swatch.style.backgroundColor = 'var(--bg-secondary)';
                    swatch.title = 'Sin color';
                } else {
                    swatch.style.backgroundColor = color;
                    swatch.title = color;
                }
                swatch.addEventListener('click', (e) => {
                    e.preventDefault();
                    action(color);
                });
                group.appendChild(swatch);
            });
            
            const otherBtn = document.createElement('button');
            otherBtn.className = 'other-colors-btn toolbar-btn';
            otherBtn.innerHTML = iconSVG;
            otherBtn.title = title;
            group.appendChild(otherBtn);

            const submenu = document.createElement('div');
            submenu.className = 'color-submenu';
            extraColors.forEach(color => {
                const swatch = document.createElement('button');
                swatch.className = 'color-swatch';
                if (color === 'transparent') {
                    swatch.style.backgroundImage = 'linear-gradient(to top left, transparent calc(50% - 1px), red, transparent calc(50% + 1px))';
                    swatch.style.backgroundColor = 'var(--bg-secondary)';
                    swatch.title = 'Sin color';
                } else {
                    swatch.style.backgroundColor = color;
                    swatch.title = color;
                }
                swatch.addEventListener('mousedown', (e) => e.preventDefault());
            swatch.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (savedEditorSelection) {
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(savedEditorSelection);
                    }
                    action(color);
                    // Collapse the selection so the color is applied only once
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        const collapsed = range.cloneRange();
                        collapsed.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(collapsed);
                    }
                    submenu.classList.remove('visible');
                    savedEditorSelection = null;
                    notesEditor.focus();
                });
                submenu.appendChild(swatch);
            });

            const customColorLabel = document.createElement('label');
            customColorLabel.className = 'toolbar-btn';
            customColorLabel.title = 'Color personalizado';
            customColorLabel.innerHTML = '🎨';
            const customColorInput = document.createElement('input');
            customColorInput.type = 'color';
            customColorInput.style.width = '0';
            customColorInput.style.height = '0';
            customColorInput.style.opacity = '0';
            customColorInput.style.position = 'absolute';

            customColorLabel.appendChild(customColorInput);
            
            customColorInput.addEventListener('input', (e) => {
                if (savedEditorSelection) {
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(savedEditorSelection);
                }
                action(e.target.value);
                // Collapse selection after custom color apply
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    const collapsed = range.cloneRange();
                    collapsed.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(collapsed);
                }
                savedEditorSelection = null;
                notesEditor.focus();
            });
             customColorInput.addEventListener('click', (e) => e.stopPropagation());
            submenu.appendChild(customColorLabel);

            group.appendChild(submenu);
            
            otherBtn.addEventListener('mousedown', (e) => {
                 e.preventDefault();
                 const selection = window.getSelection();
                 if (selection.rangeCount > 0 && notesEditor.contains(selection.anchorNode)) {
                     savedEditorSelection = selection.getRangeAt(0).cloneRange();
                 } else {
                     savedEditorSelection = null;
                 }
            });

            otherBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
                    if (d !== submenu) d.classList.remove('visible');
                });
                submenu.classList.toggle('visible');
            });
            
            return group;
        };

        const createSymbolDropdown = (symbols, title, icon) => {
            const dropdown = document.createElement('div');
            dropdown.className = 'symbol-dropdown';
            const btn = document.createElement('button');
            btn.className = 'toolbar-btn';
            btn.title = title;
            btn.innerHTML = icon;
            dropdown.appendChild(btn);
            const content = document.createElement('div');
            content.className = 'symbol-dropdown-content';
            // Render symbols list without deletion or add buttons.  The
            // administración de caracteres se gestiona en el panel de
            // configuración y no desde este menú desplegable.
            const renderSymbols = () => {
                content.innerHTML = '';
                symbols.forEach((sym) => {
                    const symBtn = createButton(sym, sym, 'insertText', sym);
                    symBtn.classList.add('symbol-btn');
                    symBtn.addEventListener('click', () => {
                        content.classList.remove('visible');
                    });
                    content.appendChild(symBtn);
                });
            };
            renderSymbols();
            dropdown.appendChild(content);
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const otherOpen = document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible');
                otherOpen.forEach(d => {
                    if (d !== content) d.classList.remove('visible');
                });
                content.classList.toggle('visible');
            });
            return dropdown;
        };

        // Font size selector
        const selectSize = document.createElement('select');
        selectSize.className = 'toolbar-select';
        selectSize.title = 'Tamaño de letra';
        
        const placeholderOption = document.createElement('option');
        placeholderOption.value = "";
        placeholderOption.textContent = "Ajustar tamaño";
        placeholderOption.disabled = true;
        placeholderOption.selected = true;
        selectSize.appendChild(placeholderOption);

        const sizes = { 'Muy Pequeño': '1', 'Pequeño': '2', 'Normal': '3', 'Grande': '5', 'Muy Grande': '6' };
        for (const [name, value] of Object.entries(sizes)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = name;
            selectSize.appendChild(option);
        }
        selectSize.addEventListener('change', () => {
            if (selectSize.value) {
                document.execCommand('fontSize', false, selectSize.value);
                selectSize.selectedIndex = 0; // Reset to placeholder
                notesEditor.focus();
            }
        });
        editorToolbar.appendChild(selectSize);

        // Line height selector
        const selectLineHeight = document.createElement('select');
        selectLineHeight.className = 'toolbar-select';
        selectLineHeight.title = 'Interlineado';

        const lineHeightPlaceholder = document.createElement('option');
        lineHeightPlaceholder.value = "";
        lineHeightPlaceholder.textContent = "Interlineado";
        lineHeightPlaceholder.disabled = true;
        lineHeightPlaceholder.selected = true;
        selectLineHeight.appendChild(lineHeightPlaceholder);
        
        const orderedLineHeights = {
            'Grande': '2.0',
            'Normal': '',
            'Pequeño': '1.4',
            'Muy Pequeño': '1.2',
            'Extremo Pequeño': '1.0'
        };

        for (const [name, value] of Object.entries(orderedLineHeights)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = name;
            selectLineHeight.appendChild(option);
        }

        selectLineHeight.addEventListener('change', () => {
            const value = selectLineHeight.value;
            if (value !== null) {
                const elements = getSelectedBlockElements();
                if (elements.length > 0) {
                    elements.forEach(block => {
                        if (block && notesEditor.contains(block)) {
                            block.style.lineHeight = value;
                        }
                    });
                }
                selectLineHeight.selectedIndex = 0; // Reset to placeholder
                notesEditor.focus();
            }
        });
        editorToolbar.appendChild(selectLineHeight);


        editorToolbar.appendChild(createSeparator());

        // Basic formatting
        editorToolbar.appendChild(createButton('Negrita', '<b>B</b>', 'bold'));
        editorToolbar.appendChild(createButton('Cursiva', '<i>I</i>', 'italic'));
        editorToolbar.appendChild(createButton('Subrayado', '<u>U</u>', 'underline'));
        editorToolbar.appendChild(createButton('Tachado', '<s>S</s>', 'strikeThrough'));
        editorToolbar.appendChild(createButton('Superíndice', 'X²', 'superscript'));
        editorToolbar.appendChild(createButton('Deshacer', '↺', 'undo'));
        editorToolbar.appendChild(createButton('Rehacer', '↻', 'redo'));

        const eraserSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eraser w-5 h-5"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21H7Z"/><path d="M22 21H7"/><path d="m5 12 5 5"/></svg>`;
        editorToolbar.appendChild(createButton('Borrar formato', eraserSVG, 'removeFormat'));

        editorToolbar.appendChild(createSeparator());

        // --- Color Palettes ---
        const textColors = ['#000000'];
        const extraTextColors = ['#FF0000', '#0000FF', '#008000', '#FFA500', '#FFFF00', '#800080', '#FFC0CB', '#00FFFF', '#00008B', '#8B0000', '#FF8C00', '#FFD700', '#ADFF2F', '#4B0082', '#48D1CC', '#191970', '#A52A2A', '#F0E68C', '#ADD8E6', '#DDA0DD', '#90EE90', '#FA8072'];
        const highlightColors = ['#FAFAD2']; // Pastel yellow
        const extraHighlightColors = ['transparent', '#FFFFFF', '#FFFF00', '#ADD8E6', '#F0FFF0', '#FFF0F5', '#F5FFFA', '#F0F8FF', '#E6E6FA', '#FFF5EE', '#FAEBD7', '#FFE4E1', '#FFFFE0', '#D3FFD3', '#B0E0E6', '#FFB6C1', '#F5DEB3', '#C8A2C8', '#FFDEAD', '#E0FFFF', '#FDF5E6', '#FFFACD', '#F8F8FF', '#D3D3D3', '#A9A9A9', '#696969', '#C4A484', '#A0522D', '#8B4513'];
        
        const applyForeColor = (color) => document.execCommand('foreColor', false, color);
        const applyHiliteColor = (color) => document.execCommand('hiliteColor', false, color);
        
        const applyLineHighlight = (color) => {
            let elements = getSelectedBlockElements();
            if (elements.length === 0 || (elements.length === 1 && !elements[0])) {
                document.execCommand('formatBlock', false, 'p');
                elements = getSelectedBlockElements();
            }
            elements.forEach((block, index) => {
                if (block && notesEditor.contains(block)) {
                    if (color === 'transparent') {
                        // Remove highlight and reset borders and margins on clear
                        block.style.backgroundColor = '';
                        block.style.paddingLeft = '';
                        block.style.paddingRight = '';
                        block.style.marginTop = '';
                        block.style.marginBottom = '';
                        block.style.borderTopLeftRadius = '';
                        block.style.borderTopRightRadius = '';
                        block.style.borderBottomLeftRadius = '';
                        block.style.borderBottomRightRadius = '';
                    } else {
                        block.style.backgroundColor = color;
                        block.style.paddingLeft = '6px';
                        block.style.paddingRight = '6px';
                        // Remove default margins to fuse adjacent highlighted lines
                        block.style.marginTop = '0px';
                        block.style.marginBottom = '0px';
                        // Set border radius based on position in selection
                        const first = index === 0;
                        const last = index === elements.length - 1;
                        block.style.borderTopLeftRadius = first ? '6px' : '0';
                        block.style.borderTopRightRadius = first ? '6px' : '0';
                        block.style.borderBottomLeftRadius = last ? '6px' : '0';
                        block.style.borderBottomRightRadius = last ? '6px' : '0';
                    }
                }
            });
        };

        const typeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-type w-4 h-4"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>`;
        const highlighterIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-highlighter w-4 h-4"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`;

        const textPalette = createColorPalette('Color de Texto', applyForeColor, textColors, extraTextColors, typeIcon);
        editorToolbar.appendChild(textPalette);

        const highlightPalette = createColorPalette('Color de Resaltado', applyHiliteColor, highlightColors, extraHighlightColors, highlighterIcon);
        editorToolbar.appendChild(highlightPalette);
        
        const lineHighlightPalette = createColorPalette('Color de fondo de línea', applyLineHighlight, ['#FFFFFF'], extraHighlightColors.concat(highlightColors), highlighterIcon);
        editorToolbar.appendChild(lineHighlightPalette);

        const applyBlockVerticalPadding = (level) => {
            const paddingValues = [0, 2, 4, 6, 8, 10];
            const padding = paddingValues[level] || 0;
            const blocks = getSelectedBlockElements();
            blocks.forEach(block => {
                if (block && notesEditor.contains(block)) {
                    block.style.paddingTop = `${padding}px`;
                    block.style.paddingBottom = `${padding}px`;
                }
            });
        };
        
        const createHighlightSizeDropdown = () => {
            const dropdown = document.createElement('div');
            dropdown.className = 'symbol-dropdown';
    
            const iconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down w-4 h-4"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>`;
            const btn = createButton('Ajustar altura de destacado', iconSVG, null, null, null);
            dropdown.appendChild(btn);
    
            const content = document.createElement('div');
            content.className = 'symbol-dropdown-content flex-dropdown';
            content.style.minWidth = '60px';
    
            const sizes = { 'N': 0, '+1': 1, '+2': 2, '+3': 3, '+4': 4, '+5': 5 };
    
            for (const [name, value] of Object.entries(sizes)) {
                const sizeBtn = document.createElement('button');
                sizeBtn.className = 'toolbar-btn';
                sizeBtn.textContent = name;
                sizeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    applyBlockVerticalPadding(value);
                    content.classList.remove('visible');
                    notesEditor.focus();
                });
                content.appendChild(sizeBtn);
            }
            dropdown.appendChild(content);
    
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
                    if (d !== content) d.classList.remove('visible');
                });
                content.classList.toggle('visible');
            });
    
            return dropdown;
        };
        
        editorToolbar.appendChild(createHighlightSizeDropdown());

        const hrBtn = createButton('Insertar línea separadora', '—', 'insertHorizontalRule');
        editorToolbar.appendChild(hrBtn);
        editorToolbar.appendChild(createSeparator());

        const outdentSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-indent-decrease w-5 h-5"><polyline points="7 8 3 12 7 16"/><line x1="21" x2="3" y1="12" y2="12"/><line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="3" y1="18" y2="18"/></svg>`;
        const indentSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-indent-increase w-5 h-5"><polyline points="17 8 21 12 17 16"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="17" y1="6" y2="6"/><line x1="3" x2="17" y1="18" y2="18"/></svg>`;
        editorToolbar.appendChild(createButton('Disminuir sangría', outdentSVG, 'outdent'));
        editorToolbar.appendChild(createButton('Aumentar sangría', indentSVG, 'indent'));

        const insertBlankLineAbove = () => {
            let blocks = getSelectedBlockElements();
            if (blocks.length === 0) {
                document.execCommand('formatBlock', false, 'p');
                blocks = getSelectedBlockElements();
            }
            const first = blocks[0];
            if (first && notesEditor.contains(first)) {
                const tag = first.tagName === 'LI' ? 'li' : 'p';
                const blank = document.createElement(tag);
                blank.innerHTML = '<br>';
                first.parentNode.insertBefore(blank, first);
            }
        };

        editorToolbar.appendChild(createButton('Insertar línea en blanco arriba', '⬆️⏎', null, null, insertBlankLineAbove));

        const eraseLineBtn = createButton('Borrar contenido con clic', '🧹', null, null, () => {
            lineEraseMode = !lineEraseMode;
            notesEditor.style.cursor = lineEraseMode ? 'crosshair' : '';
            eraseLineBtn.classList.toggle('active', lineEraseMode);
        });
        editorToolbar.appendChild(eraseLineBtn);

        const collapsibleListSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-tree w-5 h-5"><path d="M21 7H9"/><path d="M21 12H9"/><path d="M21 17H9"/><path d="M3 17v-6a4 4 0 0 1 4-4h4"/></svg>`;
        const collapsibleListHTML = `<details class="collapsible-list"><summary>Elemento</summary><div>Texto...<br></div></details><p><br></p>`;

        editorToolbar.appendChild(createButton('Insertar lista colapsable', collapsibleListSVG, 'insertHTML', collapsibleListHTML));

        const htmlCodeBtn = createButton('Insertar HTML', '&lt;/&gt;', null, null, () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                savedEditorSelection = selection.getRangeAt(0).cloneRange();
            } else {
                savedEditorSelection = null;
            }
            currentHtmlEditor = notesEditor;
            openHtmlCodeModal();
        });
        editorToolbar.appendChild(htmlCodeBtn);

        const viewHtmlBtn = createButton('Ver HTML del seleccionado', '&lt;HTML&gt;', null, null, () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                showAlert('No hay selección para mostrar.');
                return;
            }
            const range = selection.getRangeAt(0);
            const container = document.createElement('div');
            container.appendChild(range.cloneContents());
            selectedHtmlOutput.value = container.innerHTML;
            currentHtmlEditor = notesEditor;
            showModal(selectedHtmlModal);
            setTimeout(() => selectedHtmlOutput.select(), 0);
        });
        editorToolbar.appendChild(viewHtmlBtn);

        const enableLeftResize = (el) => {
            const threshold = 5;
            let resizing = false;
            let startX = 0;
            let startWidth = 0;
            let startMargin = 0;

            const onHover = (e) => {
                if (resizing) return;
                const rect = el.getBoundingClientRect();
                if (e.clientX - rect.left <= threshold) {
                    el.style.cursor = 'ew-resize';
                } else {
                    el.style.cursor = '';
                }
            };

            const onMouseDown = (e) => {
                const rect = el.getBoundingClientRect();
                if (e.clientX - rect.left <= threshold) {
                    resizing = true;
                    startX = e.clientX;
                    startWidth = el.offsetWidth;
                    startMargin = parseFloat(getComputedStyle(el).marginLeft) || 0;
                    document.addEventListener('mousemove', onDrag);
                    document.addEventListener('mouseup', onStop);
                    e.preventDefault();
                }
            };

            const onDrag = (e) => {
                if (!resizing) return;
                const dx = e.clientX - startX;
                const newWidth = Math.max(30, startWidth - dx);
                el.style.width = newWidth + 'px';
                el.style.marginLeft = startMargin + dx + 'px';
            };

            const onStop = () => {
                if (!resizing) return;
                resizing = false;
                el.style.cursor = '';
                document.removeEventListener('mousemove', onDrag);
                document.removeEventListener('mouseup', onStop);
            };

            el.addEventListener('mousemove', onHover);
            el.addEventListener('mousedown', onMouseDown);
            el._leftResizeHandlers = { onHover, onMouseDown, onDrag, onStop };
        };

        const disableLeftResize = (el) => {
            const h = el._leftResizeHandlers;
            if (!h) return;
            el.removeEventListener('mousemove', h.onHover);
            el.removeEventListener('mousedown', h.onMouseDown);
            document.removeEventListener('mousemove', h.onDrag);
            document.removeEventListener('mouseup', h.onStop);
            el.style.cursor = '';
            delete el._leftResizeHandlers;
        };

        const calloutBtn = createButton('Nota', '💬', null, null, () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                savedEditorSelection = selection.getRangeAt(0).cloneRange();
            } else {
                savedEditorSelection = null;
            }
            openNoteStyleModal();
        });
        editorToolbar.appendChild(calloutBtn);

        const resizeCalloutBtn = createButton('Redimensionar nota', '↔️', null, null, () => {
            const selection = window.getSelection();
            const node = selection && selection.focusNode;
            const element = node ? (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) : null;
            const block = element ? element.closest('.note-callout, div, blockquote') : null;
            if (!block || block === notesEditor) {
                showAlert('Selecciona un bloque para redimensionar.');
                return;
            }
            block.classList.toggle('note-resizable');
            if (block.classList.contains('note-resizable')) {
                block.style.width = block.offsetWidth + 'px';
                enableLeftResize(block);
            } else {
                block.style.width = '';
                block.style.marginLeft = '';
                disableLeftResize(block);
            }
        });
        editorToolbar.appendChild(resizeCalloutBtn);

        const subnoteSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-pen-line w-5 h-5"><path d="m18 12-4 4-1 4 4-1 4-4"/><path d="M12 22h6"/><path d="M7 12h10"/><path d="M5 17h10"/><path d="M5 7h10"/><path d="M15 2H9a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/></svg>`;
        // El botón ahora crea una sub-nota en lugar de un Post-it
        editorToolbar.appendChild(createButton('Añadir Sub-nota', subnoteSVG, null, null, createSubnoteLink));

        const inlineNoteBtn = createButton('Insertar nota en línea', currentInlineNoteIcon, null, null, insertInlineNoteIcon);
        editorToolbar.appendChild(inlineNoteBtn);

        // Selector de iconos predefinidos para las notas en línea
        const inlineIconSelect = document.createElement('select');
        inlineIconSelect.className = 'toolbar-select';
        ['ℹ️','❓','💡','🔖','⁎','🧩','🗒️'].forEach(icon => {
            const opt = document.createElement('option');
            opt.value = icon;
            opt.textContent = icon;
            inlineIconSelect.appendChild(opt);
        });
        inlineIconSelect.value = currentInlineNoteIcon;
        inlineIconSelect.addEventListener('change', () => {
            currentInlineNoteIcon = inlineIconSelect.value;
            inlineNoteBtn.textContent = currentInlineNoteIcon;
        });
        editorToolbar.appendChild(inlineIconSelect);

        const aiBtn = createButton('Asistente de IA', '🤖', null, null, openAiToolsModal);
        editorToolbar.appendChild(aiBtn);
        const aiImproveBtn = createButton('Mejorar redacción', '✨', null, null, () => openAiToolsModalWithInstruction('Mejora la redacción del siguiente texto y corrige errores gramaticales'));
        editorToolbar.appendChild(aiImproveBtn);
        const aiSummarizeBtn = createButton('Resumir texto', '📝', null, null, () => openAiToolsModalWithInstruction('Resume el siguiente texto'));
        editorToolbar.appendChild(aiSummarizeBtn);
        const aiExpandBtn = createButton('Expandir contenido', '➕', null, null, () => openAiToolsModalWithInstruction('Amplía el contenido del siguiente texto utilizando tu conocimiento'));
        editorToolbar.appendChild(aiExpandBtn);
        editorToolbar.appendChild(createSeparator());

        // Image controls
        // Floating image insertion: prompt the user for a URL and orientation,
        // then insert the image as a floating figure (left or right) so that
        // text wraps around it.  After insertion, enable drag to reposition
        // the figure within the editor.
        // Imagen flotante: en lugar de solicitar una URL, este botón aplica
        // el estilo de imagen flotante "cuadrado" a la imagen seleccionada.
        // Si la imagen aún no está envuelta en un figure, se envuelve y se
        // alinea a la izquierda por defecto. En siguientes clics se alterna
        // entre izquierda y derecha para facilitar el flujo de texto.
        const floatImageBtn = document.createElement('button');
        floatImageBtn.className = 'toolbar-btn';
        floatImageBtn.title = 'Aplicar estilo de imagen cuadrada';
        floatImageBtn.innerHTML = '🖼️';
        let lastFloatAlign = 'left';
        floatImageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Determine next alignment (toggle left/right)
            lastFloatAlign = lastFloatAlign === 'left' ? 'right' : 'left';
            wrapSelectedImage(lastFloatAlign);
            notesEditor.focus();
        });
        editorToolbar.appendChild(floatImageBtn);

        const sideBySideBtn = createButton('Alinear imágenes en fila', '🖼️🖼️', null, null, wrapSelectedImagesSideBySide);
        editorToolbar.appendChild(sideBySideBtn);

        const gallerySVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-gallery-horizontal-end w-5 h-5"><path d="M2 7v10"/><path d="M6 5v14"/><rect width="12" height="18" x="10" y="3" rx="2"/></svg>`;
        editorToolbar.appendChild(createButton('Crear Galería de Imágenes', gallerySVG, null, null, openGalleryLinkEditor));

        const resizePlusBtn = createButton('Aumentar tamaño de imagen (+10%)', '➕', null, null, () => resizeSelectedImage(1.1));
        editorToolbar.appendChild(resizePlusBtn);

        const resizeMinusBtn = createButton('Disminuir tamaño de imagen (-10%)', '➖', null, null, () => resizeSelectedImage(0.9));
        editorToolbar.appendChild(resizeMinusBtn);

        // Eliminamos el botón de inserción de tablas y el separador asociado

        // Print/Save
        const printBtn = createButton('Imprimir o Guardar como PDF', '💾', null, null, () => {
             const printArea = getElem('print-area');
             printArea.innerHTML = `<div>${notesEditor.innerHTML}</div>`;
             window.print();
        });
        editorToolbar.appendChild(printBtn);

        editorToolbar.appendChild(createSeparator());

        // Symbols
        const symbols = ["💡", "⚠️", "📌", "📍", "✴️", "🟢", "🟡", "🔴", "✅", "☑️", "❌", "➡️", "⬅️", "➔", "👉", "↳", "▪️", "▫️", "🔵", "🔹", "🔸", "➕", "➖", "📂", "📄", "📝", "📋", "📎", "🔑", "📈", "📉", "🩺", "💉", "💊", "🩸", "🧪", "🔬", "🩻", "🦠"];
        editorToolbar.appendChild(createSymbolDropdown(symbols, 'Insertar Símbolo', '📌'));

        const specialChars = ['∞','±','≈','•','‣','↑','↓','→','←','↔','⇧','⇩','⇨','⇦','↗','↘','↙','↖'];
        editorToolbar.appendChild(createSymbolDropdown(specialChars, 'Caracteres Especiales', 'Ω'));
    }

    function rgbToHex(rgb) {
        const result = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(rgb);
        return result ? '#' + result.slice(1).map(n => ('0' + parseInt(n).toString(16)).slice(-2)).join('') : rgb;
    }

    function openNoteStyleModal(callout = null) {
        currentCallout = callout;
        noteStyleModal.classList.add('visible');
        noteStyleTabPre.classList.add('border-b-2', 'border-blue-500');
        noteStyleTabCustom.classList.remove('border-b-2', 'border-blue-500');
        noteStylePre.classList.remove('hidden');
        noteStyleCustom.classList.add('hidden');
        if (callout) {
            noteBgColorInput.value = rgbToHex(callout.style.backgroundColor || '#ffffff');
            noteBorderColorInput.value = rgbToHex(callout.style.borderColor || '#000000');
            noteRadiusInput.value = parseInt(callout.style.borderRadius) || 8;
            noteBorderWidthInput.value = parseInt(callout.style.borderWidth) || 2;
            notePaddingInput.value = parseInt(callout.style.padding) || 8;
            noteMarginInput.value = parseInt(callout.style.marginTop) || 8;
            noteShadowInput.checked = callout.classList.contains('note-shadow');
        }
    }

    function closeNoteStyleModal() {
        noteStyleModal.classList.remove('visible');
        currentCallout = null;
    }

    function applyNoteStyle(opts) {
        const PREDEF_CLASSES = ['note-blue','note-green','note-yellow','note-red','note-purple','note-gray'];
        if (!currentCallout) {
            const callout = document.createElement('div');
            callout.className = 'note-callout';
            callout.setAttribute('role','note');
            callout.setAttribute('aria-label','Nota');
            if (savedEditorSelection && !savedEditorSelection.collapsed) {
                try {
                    savedEditorSelection.surroundContents(callout);
                } catch (e) {
                    callout.textContent = savedEditorSelection.toString();
                    savedEditorSelection.deleteContents();
                    savedEditorSelection.insertNode(callout);
                }
            } else if (savedEditorSelection) {
                callout.textContent = 'Escribe una nota...';
                savedEditorSelection.insertNode(callout);
            } else {
                callout.textContent = 'Escribe una nota...';
                notesEditor.appendChild(callout);
            }
            currentCallout = callout;
        }
        currentCallout.classList.remove(...PREDEF_CLASSES);
        if (opts.presetClass) currentCallout.classList.add(opts.presetClass);
        currentCallout.style.backgroundColor = opts.backgroundColor;
        currentCallout.style.borderColor = opts.borderColor;
        currentCallout.style.borderWidth = opts.borderWidth + 'px';
        currentCallout.style.borderRadius = opts.borderRadius + 'px';
        currentCallout.style.padding = opts.padding + 'px';
        currentCallout.style.margin = opts.margin + 'px 0';
        if (opts.shadow) {
            currentCallout.classList.add('note-shadow');
        } else {
            currentCallout.classList.remove('note-shadow');
        }
        const range = document.createRange();
        range.selectNodeContents(currentCallout);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        notesEditor.focus();
        closeNoteStyleModal();
    }

    function openAiToolsModal() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && notesEditor.contains(selection.anchorNode)) {
            savedEditorSelection = selection.getRangeAt(0).cloneRange();
        } else {
            savedEditorSelection = null;
        }
        aiToolsInput.value = '';
        aiToolsResponse.textContent = 'Escribe tu instrucción a continuación...';
        aiToolsThinking.textContent = '';
        aiToolsGeneratedText = '';
        insertAiToolsBtn.classList.add('hidden');
        showModal(aiToolsModal);
    }

    function openAiToolsModalWithInstruction(instr) {
        openAiToolsModal();
        aiToolsInput.value = instr;
        aiToolsInput.focus();
    }

    function resizeSelectedImage(multiplier) {
        if (selectedImageForResize) {
            const currentWidth = selectedImageForResize.style.width
                ? parseFloat(selectedImageForResize.style.width)
                : selectedImageForResize.offsetWidth;
            const newWidth = currentWidth * multiplier;
            selectedImageForResize.style.width = `${newWidth}px`;
            selectedImageForResize.style.height = 'auto'; // Keep aspect ratio
        } else {
            showAlert("Por favor, selecciona una imagen primero para cambiar su tamaño.");
        }
    }

    function updateAllTotals() {
        let grandLectura = 0;
        
        const allRows = document.querySelectorAll('tr[data-topic-id]');
        const totalTopics = allRows.length;
        
        allRows.forEach(row => {
            const counter = row.querySelector(`td[data-col="lectura"] .lectura-counter`);
            const count = parseInt(counter?.textContent || '0', 10);
            if (count > 0) {
                grandLectura++;
            }
        });
    
        Object.keys(sections).forEach(sectionName => {
            const sectionRows = document.querySelectorAll(`tr[data-section="${sectionName}"]`);
            const totalRow = sections[sectionName].totalRow;
            if (!totalRow) return;
            const totalRowTds = totalRow.querySelectorAll('td');
            
            let sectionLecturaCount = 0;
            let sectionReferencesCount = 0;
    
            sectionRows.forEach(row => {
                const counter = row.querySelector(`td[data-col="lectura"] .lectura-counter`);
                const count = parseInt(counter?.textContent || '0', 10);
                if (count > 0) sectionLecturaCount++;
    
                const references = JSON.parse(row.dataset.references || '[]');
                if (references.length > 0) {
                    sectionReferencesCount++;
                }
            });
    
            const sectionTotalTopics = sectionRows.length;
    
            if (totalRowTds[1]) totalRowTds[1].textContent = '-'; // References column
            if (totalRowTds[2]) { // Lectura column
                totalRowTds[2].textContent = `${sectionLecturaCount} / ${sectionTotalTopics}`;
                totalRowTds[2].style.fontSize = '0.75rem'; // Make font smaller
            }
        });
        
        grandTotalSpans.references.textContent = '-';
        grandTotalSpans.lectura.textContent = String(grandLectura);
        
        const lecturaPercentage = totalTopics > 0 ? Math.round((grandLectura / totalTopics) * 100) : 0;
        grandPercentSpans.lectura.textContent = `${lecturaPercentage}%`;
            
        const ring = progressRings.lectura;
        if (ring) {
            const radius = ring.r.baseVal.value;
            const circumference = radius * 2 * Math.PI;
            ring.style.strokeDasharray = `${circumference} ${circumference}`;
            const offset = circumference - (lecturaPercentage / 100) * circumference;
            ring.style.strokeDashoffset = String(offset);
        }
        
        const overallPercentage = totalTopics > 0 ? (grandLectura / totalTopics) * 100 : 0;
        progressBar.style.width = overallPercentage + '%';
    }

    function updateSectionHeaderCounts() {
        Object.keys(sections).forEach(sectionName => {
            const sectionRows = document.querySelectorAll(`tr[data-section="${sectionName}"]`);
            const count = sectionRows.length;
            const headerRow = sections[sectionName]?.headerRow;
            if (headerRow) {
                const countElement = headerRow.querySelector('.section-count');
                if (countElement) {
                    countElement.textContent = `(${count})`;
                }
            }
        });
    }

    // --- State Management ---
    function getStateObject() {
        const state = {
            topics: {},
            sections: {},
            settings: {
                theme: document.documentElement.dataset.theme,
                iconStyle: document.documentElement.dataset.iconStyle,
            },
            headers: {}
        };

        document.querySelectorAll('thead th[contenteditable="true"]').forEach((th, i) => {
            state.headers[`h${i}`] = th.innerText;
        });

        document.querySelectorAll('tr[data-topic-id]').forEach(row => {
            const topicId = row.dataset.topicId;
            const notes = JSON.parse(row.dataset.notes || '[]');
            const topicData = {
                notes: notes.map(note => ({ ...note, lastEdited: note.lastEdited || new Date().toISOString() })),
                confidence: row.querySelector('.confidence-dot')?.dataset.confidenceLevel || '0',
                references: JSON.parse(row.dataset.references || '[]'),
                lectura: row.querySelector(`td[data-col="lectura"] .lectura-counter`)?.textContent || '0'
            };
            state.topics[topicId] = topicData;
        });
        
        document.querySelectorAll('tr[data-section-header]').forEach(row => {
            const sectionId = row.dataset.sectionHeader;
            state.sections[sectionId] = {
                isCollapsed: row.classList.contains('collapsed'),
                title: row.querySelector('.section-title').textContent,
                note: row.dataset.sectionNote || ''
            };
        });
        
        return state;
    }

    function _loadStateFromObject(state) {
        if (!state) return;

        if(state.settings) {
            applyTheme(state.settings.theme || 'default');
            applyIconStyle(state.settings.iconStyle || 'solid');
        }

        if(state.headers) {
            document.querySelectorAll('thead th[contenteditable="true"]').forEach((th, i) => {
                if(state.headers[`h${i}`]) th.innerText = state.headers[`h${i}`];
            });
        }
        
        if (state.topics) {
            for (const topicId in state.topics) {
                const row = document.querySelector(`tr[data-topic-id="${topicId}"]`);
                if (!row) continue;
                
                const topicData = state.topics[topicId];
                
                const refCell = row.querySelector('td[data-col="references"]');
                if(refCell && topicData.references) {
                    row.dataset.references = JSON.stringify(topicData.references);
                    renderReferencesCell(refCell);
                }

                const lectCell = row.querySelector('td[data-col="lectura"]');
                const lectCount = topicData.lectura || '0';
                if (lectCell) {
                    const counter = lectCell.querySelector('.lectura-counter');
                    const count = parseInt(lectCount, 10);
                    if (counter) counter.textContent = count;
                    lectCell.classList.toggle('lectura-filled', count > 0);
                }
                
                let notes = topicData.notes || [];

                row.dataset.notes = JSON.stringify(notes);
                const noteIcon = row.querySelector(`.note-icon[data-note-type="topic"]`);
                if(noteIcon) {
                    const hasContent = notes.some(n => n.content && n.content.trim() !== '' && n.content.trim() !== '<p><br></p>');
                    noteIcon.classList.toggle('has-note', hasContent);
                }

                const confidenceDot = row.querySelector('.confidence-dot');
                if (confidenceDot && topicData.confidence) {
                    confidenceDot.dataset.confidenceLevel = topicData.confidence;
                }
            }
        }
        
        if (state.sections) {
            for(const sectionId in state.sections) {
                const sectionData = state.sections[sectionId];
                const headerRow = document.querySelector(`tr[data-section-header="${sectionId}"]`);
                if(headerRow) {
                    if (sectionData.title) headerRow.querySelector('.section-title').textContent = sectionData.title;
                    if (sectionData.note) {
                        headerRow.dataset.sectionNote = sectionData.note;
                        const noteIcon = headerRow.querySelector('.section-note-icon');
                        if (noteIcon) noteIcon.classList.add('has-note');
                    }
                    if (sectionData.isCollapsed) {
                        headerRow.classList.add('collapsed');
                         document.querySelectorAll(`tr[data-section="${sectionId}"]`).forEach(row => {
                            row.style.display = 'none';
                        });
                    }
                }
            }
        }
    }
    
    async function saveState() {
        try {
            const state = getStateObject();
            
            const settingsPromise = db.set('keyvalue', { key: 'settings', value: state.settings });
            const headersPromise = db.set('keyvalue', { key: 'headers', value: state.headers });

            const topicPromises = Object.entries(state.topics).map(([topicId, data]) => 
                db.set('topics', { id: topicId, ...data })
            );
            const sectionPromises = Object.entries(state.sections).map(([sectionId, data]) => 
                db.set('sections', { id: sectionId, ...data })
            );

            await Promise.all([settingsPromise, headersPromise, ...topicPromises, ...sectionPromises]);

            showSaveConfirmation();

        } catch (error) {
            console.error("Error saving state to IndexedDB:", error);
            if (error.name === 'QuotaExceededError') {
                 await showAlert("Error: Se ha excedido la cuota de almacenamiento del navegador. Intenta liberar espacio en disco o reducir el tamaño de las notas.");
            } else {
                 await showAlert("Hubo un error inesperado al guardar tu progreso. Revisa la consola para más detalles.");
            }
        }
    }

    async function loadStateFromDB() {
        try {
            const topics = await db.getAll('topics');
            const sections = await db.getAll('sections');
            const settingsData = await db.get('keyvalue', 'settings');
            const headersData = await db.get('keyvalue', 'headers');

            const state = {
                topics: topics.reduce((acc, topic) => {
                    acc[topic.id] = topic;
                    return acc;
                }, {}),
                sections: sections.reduce((acc, section) => {
                    acc[section.id] = section;
                    return acc;
                }, {}),
                settings: settingsData ? settingsData.value : {},
                headers: headersData ? headersData.value : {}
            };
            
            _loadStateFromObject(state);
        } catch (error) {
            console.error("Error loading state from IndexedDB:", error);
            await showAlert("No se pudo cargar el progreso desde la base de datos local.");
        }
    }

    async function loadState() {
         try {
            await db.connect();
            await loadStateFromDB();
        } catch (error) {
            console.error("Failed to load state:", error);
            await showAlert("No se pudo cargar el progreso. Es posible que deba importar sus datos si los tiene guardados.");
        } finally {
            updateAllTotals();
            updateSectionHeaderCounts();
            filterTable();
        }
    }

    function showModal(modal) {
        modal.classList.add('visible');
    }

    function hideModal(modal) {
        modal.classList.remove('visible');
    }

    function showAlert(message, title = "Aviso") {
        alertTitle.textContent = title;
        alertMessage.textContent = message;
        showModal(alertModal);
        return new Promise(resolve => {
             okAlertBtn.onclick = () => {
                hideModal(alertModal);
                resolve();
             };
        });
    }

    function showConfirmation(message, title = "Confirmar Acción") {
        confirmationTitle.textContent = title;
        confirmationMessage.textContent = message;
        showModal(confirmationModal);
        return new Promise(resolve => {
            resolveConfirmation = resolve;
        });
    }
    
    function showSaveConfirmation() {
        if(saveTimeout) clearTimeout(saveTimeout);
        saveConfirmation.classList.remove('opacity-0');
        saveTimeout = setTimeout(() => {
            saveConfirmation.classList.add('opacity-0');
        }, 2000);
    }

    async function loadHtmlFavorites() {
        const data = await db.get('keyvalue', 'htmlFavorites');
        return data ? data.value : [];
    }

    async function populateHtmlFavorites() {
        const favorites = await loadHtmlFavorites();
        htmlFavoritesList.innerHTML = '';
        favorites.forEach(fav => {
            const btn = document.createElement('button');
            btn.className = 'px-2 py-1 bg-secondary text-text-primary rounded border border-border-color hover:bg-bg-tertiary text-sm';
            btn.textContent = fav.name;
            btn.addEventListener('click', () => {
                htmlCodeInput.value = fav.code;
            });
            htmlFavoritesList.appendChild(btn);
        });
    }

    function openHtmlCodeModal() {
        htmlCodeInput.value = '';
       htmlFavoriteName.value = '';
       populateHtmlFavorites();
       showModal(htmlCodeModal);
       setTimeout(() => htmlCodeInput.focus(), 0);
    }

    insertHtmlBtn.addEventListener('click', () => {
        const html = htmlCodeInput.value;
        if (html) {
            if (savedEditorSelection) {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(savedEditorSelection);
            }
            document.execCommand('insertHTML', false, html);
        }
        hideModal(htmlCodeModal);
        if (currentHtmlEditor) currentHtmlEditor.focus();
        savedEditorSelection = null;
    });

    cancelHtmlBtn.addEventListener('click', () => {
        hideModal(htmlCodeModal);
        if (currentHtmlEditor) currentHtmlEditor.focus();
        savedEditorSelection = null;
    });

    copySelectedHtmlBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(selectedHtmlOutput.value || '');
        hideModal(selectedHtmlModal);
        if (currentHtmlEditor) currentHtmlEditor.focus();
    });

    closeSelectedHtmlBtn.addEventListener('click', () => {
        hideModal(selectedHtmlModal);
        if (currentHtmlEditor) currentHtmlEditor.focus();
    });

    saveHtmlFavoriteBtn.addEventListener('click', async () => {
        const name = htmlFavoriteName.value.trim();
        const code = htmlCodeInput.value;
        if (!name || !code) return;
        const favorites = await loadHtmlFavorites();
        favorites.push({ name, code });
        await db.set('keyvalue', { key: 'htmlFavorites', value: favorites });
        await populateHtmlFavorites();
        htmlFavoriteName.value = '';
    });

    function gatherNotesContext() {
        const allRows = document.querySelectorAll('tr[data-topic-id]');
        let notesContext = '';
        allRows.forEach(row => {
            const notes = JSON.parse(row.dataset.notes || '[]');
            if (notes.length > 0) {
                const topicTitle = row.querySelector('.topic-text')?.textContent || `Tema ${row.dataset.topicId}`;
                notes.forEach(note => {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = note.content;
                    notesContext += `Tema: ${topicTitle}\nNota: ${note.title}\nContenido:\n${tempDiv.textContent}\n\n---\n\n`;
                });
            }
        });
        return notesContext;
    }

    async function extractTextFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            text += pageText + '\n';
        }
        return text;
    }

    async function readTextFile(file) {
        return await file.text();
    }

    function drawCanvasFromDescription(desc) {
        if (!aiCanvas) return;
        let shapes;
        try {
            shapes = JSON.parse(desc);
        } catch {
            return;
        }
        const ctx = aiCanvas.getContext('2d');
        ctx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
        shapes.forEach(s => {
            ctx.fillStyle = s.color || '#000';
            if (s.type === 'circle') {
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fill();
            } else if (s.type === 'rect') {
                ctx.fillRect(s.x, s.y, s.w, s.h);
            }
        });
    }

    function createMessageElement(role) {
        const wrapper = document.createElement('div');
        wrapper.className = role === 'user' ? 'text-right' : 'text-left';
        const bubble = document.createElement('div');
        bubble.className = role === 'user'
            ? 'inline-block bg-indigo-600 text-white p-2 rounded-lg'
            : 'inline-block bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 p-2 rounded-lg';
        wrapper.appendChild(bubble);
        aiMessages.appendChild(wrapper);
        aiMessages.scrollTop = aiMessages.scrollHeight;
        return bubble;
    }

    function formatAiResponse(text) {
        if (!text) return '';
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const formatted = escaped
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
        const lines = formatted.split(/\n/);
        let html = '';
        let inList = false;
        for (const line of lines) {
            const match = line.match(/^[-*]\s+(.*)/);
            if (match) {
                if (!inList) {
                    html += '<ul>';
                    inList = true;
                }
                html += `<li>${match[1]}</li>`;
            } else {
                if (inList) {
                    html += '</ul>';
                    inList = false;
                }
                html += line + '<br>';
            }
        }
        if (inList) html += '</ul>';
        return html;
    }

    function splitReasoning(text) {
        const match = text.match(/Razonamiento:\s*([\s\S]*?)\nRespuesta:\s*([\s\S]*)/i);
        if (match) {
            return { reasoning: match[1].trim(), answer: match[2].trim() };
        }
        return { reasoning: '', answer: text.trim() };
    }

    function buildReasoningHTML(reasoning, answer) {
        const answerHtml = formatAiResponse(answer);
        if (reasoning) {
            return `<details><summary>Pensamiento</summary>${formatAiResponse(reasoning)}</details>${answerHtml}`;
        }
        return answerHtml;
    }

    function appendMessage(role, text) {
        const el = createMessageElement(role);
        if (role === 'assistant') {
            el.innerHTML = formatAiResponse(text);
        } else {
            el.textContent = text;
        }
    }

    function filterTable() {
        const isFiltering = activeStatusFilter !== 'all';

        document.querySelectorAll('.section-header-row').forEach(headerRow => {
            const sectionName = headerRow.dataset.sectionHeader;
            const totalRow = document.getElementById(`total-row-${sectionName}`);
            const isCollapsed = headerRow.classList.contains('collapsed');
            
            let hasVisibleChildren = false;

            document.querySelectorAll(`tr[data-section="${sectionName}"]`).forEach(row => {
                const confidence = row.querySelector('.confidence-dot')?.dataset.confidenceLevel || '0';
                const matchesStatus = activeStatusFilter === 'all' || confidence === activeStatusFilter;

                if (matchesStatus) {
                    hasVisibleChildren = true;
                    row.style.display = isCollapsed ? 'none' : '';
                } else {
                    row.style.display = 'none';
                }
            });

            if (isFiltering) {
                headerRow.style.display = hasVisibleChildren ? '' : 'none';
                if (totalRow) {
                    totalRow.style.display = hasVisibleChildren ? '' : 'none';
                }
            } else {
                headerRow.style.display = '';
                if (totalRow) {
                    totalRow.style.display = isCollapsed ? 'none' : '';
                }
            }
        });
    }


    function applyTheme(themeName) {
        document.documentElement.dataset.theme = themeName;
        // Handle dark mode for default theme
        if (themeName === 'default' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    function applyIconStyle(styleName) {
        document.documentElement.dataset.iconStyle = styleName;
    }
    
    let selectedIconCategory = null;
    function populateIconPicker() {
        iconPickerCategories.innerHTML = '';
        emojiGrid.innerHTML = '';
        const categories = Object.keys(EMOJI_CATEGORIES);
        // If no category selected, default to first
        if (!selectedIconCategory && categories.length > 0) {
            selectedIconCategory = categories[0];
        }
        categories.forEach((category) => {
            const btn = document.createElement('button');
            btn.className = 'category-btn';
            btn.textContent = category;
            btn.dataset.category = category;
            if (category === selectedIconCategory) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                selectedIconCategory = category;
                document.querySelectorAll('#icon-picker-categories .category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadEmojisForCategory(category);
            });
            iconPickerCategories.appendChild(btn);
        });
        // Load icons for currently selected category
        if (selectedIconCategory) {
            loadEmojisForCategory(selectedIconCategory);
        }
    }

    function loadEmojisForCategory(category) {
        emojiGrid.innerHTML = '';
        selectedIconCategory = category;
        const emojis = EMOJI_CATEGORIES[category] || [];
        emojis.forEach((emoji) => {
            const btn = document.createElement('button');
            btn.className = 'emoji-btn';
            btn.textContent = emoji;
            btn.dataset.emoji = emoji;
            emojiGrid.appendChild(btn);
        });
    }

    function createReferenceSlot(ref = { icon: '🔗', url: '' }) {
        const slot = document.createElement('div');
        slot.className = 'reference-slot flex items-center gap-2';

        const iconDisplay = document.createElement('button');
        iconDisplay.className = 'icon-display emoji-btn p-1 text-2xl';
        iconDisplay.textContent = ref.icon;
        iconDisplay.addEventListener('click', (e) => {
            e.preventDefault();
            activeIconPickerButton = iconDisplay;
            showModal(iconPickerModal);
        });

        const urlInput = document.createElement('input');
        urlInput.type = 'url';
        urlInput.placeholder = 'https://...';
        urlInput.className = 'w-full p-2 border border-border-color rounded-lg bg-secondary focus:ring-2 focus:ring-sky-400';
        urlInput.value = ref.url;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'toolbar-btn text-red-500 hover:bg-red-100 dark:hover:bg-red-900';
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 4a1 1 0 100 2h2a1 1 0 100-2H8z" clip-rule="evenodd" /></svg>`;
        deleteBtn.title = "Borrar referencia";
        deleteBtn.addEventListener('click', () => slot.remove());

        slot.appendChild(iconDisplay);
        slot.appendChild(urlInput);
        slot.appendChild(deleteBtn);
        return slot;
    }

    function openReferencesModal(references) {
        referencesEditor.innerHTML = '';
        if (references.length > 0) {
            references.forEach(ref => {
                referencesEditor.appendChild(createReferenceSlot(ref));
            });
        } else {
            referencesEditor.appendChild(createReferenceSlot()); // Start with one empty slot
        }
        showModal(referencesModal);
    }
    
    // --- Note Modal Functions ---
    function closeNotesModal() {
        hideModal(notesModal);
        activeNoteIcon = null;
        currentNoteRow = null;
        currentNotesArray = [];
        activeNoteIndex = 0;
    }

    function saveCurrentNote() {
        if (!currentNoteRow || !currentNotesArray || currentNotesArray.length === 0) return;
        
        const currentContent = notesEditor.innerHTML;
        const currentTitle = notesModalTitle.textContent.trim();
        
        // Keep existing postits and quick note data
        const existingPostits = currentNotesArray[activeNoteIndex].postits || {};
        const existingQuickNote = currentNotesArray[activeNoteIndex].quickNote || '';
        currentNotesArray[activeNoteIndex] = {
            title: currentTitle,
            content: currentContent,
            lastEdited: new Date().toISOString(),
            postits: existingPostits,
            quickNote: existingQuickNote
        };

        const noteType = activeNoteIcon.dataset.noteType;
        if (noteType === 'section') {
            currentNoteRow.dataset.sectionNote = JSON.stringify(currentNotesArray);
        } else {
            currentNoteRow.dataset.notes = JSON.stringify(currentNotesArray);
        }
        
        const hasContent = currentNotesArray.some(n => (n.content && n.content.trim() !== '' && n.content.trim() !== '<p><br></p>'));
        if (activeNoteIcon) {
            activeNoteIcon.classList.toggle('has-note', hasContent);
        }

        renderNotesList();
        saveState();
        updateNoteInfo();
    }

    /**
     * Create a table by prompting the user for the number of rows and columns and insert it
     * into the main notes editor. The inserted table is made resizable by adding column
     * resizer handles to the first row. After insertion, the selection is collapsed to
     * avoid persisting hyperlink styles.
     */
    function createTable() {
        let rows = parseInt(prompt('Número de filas:', '2'), 10);
        let cols = parseInt(prompt('Número de columnas:', '2'), 10);
        if (!rows || !cols || rows < 1 || cols < 1) return;
        let html = '<table class="resizable-table" style="border-collapse: collapse; width: 100%;">';
        for (let i = 0; i < rows; i++) {
            html += '<tr>';
            for (let j = 0; j < cols; j++) {
                html += '<td style="border: 1px solid var(--border-color); padding: 4px; min-width:40px;">&nbsp;</td>';
            }
            html += '</tr>';
        }
        html += '</table><p><br></p>';
        document.execCommand('insertHTML', false, html);
        // collapse selection after insertion
        const sel = window.getSelection();
        if (sel.rangeCount) {
            const range = sel.getRangeAt(0);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        // initialize resizers on newly inserted tables (defer to allow DOM insertion)
        setTimeout(() => {
            const tables = notesEditor.querySelectorAll('table');
            tables.forEach(t => initTableResize(t));
        }, 50);
    }
    function initTableResize(table) {
        if (table.dataset.resizableInitialized === 'true') return;
        table.classList.add('resizable-table');
        makeTableResizable(table);
        table.dataset.resizableInitialized = 'true';
    }

    function renderNotesList() {
        notesList.innerHTML = '';
        if (currentNotesArray.length === 0) {
             if (notesModalCounter) notesModalCounter.textContent = '0 / 0';
             return;
        }

        currentNotesArray.forEach((note, index) => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'note-item-btn w-full';
            btn.dataset.index = index;
            
            if (index === activeNoteIndex) {
                btn.classList.add('active');
            }
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'note-title-text';
            titleSpan.textContent = note.title || `Nota ${index + 1}`;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-note-btn toolbar-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Borrar esta nota';
            deleteBtn.dataset.index = index;

            btn.appendChild(titleSpan);
            btn.appendChild(deleteBtn);
            li.appendChild(btn);
            notesList.appendChild(li);
        });
        
        if(notesModalCounter) {
            notesModalCounter.textContent = `${activeNoteIndex + 1} / ${currentNotesArray.length}`;
        }
    }

    function loadNoteIntoEditor(index) {
        if (index < 0 || index >= currentNotesArray.length) {
            if (currentNotesArray.length === 0) {
               addNewNote(false);
               return;
            }
            index = 0; // fallback to the first note
        }
        
        activeNoteIndex = index;
        const note = currentNotesArray[index];
        
        notesModalTitle.textContent = note.title || `Nota ${index + 1}`;
        notesEditor.innerHTML = note.content || '<p><br></p>';
        notesEditor.querySelectorAll('table').forEach(initTableResize);

        renderNotesList();
        notesEditor.focus();
        updateNoteInfo();
    }
    
    function addNewNote(shouldSaveCurrent = true) {
        if (shouldSaveCurrent) {
            saveCurrentNote();
        }
        
        const newIndex = currentNotesArray.length;
        currentNotesArray.push({
            title: `Nota ${newIndex + 1}`,
            content: '<p><br></p>',
            lastEdited: new Date().toISOString(),
            postits: {},
            quickNote: ''
        });
        
        loadNoteIntoEditor(newIndex);
    }
    
    async function deleteNote(indexToDelete) {
        const confirmed = await showConfirmation("¿Estás seguro de que quieres eliminar esta nota? Esta acción no se puede deshacer.");
        if (!confirmed) return;

        currentNotesArray.splice(indexToDelete, 1);
        
        let newIndexToShow = activeNoteIndex;
        if (activeNoteIndex === indexToDelete) {
             newIndexToShow = Math.max(0, indexToDelete - 1);
        } else if (activeNoteIndex > indexToDelete) {
            newIndexToShow = activeNoteIndex - 1;
        }

        if (currentNotesArray.length === 0) {
            addNewNote(false);
        } else {
            loadNoteIntoEditor(newIndexToShow);
        }
    }

    function updateNoteInfo() {
        if (!currentNotesArray || currentNotesArray.length === 0) return;
        const note = currentNotesArray[activeNoteIndex];
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content || '';
        const text = tempDiv.textContent || tempDiv.innerText || '';
        const words = text.trim().split(/\s+/).filter(Boolean);
        
        infoWordCount.textContent = words.length;
        infoNoteSize.textContent = formatBytes(new Blob([note.content]).size);
        infoLastEdited.textContent = note.lastEdited ? new Date(note.lastEdited).toLocaleString() : 'N/A';
    }

    function createSubnoteLink() {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            showAlert("Por favor, selecciona el texto que quieres convertir en una sub-nota.");
            return;
        }
        const range = selection.getRangeAt(0);
        const uniqueId = `subnote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // Create an anchor to wrap the selected content
        const anchor = document.createElement('a');
        anchor.className = 'subnote-link';
        anchor.dataset.subnoteId = uniqueId;
        anchor.href = '#';
        // Extract selected content and append
        const selectedContent = range.extractContents();
        anchor.appendChild(selectedContent);
        range.insertNode(anchor);
        // Insert a non-breaking space after the anchor to exit the hyperlink context
        const spacer = document.createTextNode('\u00A0');
        anchor.parentNode.insertBefore(spacer, anchor.nextSibling);
        // Move cursor after inserted spacer
        const newRange = document.createRange();
        newRange.setStartAfter(spacer);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        notesEditor.focus();
        // Save a placeholder subnote entry
        if (currentNotesArray[activeNoteIndex]) {
            if (!currentNotesArray[activeNoteIndex].postits) {
                currentNotesArray[activeNoteIndex].postits = {};
            }
            currentNotesArray[activeNoteIndex].postits[uniqueId] = { title: '', content: '' };
            saveCurrentNote();
        }
    }

    function insertInlineNoteIcon() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const uniqueId = `inline-note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const icon = document.createElement('span');
        icon.className = 'inline-note';
        icon.dataset.subnoteId = uniqueId;
        icon.textContent = currentInlineNoteIcon;
        icon.contentEditable = 'false';
        range.insertNode(icon);
        const spacer = document.createTextNode('\u00A0');
        icon.parentNode.insertBefore(spacer, icon.nextSibling);
        const newRange = document.createRange();
        newRange.setStartAfter(spacer);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        notesEditor.focus();
        if (currentNotesArray[activeNoteIndex]) {
            if (!currentNotesArray[activeNoteIndex].postits) {
                currentNotesArray[activeNoteIndex].postits = {};
            }
            currentNotesArray[activeNoteIndex].postits[uniqueId] = { title: '', content: '' };
            saveCurrentNote();
        }
    }

    const tooltipHideDelay = 300;
    const tooltipHideMargin = 8;
    let lastMousePos = { x: 0, y: 0 };
    document.addEventListener('mousemove', (e) => {
        lastMousePos.x = e.clientX;
        lastMousePos.y = e.clientY;
    });

    function scheduleHideInlineNoteTooltip(icon) {
        if (icon._hideTimeout) {
            clearTimeout(icon._hideTimeout);
        }
        icon._hideTimeout = setTimeout(() => {
            const tooltip = icon._tooltip;
            if (!tooltip) return;
            const rect = tooltip.getBoundingClientRect();
            const x = lastMousePos.x;
            const y = lastMousePos.y;
            const withinX = x >= rect.left - tooltipHideMargin && x <= rect.right + tooltipHideMargin;
            const withinY = y >= rect.top - tooltipHideMargin && y <= rect.bottom + tooltipHideMargin;
            if (withinX && withinY) {
                scheduleHideInlineNoteTooltip(icon);
            } else {
                hideInlineNoteTooltip(icon);
            }
        }, tooltipHideDelay);
    }

    function showInlineNoteTooltip(icon) {
        if (icon._tooltip) {
            if (icon._hideTimeout) {
                clearTimeout(icon._hideTimeout);
                delete icon._hideTimeout;
            }
            return;
        }
        const subnoteId = icon.dataset.subnoteId || icon.dataset.postitId;
        const noteData = currentNotesArray[activeNoteIndex];
        if (!noteData || !noteData.postits) return;
        const subnote = noteData.postits[subnoteId];
        if (!subnote || !subnote.content) return;
        const tooltip = document.createElement('div');
        tooltip.className = 'inline-note-tooltip';
        tooltip.innerHTML = subnote.content;
        tooltip.addEventListener('mouseenter', () => {
            if (icon._hideTimeout) {
                clearTimeout(icon._hideTimeout);
                delete icon._hideTimeout;
            }
        });
        tooltip.addEventListener('mouseleave', () => scheduleHideInlineNoteTooltip(icon));
        tooltip.addEventListener('dblclick', (e) => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                const images = Array.from(tooltip.querySelectorAll('img')).map(img => ({
                    element: img,
                    url: img.src,
                    caption: img.dataset.caption || ''
                }));
                const idx = images.findIndex(img => img.element === e.target);
                openImageLightbox(images, idx);
            }
        });
        document.body.appendChild(tooltip);
        const rect = icon.getBoundingClientRect();
        tooltip.style.top = `${rect.bottom + window.scrollY + 4}px`;
        tooltip.style.left = `${rect.left + window.scrollX}px`;
        icon._tooltip = tooltip;
    }

    function hideInlineNoteTooltip(icon) {
        if (icon._hideTimeout) {
            clearTimeout(icon._hideTimeout);
            delete icon._hideTimeout;
        }
        if (icon._tooltip) {
            icon._tooltip.remove();
            delete icon._tooltip;
        }
    }

    function openGalleryLinkEditor() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        activeGalleryRange = selection.getRangeAt(0).cloneRange();
        const existingLink = activeGalleryRange.startContainer.parentElement.closest('.gallery-link');
        
        imageGalleryInputs.innerHTML = '';
        
        if (existingLink && existingLink.dataset.images) {
            try {
                const images = JSON.parse(existingLink.dataset.images);
                images.forEach(img => addGalleryImageUrlInput(img.url, img.caption));
            } catch (e) {
                console.error("Error parsing gallery data:", e);
                addGalleryImageUrlInput();
            }
        } else {
            addGalleryImageUrlInput();
        }
        showModal(imageGalleryLinkModal);
    }
    
    function addGalleryImageUrlInput(url = '', caption = '') {
        const wrapper = document.createElement('div');
        wrapper.className = 'gallery-url-input flex flex-col gap-2 mb-2 p-2 border border-border-color rounded';
    
        const mainLine = document.createElement('div');
        mainLine.className = 'flex items-center gap-2';
    
        const urlInput = document.createElement('input');
        urlInput.type = 'url';
        urlInput.placeholder = 'URL de la imagen...';
        urlInput.className = 'flex-grow p-2 border border-border-color rounded-lg bg-secondary focus:ring-2 focus:ring-sky-400 url-field';
        urlInput.value = url;
        mainLine.appendChild(urlInput);
    
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'toolbar-btn text-red-500 hover:bg-red-100 dark:hover:bg-red-900 flex-shrink-0';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.addEventListener('click', () => wrapper.remove());
        mainLine.appendChild(deleteBtn);
    
        wrapper.appendChild(mainLine);
    
        const captionInput = document.createElement('input');
        captionInput.type = 'text';
        captionInput.placeholder = 'Descripción (opcional)...';
        captionInput.className = 'w-full p-2 border border-border-color rounded-lg bg-secondary text-sm caption-field';
        captionInput.value = caption;
        wrapper.appendChild(captionInput);
    
        imageGalleryInputs.appendChild(wrapper);
    }

    function handleGalleryLinkSave() {
        const imageElements = imageGalleryInputs.querySelectorAll('.gallery-url-input');
        const images = Array.from(imageElements).map(el => {
            const url = el.querySelector('.url-field').value;
            const caption = el.querySelector('.caption-field').value;
            return { url, caption };
        }).filter(item => item.url);

        if (images.length === 0) {
            showAlert("Por favor, añade al menos una URL de imagen válida.");
            return;
        }

        if (activeGalleryRange) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(activeGalleryRange);
        
            const existingLink = activeGalleryRange.startContainer.parentElement.closest('.gallery-link');
            if (existingLink) {
                existingLink.dataset.images = JSON.stringify(images);
            } else {
                 // Remove formatting on the selected range before wrapping it
                 document.execCommand('removeFormat');
                 const span = document.createElement('span');
                 span.className = 'gallery-link';
                 span.dataset.images = JSON.stringify(images);
                 span.appendChild(activeGalleryRange.extractContents());
                 activeGalleryRange.insertNode(span);
                 // Insert a non-breaking space after the span to break out of the hyperlink context
                 const spacer = document.createTextNode('\u00A0');
                 span.parentNode.insertBefore(spacer, span.nextSibling);
                 // After inserting the gallery span and spacer, collapse the selection so formatting does not persist
                 const newRange = document.createRange();
                 newRange.setStartAfter(spacer);
                 newRange.collapse(true);
                 const sel = window.getSelection();
                 sel.removeAllRanges();
                 sel.addRange(newRange);
            }
            hideModal(imageGalleryLinkModal);
            activeGalleryRange = null;
        }
    }
    
    function openImageLightbox(imagesData, startIndex = 0) {
        try {
            if (typeof imagesData === 'string') {
                lightboxImages = JSON.parse(imagesData);
                if (!Array.isArray(lightboxImages) || lightboxImages.length === 0) return;
            } else if (Array.isArray(imagesData)) {
                lightboxImages = imagesData;
                // When opened directly from note images there is no gallery link
                activeGalleryLinkForLightbox = null;
                if (lightboxImages.length === 0) return;
            } else {
                return;
            }
            currentLightboxIndex = startIndex;
            // Reset zoom when opening a new gallery
            currentZoom = 1;
            lightboxImage.style.transform = 'scale(1)';
            // Ensure the transform origin is centered for better zooming
            lightboxImage.style.transformOrigin = 'center center';
            updateLightboxView();
            showModal(imageLightboxModal);
        } catch(e) {
            console.error("Could not parse image gallery data:", e);
            showAlert("No se pudo abrir la galería de imágenes. Los datos pueden estar corruptos.");
        }
    }

    // Apply the current zoom level to the lightbox image. Defined outside of openImageLightbox so it is always available.
    function applyZoom() {
        if (!lightboxImage) return;
        lightboxImage.style.transform = `scale(${currentZoom})`;
        lightboxImage.style.transformOrigin = 'center center';
    }

    function updateLightboxView() {
        if (lightboxImages.length === 0) return;
        const image = lightboxImages[currentLightboxIndex];
        lightboxImage.src = image.url;
        
        // Build caption with numbering
        const caption = image.caption || '';
        const numbering = `(${currentLightboxIndex + 1} / ${lightboxImages.length})`;
        lightboxCaption.style.display = 'flex';
        if (caption.trim()) {
            lightboxCaptionText.textContent = `${caption.trim()} ${numbering}`;
            deleteCaptionBtn.style.display = 'inline-block';
        } else {
            lightboxCaptionText.textContent = `Añadir nota... ${numbering}`;
            deleteCaptionBtn.style.display = 'none';
        }

        prevLightboxBtn.style.display = currentLightboxIndex > 0 ? 'block' : 'none';
        nextLightboxBtn.style.display = currentLightboxIndex < lightboxImages.length - 1 ? 'block' : 'none';
        // Apply current zoom after updating image
        applyZoom();
    }
    
    async function handlePrintAll() {
        await db.connect();
        const printArea = getElem('print-area');
        printArea.innerHTML = '';

        const indexContainer = document.createElement('div');
        indexContainer.id = 'print-index';
        printArea.appendChild(indexContainer);

        const rows = document.querySelectorAll('tr.section-header-row, tr[data-topic-id]');
        let currentOl = null;
        let counter = 1;

        for (const row of rows) {
            if (row.classList.contains('section-header-row')) {
                const sectionTitle = row.querySelector('.section-title')?.textContent || '';
                const header = document.createElement('h2');
                header.textContent = sectionTitle;
                indexContainer.appendChild(header);
                currentOl = document.createElement('ol');
                indexContainer.appendChild(currentOl);
            } else {
                const topicId = row.dataset.topicId;
                const title = row.cells[1]?.textContent.trim() || '';
                const topicData = await db.get('topics', topicId);
                const hasNotes = topicData && Array.isArray(topicData.notes) && topicData.notes.length > 0;

                if (currentOl) {
                    const li = document.createElement('li');
                    const link = document.createElement('a');
                    link.href = `#print-${topicId}`;
                    link.textContent = `${counter}. ${title}`;
                    link.className = hasNotes ? 'topic-developed' : 'topic-pending';
                    li.appendChild(link);
                    currentOl.appendChild(li);
                }

                const topicWrapper = document.createElement('div');
                topicWrapper.id = `print-${topicId}`;
                topicWrapper.className = 'topic-print-wrapper';

                const backLink = document.createElement('a');
                backLink.href = '#print-index';
                backLink.textContent = '↩ Volver al índice';
                backLink.className = 'back-to-index';
                topicWrapper.appendChild(backLink);

                const titleEl = document.createElement('h2');
                titleEl.textContent = `${counter}. ${title}`;
                if (!hasNotes) {
                    titleEl.style.color = '#9ca3af';
                }
                topicWrapper.appendChild(titleEl);

                if (hasNotes) {
                    topicData.notes.forEach(note => {
                        const noteContent = document.createElement('div');
                        noteContent.innerHTML = note.content;
                        noteContent.querySelectorAll('a.subnote-link, a.postit-link, a.gallery-link').forEach(link => {
                            link.outerHTML = `<span>${link.innerHTML}</span>`;
                        });
                        topicWrapper.appendChild(noteContent);
                    });
                } else {
                    const placeholder = document.createElement('p');
                    placeholder.textContent = 'Tema no desarrollado.';
                    topicWrapper.appendChild(placeholder);
                }

                printArea.appendChild(topicWrapper);
                counter++;
            }
        }

        if (!indexContainer.querySelector('li')) {
            await showAlert("No hay temas que imprimir.");
            return;
        }

        window.print();
    }

    async function handlePrintSection(sectionHeaderRow) {
        const sectionId = sectionHeaderRow.dataset.sectionHeader;
        const topicRows = document.querySelectorAll(`tr[data-section="${sectionId}"]`);
        const printArea = getElem('print-area');
        printArea.innerHTML = ''; // Clear previous print content

        for (const row of topicRows) {
            const topicId = row.dataset.topicId;
            const topicData = await db.get('topics', topicId);

            if (topicData && topicData.notes && topicData.notes.length > 0) {
                const topicWrapper = document.createElement('div');
                topicWrapper.className = 'topic-print-wrapper';

                topicData.notes.forEach(note => {
                    const noteContent = document.createElement('div');
                    noteContent.innerHTML = note.content;
                    // Sanitize links for printing
                    // Convert sub-note and post-it links back to plain text for printing
                    noteContent.querySelectorAll('a.subnote-link, a.postit-link, a.gallery-link').forEach(link => {
                        link.outerHTML = `<span>${link.innerHTML}</span>`;
                    });
                    topicWrapper.appendChild(noteContent);
                });
                printArea.appendChild(topicWrapper);
            }
        }
        
        if (printArea.innerHTML.trim() === '') {
            await showAlert("No hay notas que imprimir en esta sección.");
            return;
        }

        window.print();
    }


    // --- Event Listeners Setup ---
    function setupEventListeners() {
        // Main table interactions
        tableBody.addEventListener('click', async (e) => {
            const target = e.target;
            const cell = target.closest('td');
            const row = target.closest('tr');
            if (!cell || !row) return;

            // Confidence dot click
            if (target.classList.contains('confidence-dot')) {
                const currentLevel = parseInt(target.dataset.confidenceLevel, 10);
                const newLevel = (currentLevel + 1) % 4; // Cycles 0 -> 1 -> 2 -> 3 -> 0
                target.dataset.confidenceLevel = newLevel;
                saveState();
                filterTable();
                return;
            }

            // References cell click
            if (cell.classList.contains('references-cell')) {
                e.stopPropagation();
                activeReferencesCell = cell;
                const references = JSON.parse(row.dataset.references || '[]');
                openReferencesModal(references);
                return;
            }

            // Lectura cell click (excluding note icon)
            if (cell.classList.contains('lectura-cell') && !target.closest('.note-icon')) {
                const counter = cell.querySelector('.lectura-counter');
                if (counter) {
                    let count = parseInt(counter.textContent, 10);
                    count = (count + 1) % 2; // Simple toggle between 0 and 1
                    counter.textContent = count;
                    cell.classList.toggle('lectura-filled', count > 0);
                    updateAllTotals();
                    saveState();
                }
                return;
            }

            // Note icon click
            if (target.closest('.note-icon')) {
                e.stopPropagation();
                activeNoteIcon = target.closest('.note-icon');
                currentNoteRow = activeNoteIcon.closest('tr');
                const noteType = activeNoteIcon.dataset.noteType;
                
                let notesDataString;
                if (noteType === 'section') {
                    notesDataString = currentNoteRow.dataset.sectionNote || '[]';
                } else {
                    notesDataString = currentNoteRow.dataset.notes || '[]';
                }

                try {
                    currentNotesArray = JSON.parse(notesDataString);
                } catch (err) {
                    console.error("Error parsing notes data:", err);
                    currentNotesArray = [];
                }

                // Ensure readonly mode is off when opening
                const modalContent = notesModal.querySelector('.notes-modal-content');
                modalContent.classList.remove('readonly-mode');
                notesEditor.contentEditable = true;
                notesModalTitle.contentEditable = true;

                loadNoteIntoEditor(0);
                
                // Collapse side panel by default
                notesSidePanel.classList.remove('open');
                notesPanelToggle.classList.remove('open');
                notesMainContent.style.width = ''; // Reset width
                notesSidePanel.style.width = '220px'; // Reset width

                showModal(notesModal);
                return;
            }
        });

        // Section header collapse/expand
        tableBody.addEventListener('click', (e) => {
            const headerRow = e.target.closest('.section-header-row');
            if (!headerRow) return;

            // Prevent toggle when clicking on note or print icons
            if(e.target.closest('.note-icon') || e.target.closest('.print-section-btn')) {
                return;
            }
            
            headerRow.classList.toggle('collapsed');
            const isCollapsed = headerRow.classList.contains('collapsed');
            const sectionName = headerRow.dataset.sectionHeader;
            const totalRow = document.getElementById(`total-row-${sectionName}`);

            document.querySelectorAll(`tr[data-section="${sectionName}"]`).forEach(row => {
                row.style.display = isCollapsed ? 'none' : '';
            });

            if (totalRow) {
                totalRow.style.display = isCollapsed ? 'none' : '';
            }
            saveState();
        });

        // Section print button
        tableBody.addEventListener('click', (e) => {
            const printBtn = e.target.closest('.print-section-btn');
            if (printBtn) {
                e.stopPropagation();
                const sectionHeaderRow = printBtn.closest('.section-header-row');
                handlePrintSection(sectionHeaderRow);
            }
        });

        // Filter by status
        statusFiltersContainer.addEventListener('click', e => {
            const filterBtn = e.target.closest('.filter-btn');
            if (filterBtn) {
                statusFiltersContainer.querySelector('.active')?.classList.remove('active', 'ring-2', 'ring-offset-2', 'ring-sky-500', 'bg-sky-500', 'text-white', 'dark:bg-sky-500');
                filterBtn.classList.add('active', 'ring-2', 'ring-offset-2', 'ring-sky-500', 'bg-sky-500', 'text-white', 'dark:bg-sky-500');
                activeStatusFilter = filterBtn.dataset.filter;
                filterTable();
            }
        });

        // Settings
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsDropdown.classList.toggle('hidden');
        });
        settingsDropdown.addEventListener('click', (e) => {
            e.preventDefault();
            const target = e.target;
            if (target.classList.contains('theme-option')) {
                applyTheme(target.dataset.theme);
                saveState();
            } else if (target.classList.contains('icon-style-option')) {
                applyIconStyle(target.dataset.style);
                saveState();
            }
            settingsDropdown.classList.add('hidden');
        });

        toggleAllSectionsBtn.addEventListener('click', () => {
            const allHeaders = document.querySelectorAll('.section-header-row');
            // If any is not collapsed, collapse all. Otherwise, expand all.
            const shouldCollapse = Array.from(allHeaders).some(h => !h.classList.contains('collapsed'));
            allHeaders.forEach(headerRow => {
                const isCurrentlyCollapsed = headerRow.classList.contains('collapsed');
                 if ((shouldCollapse && !isCurrentlyCollapsed) || (!shouldCollapse && isCurrentlyCollapsed)) {
                     headerRow.click(); // Simulate a click to toggle
                 }
             });
        });

        printAllBtn.addEventListener('click', () => handlePrintAll());

        // Import/Export
        exportBtn.addEventListener('click', () => {
            const state = getStateObject();
            const dataStr = JSON.stringify(state, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `temario_progreso_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        importBtn.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const state = JSON.parse(e.target.result);
                        await db.connect(); // Ensure DB is ready
                        
                        // Clear existing data
                        const stores = ['topics', 'sections', 'keyvalue'];
                        const clearPromises = stores.map(storeName => {
                             return db._getStore(storeName, 'readwrite').then(s => s.clear());
                        });
                        await Promise.all(clearPromises);
                        
                        _loadStateFromObject(state);
                        await saveState(); // Save the newly loaded state to DB
                        location.reload(); // Reload to ensure UI consistency
                    } catch (err) {
                        console.error("Error importing file:", err);
                        showAlert("El archivo de importación es inválido o está corrupto.");
                    }
                };
                reader.readAsText(file);
            }
        });
        
        // --- Notes Modal Listeners ---
        notesModal.addEventListener('click', (e) => {
            if (e.target === notesModal) {
                 // Do nothing, to prevent closing on overlay click.
            }
        });
        cancelNoteBtn.addEventListener('click', closeNotesModal);
        saveNoteBtn.addEventListener('click', saveCurrentNote);
        saveAndCloseNoteBtn.addEventListener('click', () => {
            saveCurrentNote();
            closeNotesModal();
        });
        
        unmarkNoteBtn.addEventListener('click', async () => {
            const confirmed = await showConfirmation("¿Estás seguro de que quieres borrar todo el contenido de esta nota?");
            if (confirmed) {
                notesEditor.innerHTML = '<p><br></p>';
            }
        });

        toggleReadOnlyBtn.addEventListener('click', () => {
            const modalContent = notesModal.querySelector('.notes-modal-content');
            modalContent.classList.toggle('readonly-mode');
            const isReadOnly = modalContent.classList.contains('readonly-mode');
            notesEditor.contentEditable = !isReadOnly;
            notesModalTitle.contentEditable = !isReadOnly;
        });

        notesPanelToggle.addEventListener('click', () => {
            notesSidePanel.classList.toggle('open');
            notesPanelToggle.classList.toggle('open');
        });
        
        addNotePanelBtn.addEventListener('click', () => addNewNote(true));
        notesList.addEventListener('click', (e) => {
            const itemBtn = e.target.closest('.note-item-btn');
            const deleteBtn = e.target.closest('.delete-note-btn');

            if (deleteBtn) {
                e.stopPropagation();
                const index = parseInt(deleteBtn.dataset.index, 10);
                deleteNote(index);
            } else if (itemBtn) {
                saveCurrentNote(); // Save current before switching
                const index = parseInt(itemBtn.dataset.index, 10);
                loadNoteIntoEditor(index);
            }
        });

        // Note Info Modal
        noteInfoBtn.addEventListener('click', () => {
            updateNoteInfo();
            showModal(noteInfoModal);
        });
        closeNoteInfoBtn.addEventListener('click', () => hideModal(noteInfoModal));

        // Note content import/export
        exportNoteBtn.addEventListener('click', () => {
            // Clone the editor content so we can strip sub-note links before exporting
            const clone = notesEditor.cloneNode(true);
            // Remove any sub-note or legacy post-it links entirely from the exported HTML
            clone.querySelectorAll('a.subnote-link, a.postit-link').forEach(link => {
                const parent = link.parentNode;
                while (link.firstChild) {
                    parent.insertBefore(link.firstChild, link);
                }
                parent.removeChild(link);
            });
            const noteContent = clone.innerHTML;
            const noteTitle = (notesModalTitle.textContent || 'nota').trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${notesModalTitle.textContent}</title><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'); body { font-family: 'Inter', sans-serif; line-height: 1.6; padding: 1rem; } ul, ol { list-style: none; padding-left: 1.25rem; }</style></head><body>${noteContent}</body></html>`;
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${noteTitle}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        importNoteBtn.addEventListener('click', () => importNoteFileInput.click());
        importNoteFileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                const confirmed = await showConfirmation("Importar este archivo reemplazará el contenido actual de la nota. ¿Desea continuar?");
                if (confirmed) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        notesEditor.innerHTML = e.target.result;
                        notesEditor.querySelectorAll('table').forEach(initTableResize);
                    };
                    reader.readAsText(file);
                }
                // Reset file input to allow importing the same file again
                event.target.value = '';
            }
        });

        // Note Title Editing
        notesModalTitle.addEventListener('blur', () => {
            const newTitle = notesModalTitle.textContent.trim();
            if (currentNotesArray[activeNoteIndex]) {
                 currentNotesArray[activeNoteIndex].title = newTitle;
                 renderNotesList(); // Update title in the list
            }
        });
        notesModalTitle.addEventListener('keydown', (e) => {
             if (e.key === 'Enter') {
                 e.preventDefault();
                 notesEditor.focus();
             }
        });

        // --- Editor Listeners ---
        notesEditor.addEventListener('click', (e) => {
             // Handle image selection
             if (e.target.tagName === 'IMG') {
                 document.querySelectorAll('#notes-editor img').forEach(img => img.classList.remove('selected-for-resize'));
                 e.target.classList.add('selected-for-resize');
                 selectedImageForResize = e.target;
             } else {
                 document.querySelectorAll('#notes-editor img').forEach(img => img.classList.remove('selected-for-resize'));
                 selectedImageForResize = null;
             }

             // Handle gallery link clicks
             const galleryLink = e.target.closest('.gallery-link');
             if (galleryLink) {
                 e.preventDefault();
                 // Persist the link so that caption edits and image updates can be saved back
                 activeGalleryLinkForLightbox = galleryLink;
                 openImageLightbox(galleryLink.dataset.images);
                 return;
             }

             // Handle inline note icon clicks
             const inlineIcon = e.target.closest('.inline-note');
             if (inlineIcon) {
                 e.preventDefault();
                 hideInlineNoteTooltip(inlineIcon);
                 activeSubnoteLink = inlineIcon;
                 editingQuickNote = false;
                 const subnoteId = inlineIcon.dataset.subnoteId || inlineIcon.dataset.postitId;
                 const noteData = currentNotesArray[activeNoteIndex];
                 let subnoteData = { title: '', content: '' };
                 if (noteData && noteData.postits) {
                     const existing = noteData.postits[subnoteId];
                     if (typeof existing === 'string') {
                         subnoteData = { title: '', content: existing };
                     } else if (existing) {
                         subnoteData = existing;
                     }
                 }
                 subNoteTitle.textContent = subnoteData.title || '';
                 subNoteEditor.innerHTML = subnoteData.content || '<p><br></p>';
                 const modalContent = subNoteModal.querySelector('.notes-modal-content');
                 modalContent.classList.remove('readonly-mode');
                 subNoteEditor.contentEditable = true;
                 subNoteTitle.contentEditable = true;
                 subNoteEditor.focus();
                 showModal(subNoteModal);
                 return;
             }

             // Handle sub-note link clicks (supports legacy post-it links)
             const subnoteLink = e.target.closest('.subnote-link, .postit-link');
             if (subnoteLink) {
                 e.preventDefault();
                 activeSubnoteLink = subnoteLink;
                 editingQuickNote = false;
                 // Determine the identifier attribute (subnoteId or legacy postitId)
                 const subnoteId = subnoteLink.dataset.subnoteId || subnoteLink.dataset.postitId;
                 const noteData = currentNotesArray[activeNoteIndex];
                 let subnoteData = { title: '', content: '' };
                 if (noteData && noteData.postits) {
                     const existing = noteData.postits[subnoteId];
                     // Support legacy string format where value was a plain string
                     if (typeof existing === 'string') {
                         subnoteData = { title: '', content: existing };
                     } else if (existing) {
                         subnoteData = existing;
                     }
                 }
                 // Populate sub-note modal fields
                subNoteTitle.textContent = subnoteData.title || '';
                subNoteEditor.innerHTML = subnoteData.content || '<p><br></p>';
                const modalContent = subNoteModal.querySelector('.notes-modal-content');
                modalContent.classList.add('readonly-mode');
                subNoteEditor.contentEditable = false;
                subNoteTitle.contentEditable = false;
                showModal(subNoteModal);
                return;
            }
        });

        notesEditor.addEventListener('mouseover', (e) => {
            const icon = e.target.closest('.inline-note');
            if (icon) {
                showInlineNoteTooltip(icon);
            }
        });

        notesEditor.addEventListener('mouseout', (e) => {
            const icon = e.target.closest('.inline-note');
            if (icon) {
                const related = e.relatedTarget;
                if (related && (related === icon._tooltip || icon._tooltip?.contains(related))) {
                    return;
                }
                scheduleHideInlineNoteTooltip(icon);
            }
        });

        notesEditor.addEventListener('dblclick', (e) => {
            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                const images = Array.from(notesEditor.querySelectorAll('img')).map(img => ({
                    element: img,
                    url: img.src,
                    caption: img.dataset.caption || ''
                }));
                const idx = images.findIndex(obj => obj.element === e.target);
                if (idx !== -1) {
                    openImageLightbox(images, idx);
                    return;
                }
            }
            const callout = e.target.closest('.note-callout');
            if (callout) {
                e.preventDefault();
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(callout);
                selection.removeAllRanges();
                selection.addRange(range);
                savedEditorSelection = range.cloneRange();
                openNoteStyleModal(callout);
            }
        });

        notesEditor.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    savedEditorSelection = selection.getRangeAt(0).cloneRange();
                }
                openNoteStyleModal();
            }
        });

        noteStyleTabPre.addEventListener('click', () => {
            noteStyleTabPre.classList.add('border-b-2', 'border-blue-500');
            noteStyleTabCustom.classList.remove('border-b-2', 'border-blue-500');
            noteStylePre.classList.remove('hidden');
            noteStyleCustom.classList.add('hidden');
        });
        noteStyleTabCustom.addEventListener('click', () => {
            noteStyleTabCustom.classList.add('border-b-2', 'border-blue-500');
            noteStyleTabPre.classList.remove('border-b-2', 'border-blue-500');
            noteStylePre.classList.add('hidden');
            noteStyleCustom.classList.remove('hidden');
        });
        cancelNoteStyleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeNoteStyleModal();
        });
        noteStyleModal.addEventListener('click', (e) => {
            if (e.target === noteStyleModal) closeNoteStyleModal();
        });
        applyNoteStyleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const opts = {
                backgroundColor: noteBgColorInput.value,
                borderColor: noteBorderColorInput.value,
                borderRadius: parseInt(noteRadiusInput.value) || 0,
                borderWidth: parseInt(noteBorderWidthInput.value) || 0,
                padding: parseInt(notePaddingInput.value) || 0,
                margin: parseInt(noteMarginInput.value) || 0,
                shadow: noteShadowInput.checked
            };
            applyNoteStyle(opts);
        });
        noteStyleModal.querySelectorAll('.predef-note-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const opts = {
                    backgroundColor: btn.dataset.bg,
                    borderColor: btn.dataset.border,
                    borderRadius: 8,
                    borderWidth: 2,
                    padding: 8,
                    margin: 8,
                    shadow: false,
                    presetClass: btn.classList.contains('note-blue') ? 'note-blue' :
                                 btn.classList.contains('note-green') ? 'note-green' :
                                 btn.classList.contains('note-yellow') ? 'note-yellow' :
                                 btn.classList.contains('note-red') ? 'note-red' :
                                 btn.classList.contains('note-purple') ? 'note-purple' :
                                 btn.classList.contains('note-gray') ? 'note-gray' : null
                };
                applyNoteStyle(opts);
            });
        });

        // --- Quick Note Modal Listeners ---
        savePostitBtn.addEventListener('click', () => {
            // When editing a quick note, save its content and close modal
            if (editingQuickNote && currentNotesArray[activeNoteIndex]) {
                currentNotesArray[activeNoteIndex].quickNote = postitNoteTextarea.value;
                hideModal(postitNoteModal);
                editingQuickNote = false;
                saveCurrentNote();
                return;
            }
        });

        deletePostitBtn.addEventListener('click', async () => {
            // Delete quick note content if editing
            if (editingQuickNote && currentNotesArray[activeNoteIndex]) {
                const confirmed = await showConfirmation("¿Eliminar esta nota rápida? El contenido se borrará permanentemente.");
                if (confirmed) {
                    currentNotesArray[activeNoteIndex].quickNote = '';
                    hideModal(postitNoteModal);
                    editingQuickNote = false;
                    saveCurrentNote();
                }
            }
        });
        
        closePostitBtn.addEventListener('click', () => {
            hideModal(postitNoteModal);
            editingQuickNote = false;
        });
        
        // Image Gallery Modal Listeners
        addGalleryImageUrlBtn.addEventListener('click', () => addGalleryImageUrlInput());
        cancelGalleryLinkBtn.addEventListener('click', () => {
            hideModal(imageGalleryLinkModal);
            activeGalleryRange = null;
        });
        saveGalleryLinkBtn.addEventListener('click', handleGalleryLinkSave);

        // Lightbox Listeners
        closeLightboxBtn.addEventListener('click', () => hideModal(imageLightboxModal));
        prevLightboxBtn.addEventListener('click', () => {
            if (currentLightboxIndex > 0) {
                currentLightboxIndex--;
                updateLightboxView();
            }
        });
        nextLightboxBtn.addEventListener('click', () => {
            if (currentLightboxIndex < lightboxImages.length - 1) {
                currentLightboxIndex++;
                updateLightboxView();
            }
        });
        imageLightboxModal.addEventListener('click', (e) => {
            if (e.target === imageLightboxModal || e.target.id === 'image-lightbox-content') {
                 hideModal(imageLightboxModal);
            }
        });

        // Additional Lightbox controls
        if (zoomInLightboxBtn) {
            zoomInLightboxBtn.addEventListener('click', (e) => {
                e.preventDefault();
                currentZoom = Math.min(maxZoom, currentZoom + zoomStep);
                applyZoom();
            });
        }
        if (zoomOutLightboxBtn) {
            zoomOutLightboxBtn.addEventListener('click', (e) => {
                e.preventDefault();
                currentZoom = Math.max(minZoom, currentZoom - zoomStep);
                applyZoom();
            });
        }
        if (downloadLightboxBtn) {
            downloadLightboxBtn.addEventListener('click', (e) => {
                e.preventDefault();
                try {
                    const imageObj = lightboxImages[currentLightboxIndex];
                    if (!imageObj || !imageObj.url) return;
                    const link = document.createElement('a');
                    link.href = imageObj.url;
                    // Extract filename from URL or default to image
                    const parts = imageObj.url.split('/');
                    link.download = parts[parts.length - 1] || 'imagen';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                } catch(err) {
                    console.error('Error downloading image:', err);
                }
            });
        }
        if (lightboxCaption) {
            lightboxCaption.addEventListener('click', (e) => {
                if (e.target === deleteCaptionBtn) return;
                const imgObj = lightboxImages[currentLightboxIndex];
                if (!imgObj) return;
                const newCaption = prompt('Nota al pie de la imagen:', imgObj.caption || '');
                if (newCaption === null) return;
                imgObj.caption = newCaption.trim();
                updateLightboxView();
                if (activeGalleryLinkForLightbox) {
                    activeGalleryLinkForLightbox.dataset.images = JSON.stringify(lightboxImages);
                    if (currentNotesArray && currentNotesArray[activeNoteIndex]) {
                        saveCurrentNote();
                    }
                } else if (imgObj.element) {
                    imgObj.element.dataset.caption = imgObj.caption;
                    if (currentNotesArray && currentNotesArray[activeNoteIndex]) {
                        saveCurrentNote();
                    }
                }
            });
        }
        if (deleteCaptionBtn) {
            deleteCaptionBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // Remove the caption for the current image
                const imgObj = lightboxImages[currentLightboxIndex];
                if (imgObj) {
                    imgObj.caption = '';
                    updateLightboxView();
                    // Persist the updated images data back to the link and save note
                    if (activeGalleryLinkForLightbox) {
                        activeGalleryLinkForLightbox.dataset.images = JSON.stringify(lightboxImages);
                        if (currentNotesArray && currentNotesArray[activeNoteIndex]) {
                            saveCurrentNote();
                        }
                    } else if (imgObj.element) {
                        imgObj.element.dataset.caption = '';
                        if (currentNotesArray && currentNotesArray[activeNoteIndex]) {
                            saveCurrentNote();
                        }
                    }
                }
            });
        }

        // References Modal Listeners
        addReferenceSlotBtn.addEventListener('click', (e) => {
            e.preventDefault();
            referencesEditor.appendChild(createReferenceSlot());
        });
        cancelReferencesBtn.addEventListener('click', () => {
            hideModal(referencesModal);
            activeReferencesCell = null;
        });
        saveReferencesBtn.addEventListener('click', () => {
            if (!activeReferencesCell) return;
            const slots = referencesEditor.querySelectorAll('.reference-slot');
            const newReferences = Array.from(slots).map(slot => {
                return {
                    icon: slot.querySelector('.icon-display').textContent,
                    url: slot.querySelector('input').value
                };
            }).filter(ref => ref.url.trim() !== ''); // Filter out empty URLs

            const row = activeReferencesCell.closest('tr');
            row.dataset.references = JSON.stringify(newReferences);
            renderReferencesCell(activeReferencesCell);
            updateAllTotals();
            saveState();
            hideModal(referencesModal);
        });
        
        // Icon Picker Listeners
        iconPickerCategories.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (btn) {
                iconPickerCategories.querySelector('.active')?.classList.remove('active');
                btn.classList.add('active');
                loadEmojisForCategory(btn.dataset.category);
            }
        });
        emojiGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.emoji-btn');
            if (btn && activeIconPickerButton) {
                activeIconPickerButton.textContent = btn.dataset.emoji;
                hideModal(iconPickerModal);
                activeIconPickerButton = null;
            }
        });

        // Listener for adding custom icons
        if (addIconBtn) {
            addIconBtn.addEventListener('click', () => {
                if (!newIconInput) return;
                const icon = newIconInput.value.trim();
                if (!icon) return;
                const category = selectedIconCategory || Object.keys(EMOJI_CATEGORIES)[0];
                if (!EMOJI_CATEGORIES[category]) {
                    EMOJI_CATEGORIES[category] = [];
                }
                EMOJI_CATEGORIES[category].push(icon);
                newIconInput.value = '';
                loadEmojisForCategory(category);
            });
        }
        cancelIconPickerBtn.addEventListener('click', () => hideModal(iconPickerModal));

        // --- Confirmation Modal Listeners ---
        cancelConfirmationBtn.addEventListener('click', () => {
            hideModal(confirmationModal);
            if (resolveConfirmation) resolveConfirmation(false);
        });
        confirmConfirmationBtn.addEventListener('click', () => {
            hideModal(confirmationModal);
            if (resolveConfirmation) resolveConfirmation(true);
        });
        okAlertBtn.addEventListener('click', () => hideModal(alertModal));

        // --- AI Modal Listeners ---
        askAiBtn.addEventListener('click', () => {
            aiQuestionInput.value = '';
            aiResponseArea.textContent = 'Escribe tu pregunta a continuación...';
            showModal(aiQaModal);
        });
        cancelAiQaBtn.addEventListener('click', () => hideModal(aiQaModal));
        sendAiQaBtn.addEventListener('click', async () => {
            const question = aiQuestionInput.value.trim();
            if (!question) {
                showAlert("Por favor, escribe una pregunta.");
                return;
            }
            if (!API_KEY) {
                showAlert("La API Key de Gemini no está configurada.");
                return;
            }

            aiQaLoader.style.display = 'block';
            aiResponseArea.textContent = '';
            sendAiQaBtn.disabled = true;
            
            try {
                // Gather all notes content
                const allRows = document.querySelectorAll('tr[data-topic-id]');
                let notesContext = '';
                allRows.forEach(row => {
                    const notes = JSON.parse(row.dataset.notes || '[]');
                    if (notes.length > 0) {
                        const topicTitle = row.querySelector('.topic-text')?.textContent || `Tema ${row.dataset.topicId}`;
                        notes.forEach(note => {
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = note.content;
                            notesContext += `Tema: ${topicTitle}\nNota: ${note.title}\nContenido:\n${tempDiv.textContent}\n\n---\n\n`;
                        });
                    }
                });

                if (notesContext.trim() === '') {
                     throw new Error("No hay notas disponibles para analizar.");
                }

                const ai = new GoogleGenAI({ apiKey: API_KEY });
                const extraContext = uploadedFileText ? `\n\nArchivo:\n${uploadedFileText}` : '';
                const fullPrompt = `Basado en las siguientes notas de estudio${extraContext ? ' y archivo proporcionado' : ''}, responde la pregunta del usuario. Proporciona primero "Razonamiento:" y luego "Respuesta:". Contenido:\n\n${notesContext}${extraContext}\n\nPregunta: ${question}`;

                const response = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                });

                const { reasoning, answer } = splitReasoning(response.text);
                aiResponseArea.innerHTML = buildReasoningHTML(reasoning, answer);

            } catch (error) {
                console.error("AI Error:", error);
                aiResponseArea.textContent = "Error al contactar a la IA: " + error.message;
            } finally {
                aiQaLoader.style.display = 'none';
                sendAiQaBtn.disabled = false;
            }
        });

        cancelAiToolsBtn.addEventListener('click', () => hideModal(aiToolsModal));
        sendAiToolsBtn.addEventListener('click', async () => {
            const instruction = aiToolsInput.value.trim();
            if (!instruction) {
                showAlert("Por favor, escribe una instrucción.");
                return;
            }
            if (!API_KEY) {
                showAlert("La API Key de Gemini no está configurada.");
                return;
            }
            aiToolsLoader.classList.remove('hidden');
            aiToolsResponse.textContent = '';
            aiToolsThinking.textContent = '';
            sendAiToolsBtn.disabled = true;
            try {
                const selectionText = savedEditorSelection ? savedEditorSelection.toString() : '';
                const context = [selectionText, uploadedFileText].filter(Boolean).join('\n\n');
                const prompt = `Proporciona primero "Razonamiento:" con máximo tres frases y luego "Respuesta:". Instrucción: ${instruction}${context ? `\n\nTexto:\n${context}` : ''}`;
                const ai = new GoogleGenAI({ apiKey: API_KEY });
                const response = await ai.models.generateContent({
                    model: 'gemini-1.5-flash',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                });
                const { reasoning, answer } = splitReasoning(response.text);
                aiToolsGeneratedText = answer;
                aiToolsThinking.innerHTML = formatAiResponse(reasoning);
                aiToolsResponse.innerHTML = formatAiResponse(answer);
                insertAiToolsBtn.classList.remove('hidden');
            } catch (error) {
                console.error('AI Error:', error);
                aiToolsResponse.textContent = 'Error al contactar a la IA: ' + error.message;
            } finally {
                aiToolsLoader.classList.add('hidden');
                sendAiToolsBtn.disabled = false;
            }
        });
        insertAiToolsBtn.addEventListener('click', () => {
            if (!aiToolsGeneratedText) return;
            if (savedEditorSelection) {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(savedEditorSelection);
            }
            document.execCommand('insertHTML', false, formatAiResponse(aiToolsGeneratedText));
            hideModal(aiToolsModal);
            notesEditor.focus();
        });

        openAiPanelBtn.addEventListener('click', () => {
            aiPanel.classList.remove('translate-x-full');
            aiInput.focus();
        });
        closeAiPanelBtn.addEventListener('click', () => {
            aiPanel.classList.add('translate-x-full');
        });
        fileUploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    if (file.type === 'application/pdf' && pdfjsLib) {
                        uploadedFileText = await extractTextFromPDF(file);
                    } else {
                        uploadedFileText = await readTextFile(file);
                    }
                } catch (err) {
                    console.error('Error al leer el archivo:', err);
                }
            }
        });
        sendAiPanelBtn.addEventListener('click', async () => {
            const userText = aiInput.value.trim();
            if (!userText && aiToolSelect.value === 'qa') {
                showAlert("Por favor, escribe un mensaje.");
                return;
            }
            if (!API_KEY) {
                showAlert("La API Key de Gemini no está configurada.");
                return;
            }
            const tone = toneSelect.value;
            const length = lengthRange.value;
            const lang = langSelect.value;
            const notesContext = gatherNotesContext();
            const fileContext = uploadedFileText ? `\n\nContenido del archivo:\n${uploadedFileText}` : '';
            const combinedContext = notesContext + fileContext;
            let prompt = '';
            switch (aiToolSelect.value) {
                case 'summary':
                    prompt = `En ${lang} y con un tono ${tone}, resume el siguiente contenido en no más de ${length} palabras. Proporciona primero "Razonamiento:" y luego "Respuesta:".\n${combinedContext}`;
                    break;
                case 'flashcards':
                    prompt = `En ${lang} y con un tono ${tone}, crea tarjetas de estudio (pregunta: respuesta) basadas en el siguiente contenido. Limita cada tarjeta a ${length} palabras. Proporciona primero "Razonamiento:" y luego "Respuesta:".\n${combinedContext}`;
                    break;
                case 'translate':
                    prompt = `Traduce al ${lang} con un tono ${tone} el siguiente contenido. Proporciona primero "Razonamiento:" y luego "Respuesta:".\n${combinedContext}`;
                    break;
                case 'questions':
                    prompt = `En ${lang} y con un tono ${tone}, genera preguntas tipo examen con respuestas breves basadas en este contenido. Limita cada respuesta a ${length} palabras. Proporciona primero "Razonamiento:" y luego "Respuesta:".\n${combinedContext}`;
                    break;
                default:
                    prompt = `Responde en ${lang} con un tono ${tone} y no más de ${length} palabras a la siguiente consulta del usuario utilizando el contexto. Proporciona primero "Razonamiento:" y luego "Respuesta:".\n\nContexto:\n${combinedContext}\n\nPregunta: ${userText}`;
            }
            appendMessage('user', userText || aiToolSelect.options[aiToolSelect.selectedIndex].textContent);
            aiInput.value = '';
            aiStatus.classList.remove('hidden');
            sendAiPanelBtn.disabled = true;
            try {
                const ai = new GoogleGenAI({ apiKey: API_KEY });
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                });
                const { reasoning, answer } = splitReasoning(response.text);
                const assistantBubble = createMessageElement('assistant');
                assistantBubble.innerHTML = buildReasoningHTML(reasoning, answer);
                aiMessages.scrollTop = aiMessages.scrollHeight;
            } catch (error) {
                console.error("AI Error:", error);
                const errBubble = createMessageElement('assistant');
                errBubble.textContent = "Error al contactar a la IA: " + error.message;
            } finally {
                aiStatus.classList.add('hidden');
                sendAiPanelBtn.disabled = false;
            }
        });

        generateCanvasBtn.addEventListener('click', async () => {
            if (!API_KEY) {
                showAlert("La API Key de Gemini no está configurada.");
                return;
            }
            aiCanvasReasoning.innerHTML = '';
            aiStatus.classList.remove('hidden');
            generateCanvasBtn.disabled = true;
            try {
                const ai = new GoogleGenAI({ apiKey: API_KEY });
                const prompt = 'Genera una lista JSON de hasta cinco figuras simples (rect o circle) para dibujar en un canvas de 300x300. Proporciona primero "Razonamiento:" y luego "Respuesta:".';
                const response = await ai.models.generateContent({
                    model: 'gemini-1.5-flash',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                });
                const { reasoning, answer } = splitReasoning(response.text);
                aiCanvasReasoning.innerHTML = formatAiResponse(reasoning);
                drawCanvasFromDescription(answer);
            } catch (err) {
                console.error('AI Canvas Error:', err);
                showAlert('Error al generar canvas.');
            } finally {
                aiStatus.classList.add('hidden');
                generateCanvasBtn.disabled = false;
            }
        });

        // Close dropdowns when clicking outside
        window.addEventListener('click', (e) => {
            if (!settingsBtn.contains(e.target) && !settingsDropdown.contains(e.target)) {
                settingsDropdown.classList.add('hidden');
            }
            document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
                if (!d.parentElement.contains(e.target)) {
                    d.classList.remove('visible');
                }
            });
        });

        window.addEventListener('beforeunload', saveState);

    }


    function init() {
        initializeCells();
        setupEditorToolbar();
        populateIconPicker();
        loadState();
        setupEventListeners();
        document.querySelectorAll('table').forEach(initTableResize);
        applyTheme(document.documentElement.dataset.theme || 'default');
        setupAdvancedSearchReplace();
        setupKeyboardShortcuts();
        setupCloudIntegration();
    }

    init();
});