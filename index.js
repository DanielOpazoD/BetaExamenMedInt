

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// Import the database helper from a separate module.  This replaces the
// inline IndexedDB implementation and keeps the rest of the code unchanged.
import db from './db.js';
import { makeTableResizable } from './table-resize.js';
import { setupAdvancedSearchReplace } from './search-replace.js';
import { setupKeyboardShortcuts } from './shortcuts.js';
import { setupCloudIntegration } from './cloud-sync.js';
import { setupAdvancedEditing } from './editor-enhancements.js';
import { improveText, askNotesQuestion } from './ai-tools.js';
import { setupImageTools } from './image-tools.js';

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
    const notesModalContent = notesModal.querySelector('.notes-modal-content');
    const saveNoteBtn = getElem('save-note-btn');
    const saveAndCloseNoteBtn = getElem('save-and-close-note-btn');
    const cancelNoteBtn = getElem('cancel-note-btn');
    const unmarkNoteBtn = getElem('unmark-note-btn');
    const progressBar = getElem('progress-bar');
    const printAllBtn = getElem('print-all-btn');
    const exportBtn = getElem('export-btn');
    const importBtn = getElem('import-btn');
    const askNotesBtn = getElem('ask-notes-btn');
    const importFileInput = getElem('import-file-input');
    const exportNoteBtn = getElem('export-note-btn');
    const importNoteBtn = getElem('import-note-btn');
    const importNoteFileInput = getElem('import-note-file-input');
    const settingsBtn = getElem('settings-btn');
    const settingsDropdown = getElem('settings-dropdown');
    const statusFiltersContainer = getElem('status-filters');
    const saveConfirmation = getElem('save-confirmation');
    const toggleReadOnlyBtn = getElem('toggle-readonly-btn');
    const lockNoteBtn = getElem('lock-note-btn');
    const lockClosedIcon = lockNoteBtn?.querySelector('.lock-closed-icon');
    const lockOpenIcon = lockNoteBtn?.querySelector('.lock-open-icon');
    const toggleAllSectionsBtn = getElem('toggle-all-sections-btn');
    let sectionStylesheet = '';
    if (typeof fetch === 'function') {
        fetch('index.css').then(resp => resp.text()).then(css => {
            sectionStylesheet = css;
        }).catch(() => {
            sectionStylesheet = '';
        });
    }

    // --- Undo/Redo History ---
    const historyStack = [];
    let historyIndex = -1;
    const recordHistory = () => {
        const html = notesEditor.innerHTML;
        if (historyStack[historyIndex] !== html) {
            historyStack.splice(historyIndex + 1);
            historyStack.push(html);
            if (historyStack.length > 100) {
                historyStack.shift();
            }
            historyIndex = historyStack.length - 1;
        }
    };
    const undoAction = () => {
        if (historyIndex > 0) {
            historyIndex--;
            notesEditor.innerHTML = historyStack[historyIndex];
        }
    };
    const redoAction = () => {
        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            notesEditor.innerHTML = historyStack[historyIndex];
        }
    };

    function resetHistory(content = notesEditor.innerHTML) {
        historyStack.length = 0;
        historyStack.push(content);
        historyIndex = 0;
    }
    notesEditor.addEventListener('input', recordHistory);
    notesEditor.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redoAction();
            } else {
                undoAction();
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            redoAction();
        }
        if (notesEditor) {
            notesEditor.querySelectorAll('.editor-tooltip').forEach(normalizeTooltipElement);
        }
    });

    notesEditor.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            let node = sel.anchorNode;
            if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
            if (!node || node === notesEditor) return;
            const prev = node.previousElementSibling;
            if (prev) {
                const indentClass = Array.from(prev.classList).find(c => c.startsWith('indent-'));
                if (indentClass) node.classList.add(indentClass);
            }
        }
    });

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
    const htmlFavoriteTags = getElem('html-favorite-tags');
    const htmlFavoritesList = getElem('html-favorites-list');
    const templateSearch = getElem('template-search');
    const templateSort = getElem('template-sort');
    const toggleTemplateEdit = getElem('toggle-template-edit');
    const exportHtmlFavoritesBtn = getElem('export-html-favorites');
    const importHtmlFavoritesBtn = getElem('import-html-favorites');
    const importHtmlFile = getElem('import-html-file');
    const tagFilter = getElem('tag-filter');
    const prevTemplatePage = getElem('prev-template-page');
    const nextTemplatePage = getElem('next-template-page');
    const templatePageInfo = getElem('template-page-info');
    const htmlFavoriteToast = getElem('html-favorite-toast');
    let currentHtmlEditor = null;
    let editingFavoriteIndex = null;

    const noteTabsBar = getElem('note-tabs-bar');
    const noteTabs = getElem('note-tabs');
    const tabsPrev = getElem('tabs-prev');
    const tabsNext = getElem('tabs-next');
    const tabConfigBtn = getElem('tab-config-btn');
    const tabConfigPanel = getElem('tab-config-panel');
    const tabBarToggle = getElem('tab-bar-toggle');
    const tabColorSelect = getElem('tab-color-select');
    const fullscreenBgInput = getElem('fullscreen-bg-color');
    const tabPositionSelect = getElem('tab-position-select');
    const showTabBarBtn = getElem('show-tab-bar-btn');
    const minimizeNoteBtn = getElem('minimize-note-btn');
    const restoreNoteBtn = getElem('restore-note-btn');

    let openNoteTabs = [];
    let activeTabId = null;
    let tabPosition = 'top';
    let blockDragEnabled = false;
    let fullscreenEnabled = false;
    let savedEditorWidth = 0;
    let draggedBlock = null;
    let manualReadOnly = false;
    let noteLocked = false;
    let hideInlineColorControlsFn = null;

    if (minimizeNoteBtn && restoreNoteBtn) {
        minimizeNoteBtn.addEventListener('click', () => {
            notesModal.classList.remove('visible');
            restoreNoteBtn.classList.remove('hidden');
        });
        restoreNoteBtn.addEventListener('click', () => {
            notesModal.classList.add('visible');
            restoreNoteBtn.classList.add('hidden');
        });
    }

    if (tabConfigBtn && tabConfigPanel) {
        tabConfigBtn.addEventListener('click', () => {
            tabConfigPanel.classList.toggle('hidden');
        });
    }

    if (tabBarToggle) {
        tabBarToggle.addEventListener('change', () => {
            const show = tabBarToggle.checked;
            noteTabsBar.classList.toggle('hidden', !show || openNoteTabs.length === 0);
            showTabBarBtn.classList.toggle('hidden', show);
            if (!show) tabConfigPanel.classList.add('hidden');
        });
    }

    if (showTabBarBtn) {
        showTabBarBtn.addEventListener('click', () => {
            tabBarToggle.checked = true;
            noteTabsBar.classList.toggle('hidden', openNoteTabs.length === 0);
            showTabBarBtn.classList.add('hidden');
        });
    }

    if (tabColorSelect) {
        tabColorSelect.addEventListener('change', (e) => {
            noteTabsBar.style.setProperty('--tab-bar-bg', e.target.value);
            showTabBarBtn.style.backgroundColor = e.target.value;
        });
        noteTabsBar.style.setProperty('--tab-bar-bg', tabColorSelect.value);
        showTabBarBtn.style.backgroundColor = tabColorSelect.value;
    }

    if (fullscreenBgInput) {
        const initialFullscreenBg = getComputedStyle(document.documentElement).getPropertyValue('--fullscreen-bg-color').trim();
        if (initialFullscreenBg) {
            fullscreenBgInput.value = initialFullscreenBg;
        }
        fullscreenBgInput.addEventListener('input', (e) => {
            document.documentElement.style.setProperty('--fullscreen-bg-color', e.target.value);
        });
    }

    const H_BAR_SIZE = 32;
    const V_BAR_SIZE = 150;

    function setTabBarPosition(pos) {
        tabPosition = pos;
        const classes = ['tab-bar-top','tab-bar-bottom','tab-bar-left','tab-bar-right'];
        noteTabsBar.classList.remove(...classes);
        noteTabsBar.classList.add('tab-bar-' + pos);
        noteTabs.style.flexDirection = (pos === 'left' || pos === 'right') ? 'column' : 'row';
        document.body.style.paddingTop = document.body.style.paddingBottom = document.body.style.paddingLeft = document.body.style.paddingRight = '';
        if (pos === 'top') document.body.style.paddingTop = `${H_BAR_SIZE}px`;
        if (pos === 'bottom') document.body.style.paddingBottom = `${H_BAR_SIZE}px`;
        if (pos === 'left') document.body.style.paddingLeft = `${V_BAR_SIZE}px`;
        if (pos === 'right') document.body.style.paddingRight = `${V_BAR_SIZE}px`;
        tabsPrev.textContent = (pos === 'left' || pos === 'right') ? '▲' : '◀';
        tabsNext.textContent = (pos === 'left' || pos === 'right') ? '▼' : '▶';
        updateTabNav();
    }

    if (tabPositionSelect) {
        tabPositionSelect.addEventListener('change', (e) => setTabBarPosition(e.target.value));
        setTabBarPosition(tabPositionSelect.value);
    }

    function isVertical() {
        return tabPosition === 'left' || tabPosition === 'right';
    }

    function updateTabNav() {
        if (!noteTabs || !tabsPrev || !tabsNext) return;
        const overflow = isVertical()
            ? noteTabs.scrollHeight > noteTabs.clientHeight
            : noteTabs.scrollWidth > noteTabs.clientWidth;
        tabsPrev.classList.toggle('hidden', !overflow);
        tabsNext.classList.toggle('hidden', !overflow);
    }

    function scrollTabs(delta) {
        if (!noteTabs) return;
        if (isVertical()) {
            noteTabs.scrollBy({ top: delta, behavior: 'smooth' });
        } else {
            noteTabs.scrollBy({ left: delta, behavior: 'smooth' });
        }
    }

    if (tabsPrev && tabsNext && noteTabs) {
        tabsPrev.addEventListener('click', () => scrollTabs(-100));
        tabsNext.addEventListener('click', () => scrollTabs(100));
        noteTabs.addEventListener('scroll', updateTabNav);
        window.addEventListener('resize', updateTabNav);
    }
    let favoritesEditMode = false;
    let templateSearchQuery = '';
    let templateSortMode = 'recent';
    let templateTagFilter = null;
    let templatePage = 0;
    const TEMPLATES_PER_PAGE = 20;
    let undoTimer = null;
    let deletedFavorite = null;
    const DEFAULT_HTML_FAVORITES = [
        {
            name: "Verde Nota",
            code: "<blockquote style=\"margin: 0px 0px 0px 40px; border: none; padding: 0px; line-height: 1.4;\"><div style=\"line-height: 1.4;\"><div style=\"line-height: 1.4;\"><div style=\"border-left-width: 4px; border-left-color: rgb(46, 125, 50); background: rgb(244, 250, 244); padding: 10px; margin: 8px 0px 8px -19px; border-radius: 6px; line-height: 1.4; width: 645px;\" class=\"note-resizable\"><div class=\"section-title\" style=\"font-weight: bold; color: rgb(0, 0, 0); font-family: sans-serif; line-height: 1.4;\"><br></div></div></div></div></blockquote><span style=\"background-color: rgb(230, 230, 250);\"><b><div></div></b></span>",
            tags: [],
            favorite: false,
            uses: 0,
            created: 1755964280115
        },
        {
            name: "Gris nota",
            code: "<p><br></p><div style=\"background: rgb(245, 245, 245); padding: 10px; border-radius: 6px; box-shadow: rgba(0, 0, 0, 0.1) 0px 2px 4px; line-height: 1.2; width: 660px; margin-left: 39px;\" class=\"note-resizable\"><font face=\"sans-serif\"><font size=\"2\" style=\"\"><b>➖</b></font></font></div>",
            tags: [],
            favorite: false,
            uses: 3,
            created: 1755964361117
        },
        {
            name: "Azul Nota",
            code: "<div><div style=\"border-left-width: 4px; border-left-color: rgb(25, 118, 210); background: rgb(244, 250, 255); padding: 10px; margin: 8px 0px 8px 20px; border-radius: 6px; font-family: sans-serif; width: 775px;\" class=\"note-resizable\"><span id=\"docs-internal-guid-286844bf-7fff-cd10-d707-b68257dda577\" style=\"\"><span style=\"font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant-numeric: normal; font-variant-east-asian: normal; font-variant-alternates: normal; font-variant-position: normal; font-variant-emoji: normal; vertical-align: baseline; white-space-collapse: preserve;\"><b style=\"\">P</b></span></span></div></div><div></div>",
            tags: [],
            favorite: true,
            uses: 3,
            created: 1755964529820
        },
        {
            name: "Múltiples notas amarillas",
            code: "<!-- Contenedor flexible para varias notas en fila -->\n<div style=\"display:flex; gap:12px; flex-wrap:wrap; margin:8px 0;\">\n  <!-- Nota adhesiva 1 -->\n  <div style=\"background:#fffde7; color:#424242; font-family:sans-serif; font-size:14px; padding:10px; border-radius:6px; width:200px; box-shadow:2px 2px 4px rgba(0,0,0,0.2);\">\n    📌 Nota 1: Revisar creatinina.\n  </div>\n\n  <!-- Nota adhesiva 2 -->\n  <div style=\"background:#fffde7; color:#424242; font-family:sans-serif; font-size:14px; padding:10px; border-radius:6px; width:200px; box-shadow:2px 2px 4px rgba(0,0,0,0.2);\">\n    📌 Nota 2: Control de TA.\n  </div>\n\n  <!-- Nota adhesiva 3 -->\n  <div style=\"background:#fffde7; color:#424242; font-family:sans-serif; font-size:14px; padding:10px; border-radius:6px; width:200px; box-shadow:2px 2px 4px rgba(0,0,0,0.2);\">\n    📌 Nota 3: Solicitar HbA1c.\n  </div>\n</div>\n",
            tags: [],
            favorite: false,
            uses: 3,
            created: 1755965299761
        },
        {
            name: "Etiquetas colores",
            code: "<span style=\"font-family: sans-serif; display: inline-block; background: rgb(224, 247, 250); color: rgb(0, 96, 100); padding: 3px 8px; border-radius: 14px; margin: 2px; font-size: 12px;\">HTA</span><span style=\"color: rgb(38, 50, 56); font-family: sans-serif; font-size: 13px;\">&nbsp;</span><span style=\"font-family: sans-serif; display: inline-block; background: rgb(252, 228, 236); color: rgb(136, 14, 79); padding: 3px 8px; border-radius: 14px; margin: 2px; font-size: 12px;\">DM2</span><span style=\"color: rgb(38, 50, 56); font-family: sans-serif; font-size: 13px;\">&nbsp;</span><span style=\"font-family: sans-serif; display: inline-block; background: rgb(241, 248, 233); color: rgb(27, 94, 32); padding: 3px 8px; border-radius: 14px; margin: 2px; font-size: 12px;\">ERC</span><span style=\"color: rgb(38, 50, 56); font-family: sans-serif; font-size: 13px;\">&nbsp;</span><span style=\"font-family: sans-serif; display: inline-block; background: rgb(255, 243, 224); color: rgb(230, 81, 0); padding: 3px 8px; border-radius: 14px; margin: 2px; font-size: 12px;\">Lípidos</span><br><div></div>",
            tags: [],
            favorite: false,
            uses: 3,
            created: 1755966140116
        },
        {
            name: "Secciones",
            code: "<p><b>1. Introducción</b></p><hr id=\"null\"><p><b><br></b></p><p><b>2. Epidemiología</b></p><hr id=\"null\"><p><b><br></b></p><p><b>3. Etiología</b></p><hr id=\"null\"><p><b><br></b></p><p><b>4. Presentación clínica</b></p><hr id=\"null\"><p><b><br></b></p><p><b>5. Diagnostico</b></p><hr id=\"null\"><p><b><br></b></p><p><b>6. Tratamiento</b></p><hr id=\"null\"><p><b><br></b></p><p><b>Referencias</b></p>",
            tags: [],
            favorite: false,
            uses: 2,
            created: 1755969422021
        },
        {
            name: "Títulos de colores",
            code: "<div style=\"padding-left: 6px; padding-right: 6px; margin-top: 0px; margin-bottom: 0px; border-radius: 6px;\">\n  <!-- Amarillo -->\n  <div style=\"background: linear-gradient(to right, #fffde7, #fff176); color:#795548; font-weight:bold; padding:6px 12px; border-radius:20px; display:inline-block; margin:6px 4px;\">Amarillo</div>\n\n  <!-- Naranjo -->\n  <div style=\"background: linear-gradient(to right, #ffe0b2, #ff9800); color:#4e342e; font-weight:bold; padding:6px 12px; border-radius:20px; display:inline-block; margin:6px 4px;\">Naranjo</div>\n\n  <!-- Azul -->\n  <div style=\"background: linear-gradient(to right, #bbdefb, #2196f3); color:#0d47a1; font-weight:bold; padding:6px 12px; border-radius:20px; display:inline-block; margin:6px 4px;\">Azul</div>\n\n  <!-- Celeste -->\n  <div style=\"background: linear-gradient(to right, #e1f5fe, #4fc3f7); color:#01579b; font-weight:bold; padding:6px 12px; border-radius:20px; display:inline-block; margin:6px 4px;\">Celeste</div>\n\n  <!-- Verde oscuro -->\n  <div style=\"background: linear-gradient(to right, #c8e6c9, #388e3c); color:#1b5e20; font-weight:bold; padding:6px 12px; border-radius:20px; display:inline-block; margin:6px 4px;\">Verde oscuro</div>\n\n  <!-- Verde claro -->\n  <div style=\"background: linear-gradient(to right, #dcedc8, #8bc34a); color:#33691e; font-weight:bold; padding:6px 12px; border-radius:20px; display:inline-block; margin:6px 4px;\">Verde claro</div>\n\n  <!-- Morado -->\n  <div style=\"background: linear-gradient(to right, #e1bee7, #9c27b0); color:#4a148c; font-weight:bold; padding:6px 12px; border-radius:20px; display:inline-block; margin:6px 4px;\">Morado</div>\n\n  <!-- Café -->\n  <div style=\"background: linear-gradient(to right, #d7ccc8, #795548); color:#3e2723; font-weight:bold; padding:6px 12px; border-radius:20px; display:inline-block; margin:6px 4px;\">Café</div>\n\n  <!-- Gris -->\n  <div style=\"background: linear-gradient(to right, #f5f5f5, #9e9e9e); color:#212121; font-weight:bold; padding:6px 12px; border-radius:20px; display:inline-block; margin:6px 4px;\">Gris</div>\n\n  <!-- Rojo -->\n  <div style=\"background: linear-gradient(to right, #ffcdd2, #f44336); color:#b71c1c; font-weight:bold; padding:6px 12px; border-radius:20px; display:inline-block; margin:6px 4px;\">Rojo</div>\n</div>\n",
            tags: [],
            favorite: false,
            uses: 0,
            created: 1756056072113
        }
    ];
    let htmlFavorites = [];

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
    let toolbarIcons;
    const iconDropdownRenderers = [];
    const charDropdownRenderers = [];

    toolbarIcons = [
        "💡", "⚠️", "📌", "📍", "✴️", "🟢", "🟡", "🔴", "✅", "☑️", "❌", "➡️",
        "⬅️", "➔", "👉", "↳", "▪️", "▫️", "🔵", "🔹", "🔸", "➕", "➖",
        "📂", "📄", "📝", "📋", "📎", "🔑", "📈", "📉", "🩺", "💉", "💊",
        "🩸", "🧪", "🔬", "🩻", "🦠", "✔️", "✖️", "❔", "⭐", "📚", "📑",
        "📊", "🔎", "📏", "o", "▪︎", "●", "○", "◆", "□", "🟠", "🟥",
        "🟧", "🟨", "🟩", "🟦"
    ];

    globalSpecialChars = [
        '∞','±','≈','•','‣','↑','↓','→','←','↔','⇧','⇩','⇨','⇦','↗','↘','↙','↖',
        '➤','⇒','⮕','▸','▹','✦','✱','✪','✽','~'
    ];

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
    const subNoteModalContent = subNoteModal ? subNoteModal.querySelector('.notes-modal-content') : null;
    const toggleHtmlPasteBtn = getElem('toggle-html-paste-btn');
    const dragBtn = getElem('toggle-block-drag-btn');
    const fullscreenBtn = getElem('toggle-fullscreen-btn');

    const tabGuideBtn = getElem('tab-guide-btn');
    const uiGuideModal = getElem('ui-guide-modal');
    const closeUiGuideBtn = getElem('close-ui-guide-btn');
    const uiGuideSections = getElem('ui-guide-sections');

    let htmlPasteEnabled = false;

    const UI_ICON_STRINGS = {
        codeToggle: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-code w-5 h-5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
        fullscreen: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-maximize-2 w-5 h-5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><polyline points="21 15 21 21 15 21"/><polyline points="3 9 3 3 9 3"/></svg>`,
        noteInfo: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info w-5 h-5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
        quickNote: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sticky-note w-5 h-5"><path d="M3 3h12l6 6v12H3z"/><path d="M15 3v6h6"/></svg>`,
        readonly: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye w-5 h-5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
        importNote: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload w-5 h-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
        exportNote: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download w-5 h-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
        minimize: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus w-5 h-5"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
        type: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-type w-4 h-4"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>`,
        highlighter: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-highlighter w-4 h-4"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`,
        highlightSize: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down w-4 h-4"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>`,
        indentDecrease: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-indent-decrease w-5 h-5"><polyline points="7 8 3 12 7 16"/><line x1="21" x2="3" y1="12" y2="12"/><line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="3" y1="18" y2="18"/></svg>`,
        indentIncrease: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-indent-increase w-5 h-5"><polyline points="17 8 21 12 17 16"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="17" y1="6" y2="6"/><line x1="3" x2="17" y1="18" y2="18"/></svg>`,
        collapsibleList: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-tree w-5 h-5"><path d="M21 7H9"/><path d="M21 12H9"/><path d="M21 17H9"/><path d="M3 17v-6a4 4 0 0 1 4-4h4"/></svg>`,
        subnote: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-pen-line w-5 h-5"><path d="m18 12-4 4-1 4 4-1 4-4"/><path d="M12 22h6"/><path d="M7 12h10"/><path d="M5 17h10"/><path d="M5 7h10"/><path d="M15 2H9a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/></svg>`,
        gallery: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-gallery-horizontal-end w-5 h-5"><path d="M2 7v10"/><path d="M6 5v14"/><rect width="12" height="18" x="10" y="3" rx="2"/></svg>`
    };

    const UI_WINDOW_GUIDE_ITEMS = [
        { icon: '📚', shortName: 'Referencias', codeName: 'references-editor', description: 'Gestiona la lista de referencias asociadas al tema seleccionado.' },
        { icon: '😀', shortName: 'Selector de iconos', codeName: 'icon-picker', description: 'Permite elegir emojis o SVG para botones, notas y elementos personalizados.' },
        { icon: '🧰', shortName: 'Gestor de iconos', codeName: 'icon-manager', description: 'Administra la colección de iconos guardados para añadir o quitar opciones del selector.' },
        { icon: '🔡', shortName: 'Gestor de caracteres', codeName: 'character-manager', description: 'Define los caracteres especiales disponibles en el menú correspondiente.' },
        { icon: '🔗', shortName: 'Editor de enlaces', codeName: 'link-editor', description: 'Crea o modifica hipervínculos que se insertan en el contenido de la nota.' },
        { icon: '📝', shortName: 'Editor principal', codeName: 'notes-modal', description: 'Ventana principal para redactar, formatear y administrar el contenido de la nota.' },
        { icon: '&lt;/&gt;', shortName: 'Plantillas HTML', codeName: 'html-template', description: 'Inserta fragmentos HTML predefinidos o guardados como favoritos.', isHtml: true },
        { icon: '&lt;HTML&gt;', shortName: 'HTML seleccionado', codeName: 'selected-html', description: 'Muestra el código HTML del contenido actualmente seleccionado.', isHtml: true },
        { icon: 'ℹ️', shortName: 'Información de nota', codeName: 'note-info', description: 'Resume métricas de la nota como palabras, peso en disco y última edición.' },
        { icon: '❓', shortName: 'Confirmación', codeName: 'confirmation-modal', description: 'Solicita confirmar acciones sensibles antes de continuar.' },
        { icon: '🖼️', shortName: 'Galería de imágenes', codeName: 'gallery-editor', description: 'Define las URLs que conforman una galería activada desde el editor.' },
        { icon: '🖼️🔍', shortName: 'Visor de imágenes', codeName: 'image-lightbox', description: 'Revisa imágenes insertadas con zoom, navegación y descarga.' },
        { icon: '⚠️', shortName: 'Alertas', codeName: 'alert-modal', description: 'Muestra mensajes informativos o de error que requieren atención.' },
        { icon: '🗒️', shortName: 'Nota rápida', codeName: 'postit-modal', description: 'Crea pequeñas notas adhesivas asociadas a la nota principal.' },
        { icon: '🧾', shortName: 'Sub-notas', codeName: 'subnote-modal', description: 'Abre las sub-notas vinculadas para revisarlas o editarlas en una ventana dedicada.' },
        { icon: '🎨', shortName: 'Estilos de nota', codeName: 'note-style', description: 'Configura el diseño visual de las notas resaltadas (callouts).' }
    ];

    function renderUiGuideSections() {
        if (!uiGuideSections) return;
        const sections = [
            { title: 'Barra de edición de texto', rows: buildToolbarGuideItems() },
            { title: 'Ventanas y paneles', rows: UI_WINDOW_GUIDE_ITEMS }
        ];

        uiGuideSections.innerHTML = '';
        sections.forEach(section => {
            if (!section.rows || section.rows.length === 0) return;
            const sectionContainer = document.createElement('div');
            sectionContainer.className = 'ui-guide-section';

            const heading = document.createElement('h4');
            heading.textContent = section.title;
            sectionContainer.appendChild(heading);

            const table = document.createElement('table');
            table.className = 'ui-guide-table';

            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th class="icon-cell">Icono</th><th>Nombre</th><th class="code-cell">Código</th><th>Función</th></tr>';
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            section.rows.forEach(row => {
                const tr = document.createElement('tr');

                const iconCell = document.createElement('td');
                iconCell.className = 'icon-cell';
                if (row.isHtml) {
                    iconCell.innerHTML = row.icon;
                } else {
                    iconCell.textContent = row.icon;
                }

                const nameCell = document.createElement('td');
                nameCell.textContent = row.shortName;

                const codeCell = document.createElement('td');
                codeCell.className = 'code-cell';
                codeCell.textContent = row.codeName;

                const descCell = document.createElement('td');
                descCell.textContent = row.description;

                tr.append(iconCell, nameCell, codeCell, descCell);
                tbody.appendChild(tr);
            });

            table.appendChild(tbody);
            sectionContainer.appendChild(table);
            uiGuideSections.appendChild(sectionContainer);
        });
    }

    if (tabGuideBtn && uiGuideModal) {
        tabGuideBtn.addEventListener('click', () => {
            renderUiGuideSections();
            showModal(uiGuideModal);
        });
    }

    if (closeUiGuideBtn && uiGuideModal) {
        closeUiGuideBtn.addEventListener('click', () => hideModal(uiGuideModal));
    }

    if (uiGuideModal) {
        uiGuideModal.addEventListener('click', (event) => {
            if (event.target === uiGuideModal) {
                hideModal(uiGuideModal);
            }
        });
    }

    function sanitizeHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        div.querySelectorAll('script,style').forEach(el => el.remove());
        return div.innerHTML;
    }

    if (toggleHtmlPasteBtn) {
        toggleHtmlPasteBtn.addEventListener('click', () => {
            htmlPasteEnabled = !htmlPasteEnabled;
            toggleHtmlPasteBtn.classList.toggle('active', htmlPasteEnabled);
        });
    }

    [notesEditor, subNoteEditor].forEach(editor => {
        if (editor) {
            editor.addEventListener('paste', (e) => {
                const clipboard = e.clipboardData || window.clipboardData;
                const items = clipboard.items;
                const imageItems = items ? Array.from(items).filter(item => item.type && item.type.startsWith('image/')) : [];
                if (imageItems.length > 0) {
                    // Let image-tools.js handle image pasting to avoid duplicates
                    return;
                }
                e.preventDefault();
                const html = clipboard.getData('text/html');
                if (htmlPasteEnabled && html) {
                    document.execCommand('insertHTML', false, sanitizeHtml(html));
                } else {
                    const text = clipboard.getData('text/plain');
                    document.execCommand('insertText', false, text);
                }
            });
        }
    });
    const subNoteToolbar = getElem('subnote-toolbar');
    const saveCloseSubnoteBtn = getElem('save-close-subnote-btn');
    const saveSubnoteBtn = getElem('save-subnote-btn');
    const cancelSubnoteBtn = getElem('cancel-subnote-btn');
    const toggleSubnoteReadOnlyBtn = getElem('toggle-subnote-readonly-btn');

    const TOOLTIP_ICON_OPTIONS = ['✽', '✱', '🟢', '🔵', '●', '◆', 'ℹ️'];
    const DEFAULT_TOOLTIP_ICON = 'ℹ️';

    let toolbarSelectedTooltipIcon = DEFAULT_TOOLTIP_ICON;
    let tooltipIconSelector = null;
    let tooltipIconButtons = [];
    let tooltipIconPickerBtn = null;
    let tooltipIconOutsideHandler = null;
    let hideTooltipIconSelector = () => {};
    let normalizeTooltipElement = () => {};

    // Note style modal elements
    const noteStyleModal = getElem('note-style-modal');
    const noteStyleTabPre = getElem('note-style-tab-pre');
    const noteStyleTabCustom = getElem('note-style-tab-custom');
    const noteStylePre = getElem('note-style-pre');
    const noteStyleCustom = getElem('note-style-custom');
    const noteBgColorInput = getElem('note-bg-color');
    const noteBorderColorInput = getElem('note-border-color');
    const noteTextColorInput = getElem('note-text-color');
    const noteRadiusInput = getElem('note-radius');
    const noteBorderWidthInput = getElem('note-border-width');
    const notePaddingInput = getElem('note-padding');
    const noteMarginInput = getElem('note-margin');
    const noteShadowInput = getElem('note-shadow');
    const applyNoteStyleBtn = getElem('apply-note-style-btn');
    const cancelNoteStyleBtn = getElem('cancel-note-style-btn');

    let savedNoteScrollY = 0;
    let savedNoteScrollTop = 0;

    function createNoteColorPalette(input, colors) {
        const palette = document.createElement('div');
        palette.className = 'note-color-palette';
        colors.forEach(color => {
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch';
            if (color === 'transparent') {
                swatch.style.backgroundImage = 'linear-gradient(to top left, transparent calc(50% - 1px), red, transparent calc(50% + 1px))';
                swatch.style.backgroundColor = 'var(--bg-secondary)';
            } else {
                swatch.style.backgroundColor = color;
            }
            swatch.addEventListener('click', (e) => {
                e.preventDefault();
                input.value = color;
            });
            palette.appendChild(swatch);
        });
        input.insertAdjacentElement('afterend', palette);
    }

    const paletteTextColors = ['#000000', '#FF0000', '#0000FF', '#008000', '#FFA500', '#FFFF00', '#800080', '#FFC0CB', '#00FFFF', '#00008B', '#8B0000', '#FF8C00', '#FFD700', '#ADFF2F', '#4B0082', '#48D1CC', '#191970', '#A52A2A', '#F0E68C', '#ADD8E6', '#DDA0DD', '#90EE90', '#FA8072'];
    const paletteBgColors = ['#FAFAD2', 'transparent', '#FFFFFF', '#FFFF00', '#ADD8E6', '#F0FFF0', '#FFF0F5', '#F5FFFA', '#F0F8FF', '#E6E6FA', '#FFF5EE', '#FAEBD7', '#FFE4E1', '#FFFFE0', '#D3FFD3', '#B0E0E6', '#FFB6C1', '#F5DEB3', '#C8A2C8', '#FFDEAD', '#E0FFFF', '#FDF5E6', '#FFFACD', '#F8F8FF', '#D3D3D3', '#A9A9A9', '#696969', '#C4A484', '#A0522D', '#8B4513'];

    createNoteColorPalette(noteBgColorInput, paletteBgColors);
    createNoteColorPalette(noteBorderColorInput, paletteBgColors);
    createNoteColorPalette(noteTextColorInput, paletteTextColors);

    let activeResizableCallout = null;

    function addCalloutResizeHandles(callout) {
        removeCalloutResizeHandles(callout);
        const br = document.createElement('div');
        br.className = 'note-resize-handle br';
        const bl = document.createElement('div');
        bl.className = 'note-resize-handle bl';
        callout.appendChild(br);
        callout.appendChild(bl);

        const tools = document.createElement('div');
        tools.className = 'note-callout-tools';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'note-callout-btn toolbar-btn copy';
        copyBtn.title = 'Copiar HTML';
        copyBtn.textContent = '📋';
        copyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigator.clipboard?.writeText(callout.outerHTML || '');
        });

        const richCopyBtn = document.createElement('button');
        richCopyBtn.className = 'note-callout-btn toolbar-btn copy-rich';
        richCopyBtn.title = 'Copiar nota con formato';
        richCopyBtn.textContent = '📄';
        richCopyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const html = callout.outerHTML || '';
            if (navigator.clipboard?.write) {
                const blob = new Blob([html], { type: 'text/html' });
                const plain = new Blob([callout.innerText || ''], { type: 'text/plain' });
                navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': plain })]);
            } else {
                navigator.clipboard?.writeText(html);
            }
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'note-callout-btn toolbar-btn delete';
        delBtn.title = 'Eliminar nota';
        delBtn.textContent = '🗑';
        delBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            callout.remove();
            if (activeResizableCallout === callout) {
                activeResizableCallout = null;
            }
        });
        tools.appendChild(copyBtn);
        tools.appendChild(richCopyBtn);
        tools.appendChild(delBtn);
        callout.appendChild(tools);

        const start = (e, corner) => {
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = callout.offsetWidth;
            const startHeight = callout.offsetHeight;
            const startMargin = parseFloat(getComputedStyle(callout).marginLeft) || 0;
            function onMove(evt) {
                const dx = evt.clientX - startX;
                const dy = evt.clientY - startY;
                if (corner === 'br') {
                    callout.style.width = startWidth + dx + 'px';
                } else {
                    callout.style.width = Math.max(30, startWidth - dx) + 'px';
                    callout.style.marginLeft = startMargin + dx + 'px';
                }
                callout.style.height = startHeight + dy + 'px';
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };

        br.addEventListener('mousedown', e => start(e, 'br'));
        bl.addEventListener('mousedown', e => start(e, 'bl'));
    }

    function removeCalloutResizeHandles(callout) {
        if (!callout) return;
        callout.querySelectorAll('.note-resize-handle').forEach(h => h.remove());
        callout.querySelectorAll('.note-callout-tools').forEach(t => t.remove());
    }

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

        // Run a callback while preserving the current text selection
        const withSubnoteSelection = (fn) => {
            const sel = window.getSelection();
            const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
            const scrollY = window.scrollY;
            const modalScroll = notesModalContent.scrollTop;
            fn();
            if (range) {
                sel.removeAllRanges();
                sel.addRange(range);
                const active = document.activeElement;
                active?.focus?.({ preventScroll: true });
            }
            requestAnimationFrame(() => {
                window.scrollTo(0, scrollY);
                notesModalContent.scrollTop = modalScroll;
            });
        };

        // Helper to create a toolbar button for sub-note editor
        const createSNButton = (title, content, command, value = null, action = null, extraClass = '') => {
            const btn = document.createElement('button');
            btn.className = 'toolbar-btn' + (extraClass ? ` ${extraClass}` : '');
            btn.title = title;
            btn.innerHTML = content;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                withSubnoteSelection(() => {
                    if (command) {
                        document.execCommand(command, false, value);
                    }
                    if (action) {
                        action();
                    }
                });
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
                    withSubnoteSelection(() => action(color));
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
                    withSubnoteSelection(() => action(color));
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
                withSubnoteSelection(() => action(e.target.value));
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
                if (submenu.classList.contains('visible')) {
                    submenu.style.left = '0';
                    submenu.style.right = 'auto';
                    const menuRect = submenu.getBoundingClientRect();
                    const containerRect = group.parentElement.getBoundingClientRect();
                    if (menuRect.right > containerRect.right) {
                        submenu.style.left = 'auto';
                        submenu.style.right = '0';
                    }
                }
            });
            return group;
        };

        const createSNSymbolDropdown = (symbols, title, icon, editHandler, isChar = false) => {
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
                const editBtn = document.createElement('button');
                editBtn.textContent = 'Editar';
                editBtn.className = 'symbol-btn';
                editBtn.addEventListener('click', () => {
                    content.classList.remove('visible');
                    if (editHandler) editHandler();
                });
                content.appendChild(editBtn);
            };
            renderSNSyms();
            if (isChar) {
                charDropdownRenderers.push(renderSNSyms);
            } else {
                iconDropdownRenderers.push(renderSNSyms);
            }
            dropdown.appendChild(content);
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
                    if (d !== content) d.classList.remove('visible');
                });
                const willShow = !content.classList.contains('visible');
                content.classList.toggle('visible');
                if (willShow) {
                    content.style.left = '100%';
                    content.style.right = 'auto';
                    const contentRect = content.getBoundingClientRect();
                    const containerRect = dropdown.parentElement.getBoundingClientRect();
                    if (contentRect.right > containerRect.right) {
                        content.style.left = 'auto';
                        content.style.right = '100%';
                    }
                }
            });
            return dropdown;
        };

        // Dropdown for adjusting line highlight size (vertical padding)
        const createSNHighlightSizeDropdown = () => {
            const dropdown = document.createElement('div');
            dropdown.className = 'symbol-dropdown';
            const iconSVG = UI_ICON_STRINGS.highlightSize;
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
        // Clear formatting
        subNoteToolbar.appendChild(createSNButton('Limpiar formato', '❌', null, null, clearFormattingSN));
        // Font family selector
        const selectSNFont = document.createElement('select');
        selectSNFont.className = 'toolbar-select';
        selectSNFont.title = 'Fuente';
        selectSNFont.style.width = '60px';
        const fontSNPlaceholder = document.createElement('option');
        fontSNPlaceholder.value = "";
        fontSNPlaceholder.textContent = 'Fuente';
        fontSNPlaceholder.disabled = true;
        fontSNPlaceholder.selected = true;
        selectSNFont.appendChild(fontSNPlaceholder);
        const fontsSN = ['San Francisco', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Calibri'];
        fontsSN.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            opt.style.fontFamily = f;
            selectSNFont.appendChild(opt);
        });
        selectSNFont.addEventListener('change', () => {
            if (selectSNFont.value) {
                withSubnoteSelection(() => document.execCommand('fontName', false, selectSNFont.value));
                selectSNFont.selectedIndex = 0;
                subNoteEditor.focus();
            }
        });
        subNoteToolbar.appendChild(selectSNFont);

        // Font size selector
        const selectSNSize = document.createElement('select');
        selectSNSize.className = 'toolbar-select';
        selectSNSize.title = 'Tamaño de letra';
        selectSNSize.style.width = '60px';
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
                withSubnoteSelection(() => document.execCommand('fontSize', false, selectSNSize.value));
                selectSNSize.selectedIndex = 0;
                subNoteEditor.focus();
            }
        });
        subNoteToolbar.appendChild(selectSNSize);

        // Line height selector
        const selectSNLineHeight = document.createElement('select');
        selectSNLineHeight.className = 'toolbar-select';
        selectSNLineHeight.title = 'Interlineado';
        selectSNLineHeight.style.width = '60px';
        const lhPlaceholder = document.createElement('option');
        lhPlaceholder.value = "";
        lhPlaceholder.textContent = 'Interlineado';
        lhPlaceholder.disabled = true;
        lhPlaceholder.selected = true;
        selectSNLineHeight.appendChild(lhPlaceholder);
        const lineHeights = { 'Grande': '2.0', 'Normal': '1.6', 'Pequeño': '1.4', 'Muy Pequeño': '1.2', 'Extremo Pequeño': '1.0' };
        for (const [name, value] of Object.entries(lineHeights)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = name;
            selectSNLineHeight.appendChild(option);
        }
        selectSNLineHeight.addEventListener('change', () => {
            const value = selectSNLineHeight.value;
            if (value !== null) {
                withSubnoteSelection(() => {
                    const elements = getSelectedBlocksSN();
                    if (elements.length > 0) {
                        elements.forEach(block => {
                            if (block && subNoteEditor.contains(block)) {
                                block.style.lineHeight = value;
                            }
                        });
                    }
                });
                selectSNLineHeight.selectedIndex = 0;
                subNoteEditor.focus();
            }
        });
        subNoteToolbar.appendChild(selectSNLineHeight);

        const adjustSNLineHeight = (delta) => {
            const blocks = getSelectedBlocksSN();
            blocks.forEach(block => {
                if (block && subNoteEditor.contains(block)) {
                    const computed = window.getComputedStyle(block);
                    const fontSize = parseFloat(computed.fontSize);
                    let lh = parseFloat(computed.lineHeight) / fontSize;
                    if (isNaN(lh)) lh = 1.6;
                    lh = Math.max(1, lh + delta);
                    block.style.lineHeight = lh.toFixed(1);
                }
            });
            subNoteEditor.focus();
        };

        subNoteToolbar.appendChild(createSNButton('Reducir interlineado', '-', null, null, () => adjustSNLineHeight(-0.2), 'compact-btn'));
        subNoteToolbar.appendChild(createSNButton('Aumentar interlineado', '+', null, null, () => adjustSNLineHeight(0.2), 'compact-btn'));
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

        function clearFormattingSN() {
            document.execCommand('removeFormat');
            const blocks = getSelectedBlocksSN();
            blocks.forEach(block => {
                if (block && subNoteEditor.contains(block)) {
                    block.removeAttribute('style');
                    block.removeAttribute('class');
                    if (block.tagName === 'BLOCKQUOTE') {
                        while (block.firstChild) block.parentNode.insertBefore(block.firstChild, block);
                        block.remove();
                    }
                }
            });
        }
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
            recordHistory();
        };
        const typeIcon = UI_ICON_STRINGS.type;
        const highlighterIcon = UI_ICON_STRINGS.highlighter;
        const subTextPalette = createSNColorPalette('Color de Texto', applySubnoteForeColor, textColors, extraTextColors, typeIcon);
        const subHighlightPalette = createSNColorPalette('Color de Resaltado', applySubnoteHiliteColor, highlightColors, extraHighlightColors, highlighterIcon);
        const subLineHighlightPalette = createSNColorPalette('Color de fondo de línea', applySubnoteLineHighlight, ['#FFFFFF'], extraHighlightColors.concat(highlightColors), highlighterIcon);
        subNoteToolbar.appendChild(subTextPalette);
        subNoteToolbar.appendChild(subHighlightPalette);
        subNoteToolbar.appendChild(subLineHighlightPalette);
        // Highlight size dropdown
        subNoteToolbar.appendChild(createSNHighlightSizeDropdown());
        // Horizontal rule options
        const lineDropdownSN = document.createElement('div');
        lineDropdownSN.className = 'symbol-dropdown';
        const lineBtnSN = createSNButton('Insertar línea separadora', '—', null, null, null);
        lineDropdownSN.appendChild(lineBtnSN);
        const lineContentSN = document.createElement('div');
        lineContentSN.className = 'symbol-dropdown-content flex-dropdown';
        lineContentSN.style.minWidth = '80px';
        ['solid','dotted','dashed'].forEach(style => {
            const b = document.createElement('button');
            b.className = 'toolbar-btn';
            b.innerHTML = `<div style="border-top:1px ${style} var(--text-primary); width:40px;"></div>`;
            b.addEventListener('click', (e) => {
                e.preventDefault();
                document.execCommand('insertHTML', false, `<hr class="hr-${style}">`);
                lineContentSN.classList.remove('visible');
                subNoteEditor.focus();
            });
            lineContentSN.appendChild(b);
        });
        lineDropdownSN.appendChild(lineContentSN);
        lineBtnSN.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
                if (d !== lineContentSN) d.classList.remove('visible');
            });
            lineContentSN.classList.toggle('visible');
        });
        subNoteToolbar.appendChild(lineDropdownSN);
        subNoteToolbar.appendChild(createSNSeparator());
        // Indent/outdent
        // Indent/outdent
        const outdentSVG = UI_ICON_STRINGS.indentDecrease;
        const indentSVG = UI_ICON_STRINGS.indentIncrease;
        subNoteToolbar.appendChild(createSNButton('Disminuir sangría', outdentSVG, null, null, () => adjustIndent(-1, subNoteEditor)));
        subNoteToolbar.appendChild(createSNButton('Aumentar sangría', indentSVG, null, null, () => adjustIndent(1, subNoteEditor)));
        // Collapsible list item
        const collapsibleListSVG = UI_ICON_STRINGS.collapsibleList;
        const collapsibleListHTML = `<details class="collapsible-list"><summary>Elemento</summary><div>Texto...<br></div></details><p><br></p>`;
        subNoteToolbar.appendChild(createSNButton('Insertar lista colapsable', collapsibleListSVG, 'insertHTML', collapsibleListHTML));

        subNoteToolbar.appendChild(createSNButton('Insertar HTML', '&lt;/&gt;', null, null, () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                savedEditorSelection = range.cloneRange();
                const div = document.createElement('div');
                div.appendChild(range.cloneContents());
                savedSelectedHtml = div.innerHTML;
            } else {
                savedEditorSelection = null;
                savedSelectedHtml = '';
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
        subNoteToolbar.appendChild(createSNSymbolDropdown(
            toolbarIcons,
            'Insertar Símbolo',
            '📌',
            () => {
                renderIconManager();
                showModal(iconManagerModal);
            }
        ));
        subNoteToolbar.appendChild(createSNSymbolDropdown(
            globalSpecialChars,
            'Caracteres Especiales',
            'Ω',
            () => {
                renderCharManager();
                showModal(charManagerModal);
            },
            true
        ));
        // Gallery link insertion
        const gallerySVG = UI_ICON_STRINGS.gallery;
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
            if (isTooltipEditing) {
                saveTooltipContent(true);
                return;
            }
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
            if (isTooltipEditing) {
                saveTooltipContent(false);
                return;
            }
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
            if (isTooltipEditing) {
                hideModal(subNoteModal);
                return;
            }
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
    let selectedTableForMove = null;
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
    let isTooltipEditing = false;
    let activeTooltipState = null;
    let editingQuickNote = false;
    let savedEditorSelection = null;
    let floatingFormatToolbar = null;
    let floatingToolbarRange = null;
    let floatingToolbarVisible = false;
    let floatingToolbarListenersInitialized = false;
    let savedSelectedHtml = '';
    let currentCallout = null;
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

    function buildToolbarGuideItems() {
        const inlineIcon = currentInlineNoteIcon || 'ℹ️';
        return [
            { icon: UI_ICON_STRINGS.codeToggle, shortName: 'Pegado HTML', codeName: 'toggle-html-paste', description: 'Activa o desactiva el pegado con formato HTML en el editor.', isHtml: true },
            { icon: '✋', shortName: 'Arrastrar bloques', codeName: 'toggle-block-drag', description: 'Activa el modo para reorganizar bloques arrastrándolos.' },
            { icon: UI_ICON_STRINGS.fullscreen, shortName: 'Pantalla amplia', codeName: 'toggle-fullscreen', description: 'Expande el editor para trabajar en modo casi pantalla completa.', isHtml: true },
            { icon: UI_ICON_STRINGS.noteInfo, shortName: 'Información nota', codeName: 'note-info-toggle', description: 'Abre el resumen de palabras, peso y últimos cambios de la nota.', isHtml: true },
            { icon: UI_ICON_STRINGS.quickNote, shortName: 'Nota amarilla', codeName: 'quick-note', description: 'Abre la nota adhesiva asociada para apuntes rápidos.', isHtml: true },
            { icon: UI_ICON_STRINGS.readonly, shortName: 'Solo ver', codeName: 'toggle-readonly', description: 'Alterna entre modo lectura y edición del contenido.', isHtml: true },
            { icon: UI_ICON_STRINGS.importNote, shortName: 'Importar HTML', codeName: 'import-note', description: 'Carga una nota desde un archivo HTML o de texto plano.', isHtml: true },
            { icon: UI_ICON_STRINGS.exportNote, shortName: 'Exportar HTML', codeName: 'export-note', description: 'Descarga la nota actual como archivo HTML.', isHtml: true },
            { icon: UI_ICON_STRINGS.minimize, shortName: 'Minimizar', codeName: 'minimize-note', description: 'Oculta temporalmente la ventana del editor y deja un acceso para restaurarla.', isHtml: true },
            { icon: '🔤', shortName: 'Fuente', codeName: 'font-select', description: 'Cambia la familia tipográfica del texto seleccionado.' },
            { icon: '🔍', shortName: 'Zoom', codeName: 'editor-zoom', description: 'Ajusta el nivel de zoom del área de edición.' },
            { icon: 'A↕', shortName: 'Tamaño (lista)', codeName: 'font-size-select', description: 'Aplica tamaños predefinidos a la fuente.' },
            { icon: 'A−', shortName: 'Reducir tamaño', codeName: 'font-size-dec', description: 'Reduce proporcionalmente la fuente del bloque seleccionado.' },
            { icon: 'A+', shortName: 'Aumentar tamaño', codeName: 'font-size-inc', description: 'Aumenta proporcionalmente la fuente del bloque seleccionado.' },
            { icon: '↕︎', shortName: 'Interlineado (lista)', codeName: 'line-height-select', description: 'Define un interlineado preestablecido para el párrafo.' },
            { icon: '↕−', shortName: 'Reducir interlineado', codeName: 'line-height-dec', description: 'Reduce el espacio vertical del bloque seleccionado.' },
            { icon: '↕+', shortName: 'Aumentar interlineado', codeName: 'line-height-inc', description: 'Amplía el espacio vertical del bloque seleccionado.' },
            { icon: '<b>B</b>', shortName: 'Negrita', codeName: 'bold', description: 'Aplica negrita al texto seleccionado.', isHtml: true },
            { icon: '<i>I</i>', shortName: 'Cursiva', codeName: 'italic', description: 'Aplica cursiva al texto seleccionado.', isHtml: true },
            { icon: '<u>U</u>', shortName: 'Subrayado', codeName: 'underline', description: 'Subraya el texto seleccionado.', isHtml: true },
            { icon: '<s>S</s>', shortName: 'Tachado', codeName: 'strikethrough', description: 'Tacha el texto seleccionado.', isHtml: true },
            { icon: 'X²', shortName: 'Superíndice', codeName: 'superscript', description: 'Eleva el texto seleccionado como superíndice.' },
            { icon: '↺', shortName: 'Deshacer', codeName: 'undo', description: 'Revierte la última acción realizada.' },
            { icon: '↻', shortName: 'Rehacer', codeName: 'redo', description: 'Reaplica la última acción revertida.' },
            { icon: '❌', shortName: 'Limpiar formato', codeName: 'clear-format', description: 'Elimina estilos y clases del texto seleccionado.' },
            { icon: '✨', shortName: 'Mejorar texto', codeName: 'ai-improve', description: 'Envía el fragmento seleccionado a la IA para mejorar su redacción.' },
            { icon: '📝', shortName: 'Insertar nota', codeName: 'insert-callout', description: 'Abre el panel de estilos para insertar una nota destacada.' },
            { icon: inlineIcon, shortName: 'Nota en línea', codeName: 'inline-note', description: 'Inserta una nota compacta dentro del texto con el icono activo.' },
            { icon: '🎯', shortName: 'Icono nota en línea', codeName: 'inline-note-icon', description: 'Selecciona el icono que usarán las notas en línea.' },
            { icon: UI_ICON_STRINGS.type, shortName: 'Color de texto', codeName: 'text-color', description: 'Aplica un color al texto seleccionado.', isHtml: true },
            { icon: UI_ICON_STRINGS.highlighter, shortName: 'Resaltado', codeName: 'highlight-color', description: 'Resalta el fondo del texto seleccionado.', isHtml: true },
            { icon: UI_ICON_STRINGS.highlighter, shortName: 'Fondo de línea', codeName: 'line-highlight', description: 'Pinta el fondo de toda la línea para destacarla.', isHtml: true },
            { icon: '📏', shortName: 'Espaciado Tailwind', codeName: 'tailwind-spacing', description: 'Modifica las clases mb-* y space-y-* del bloque seleccionado.' },
            { icon: '🖌️', shortName: 'Estilos de texto', codeName: 'preset-styles', description: 'Despliega estilos predefinidos para títulos y bloques.' },
            { icon: '💊', shortName: 'Texto píldora', codeName: 'pill-text', description: 'Convierte el texto seleccionado en una etiqueta tipo pastilla.' },
            { icon: UI_ICON_STRINGS.highlightSize, shortName: 'Altura de destacado', codeName: 'highlight-spacing', description: 'Ajusta el espacio superior e inferior de los bloques resaltados.', isHtml: true },
            { icon: '—', shortName: 'Línea separadora', codeName: 'insert-divider', description: 'Inserta una línea divisoria editable en el documento.' },
            { icon: UI_ICON_STRINGS.indentDecrease, shortName: 'Disminuir sangría', codeName: 'indent-decrease', description: 'Reduce la sangría del bloque seleccionado.', isHtml: true },
            { icon: UI_ICON_STRINGS.indentIncrease, shortName: 'Aumentar sangría', codeName: 'indent-increase', description: 'Incrementa la sangría del bloque seleccionado.', isHtml: true },
            { icon: '↤', shortName: 'Corregir sangría inversa', codeName: 'fix-outdent', description: 'Elimina manualmente sangrías sobrantes hacia la izquierda.' },
            { icon: '↦', shortName: 'Corregir sangría bloque', codeName: 'fix-indent', description: 'Ajusta la sangría de todos los elementos del bloque.' },
            { icon: '⬆️⏎', shortName: 'Línea en blanco arriba', codeName: 'blank-line-above', description: 'Inserta una línea en blanco por encima del bloque actual.' },
            { icon: '⬇️⏎', shortName: 'Línea en blanco abajo', codeName: 'blank-line-below', description: 'Inserta una línea en blanco por debajo del bloque o selección actual.' },
            { icon: '🧹', shortName: 'Borrado por área', codeName: 'erase-block', description: 'Permite arrastrar un rectángulo para eliminar todas las líneas comprendidas en esa zona.' },
            { icon: '🗑️⏎', shortName: 'Eliminar línea', codeName: 'delete-line', description: 'Elimina únicamente la línea donde está el cursor, incluyendo viñetas.' },
            { icon: '•✚', shortName: 'Viñetas', codeName: 'bullet-styles', description: 'Inserta listas con distintos estilos de viñetas o numeración.' },
            { icon: '•✖', shortName: 'Quitar viñetas', codeName: 'remove-bullets', description: 'Convierte los elementos con viñetas seleccionados en párrafos normales.' },
            { icon: UI_ICON_STRINGS.collapsibleList, shortName: 'Lista colapsable', codeName: 'collapsible-list', description: 'Inserta una lista con elementos que se pueden expandir o contraer.', isHtml: true },
            { icon: '&lt;/&gt;', shortName: 'Insertar HTML', codeName: 'insert-html', description: 'Abre el modal para pegar código HTML personalizado.', isHtml: true },
            { icon: '&lt;HTML&gt;', shortName: 'Ver HTML', codeName: 'view-html', description: 'Muestra el HTML del contenido seleccionado en el editor.', isHtml: true },
            { icon: '↔️', shortName: 'Redimensionar nota', codeName: 'resize-note', description: 'Permite ajustar el ancho de las notas destacadas.' },
            { icon: UI_ICON_STRINGS.subnote, shortName: 'Añadir sub-nota', codeName: 'add-subnote', description: 'Crea una sub-nota vinculada al punto actual.', isHtml: true },
            { icon: '🖼️', shortName: 'Imagen flotante', codeName: 'float-image', description: 'Alterna el estilo de imagen flotante izquierda/derecha.' },
            { icon: '🖼️🖼️', shortName: 'Imágenes en fila', codeName: 'images-inline', description: 'Coloca las imágenes seleccionadas una junto a la otra.' },
            { icon: UI_ICON_STRINGS.gallery, shortName: 'Galería', codeName: 'image-gallery', description: 'Abre el editor de galerías para asociar varias imágenes.', isHtml: true },
            { icon: '➕', shortName: 'Ampliar imagen', codeName: 'image-grow', description: 'Aumenta un 10% el tamaño de la imagen o tabla seleccionada.' },
            { icon: '➖', shortName: 'Reducir imagen', codeName: 'image-shrink', description: 'Disminuye un 10% el tamaño de la imagen o tabla seleccionada.' },
            { icon: '⬅️', shortName: 'Mover a la izquierda', codeName: 'move-left', description: 'Desplaza la imagen o tabla seleccionada hacia la izquierda.' },
            { icon: '➡️', shortName: 'Mover a la derecha', codeName: 'move-right', description: 'Desplaza la imagen o tabla seleccionada hacia la derecha.' },
            { icon: '💾', shortName: 'Imprimir/PDF', codeName: 'print-export', description: 'Genera una vista preparada para impresión o guardado como PDF.' },
            { icon: '📌', shortName: 'Símbolos rápidos', codeName: 'insert-symbol', description: 'Abre el menú de iconos guardados para insertarlos en el texto.' },
            { icon: 'Ω', shortName: 'Caracteres especiales', codeName: 'special-chars', description: 'Muestra los caracteres especiales configurados para insertar.' }
        ];
    }

    // Line erase mode helpers are declared inside the toolbar setup where the button is defined

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
        toolbarIcons.forEach((icon, index) => {
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
                toolbarIcons.splice(index, 1);
                renderIconManager();
                iconDropdownRenderers.forEach(fn => fn());
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
                charDropdownRenderers.forEach(fn => fn());
            });
            wrapper.appendChild(delBtn);
            currentChars.appendChild(wrapper);
        });
    }

    // Open icon manager modal
    if (openIconManagerBtn) {
        openIconManagerBtn.addEventListener('click', () => {
            renderIconManager();
            showModal(iconManagerModal);
        });
    }
    // Close icon manager modal
    if (closeIconManagerBtn) {
        closeIconManagerBtn.addEventListener('click', () => {
            hideModal(iconManagerModal);
            iconDropdownRenderers.forEach(fn => fn());
        });
    }
    // Add new icon from manager
    if (addNewIconBtn) {
        addNewIconBtn.addEventListener('click', () => {
            const val = newIconInputManager.value.trim();
            if (!val) return;
            toolbarIcons.push(val);
            newIconInputManager.value = '';
            renderIconManager();
            iconDropdownRenderers.forEach(fn => fn());
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
        closeCharManagerBtn.addEventListener('click', () => {
            hideModal(charManagerModal);
            charDropdownRenderers.forEach(fn => fn());
        });
    }
    if (addNewCharBtn) {
        addNewCharBtn.addEventListener('click', () => {
            const val = newCharInputManager.value.trim();
            if (!val) return;
            globalSpecialChars.push(val);
            newCharInputManager.value = '';
            renderCharManager();
            charDropdownRenderers.forEach(fn => fn());
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
        notesEditor.focus({ preventScroll: true });
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
        notesEditor.focus({ preventScroll: true });
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
                td.style.minWidth = '30px';
                td.innerHTML = '&nbsp;';
                td.contentEditable = true;
                tr.appendChild(td);
            }
            table.appendChild(tr);
        }
        table.dataset.cellLineHeight = '1.4';
        table.dataset.cellPadding = '6';
        table.dataset.tableMarginTop = table.dataset.tableMarginTop || '12';
        table.dataset.tableMarginBottom = table.dataset.tableMarginBottom || '12';
        applyTableSpacing(table, 1.4, 6);
        applyTableMargins(table, parseFloat(table.dataset.tableMarginTop), parseFloat(table.dataset.tableMarginBottom));
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
        ensureSpacingState(table);
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
            }
            ensureSpacingState(table);
            const lineHeight = parseFloat(table.dataset.cellLineHeight || '1.4');
            const padding = parseFloat(table.dataset.cellPadding || '6');
            applyTableSpacing(table, lineHeight, padding);
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
            });
            ensureSpacingState(table);
            const lineHeight = parseFloat(table.dataset.cellLineHeight || '1.4');
            const padding = parseFloat(table.dataset.cellPadding || '6');
            applyTableSpacing(table, lineHeight, padding);
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
        mapa: getElem('total-mapa'),
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

    const sanitizeFileName = (text) => {
        if (!text) return 'seccion';
        const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return normalized
            .replace(/[^a-zA-Z0-9\-\s_]+/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .toLowerCase() || 'seccion';
    };

    const exportSectionToHtml = (headerRow) => {
        if (!headerRow) return;
        const sectionName = headerRow.dataset.sectionHeader;
        const titleEl = headerRow.querySelector('.section-title');
        const titleText = titleEl ? titleEl.textContent.trim() : sectionName;
        const originalTable = headerRow.closest('table');
        const exportTable = originalTable ? originalTable.cloneNode(false) : document.createElement('table');
        if (originalTable) {
            exportTable.className = originalTable.className;
            if (originalTable.getAttribute('style')) {
                exportTable.setAttribute('style', originalTable.getAttribute('style'));
            }
        }
        const rows = [headerRow, ...tableBody.querySelectorAll(`tr[data-section="${sectionName}"]`)];
        const totalRow = getElem(`total-row-${sectionName}`);
        if (totalRow) rows.push(totalRow);
        rows.forEach(row => {
            const clone = row.cloneNode(true);
            clone.querySelectorAll('.print-section-btn, .section-note-icon, .section-cover-icon, .save-section-html-btn').forEach(el => el.remove());
            clone.querySelectorAll('button, input').forEach(el => el.remove());
            clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
            exportTable.appendChild(clone);
        });
        const styleBlock = sectionStylesheet ? `<style>${sectionStylesheet}</style>` : '';
        const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${titleText || 'Sección'}</title>
${styleBlock}
</head>
<body class="section-export-body">
<main class="section-export-container">
<h1 class="section-export-title">${titleText || sectionName}</h1>
${exportTable.outerHTML}
</main>
</body>
</html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${sanitizeFileName(titleText || sectionName)}.html`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            link.remove();
        }, 0);
    };

    const ensureSectionExportButtons = () => {
        tableBody.querySelectorAll('.section-header-row').forEach(row => {
            if (row.querySelector('.save-section-html-btn')) return;
            const actionsContainer = row.querySelector('.flex.items-center.gap-2:last-child');
            if (!actionsContainer) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'toolbar-btn save-section-html-btn';
            btn.title = 'Guardar sección como HTML';
            btn.setAttribute('aria-label', 'Guardar sección como HTML');
            btn.innerHTML = '&lt;/&gt;';
            actionsContainer.insertBefore(btn, actionsContainer.firstChild);
        });
    };

    const sectionNavigation = (() => {
        const nav = document.createElement('aside');
        nav.id = 'section-nav';
        nav.className = 'section-nav-panel';
        const header = document.createElement('div');
        header.className = 'section-nav-header';
        const headerTitle = document.createElement('span');
        headerTitle.textContent = 'Navegación por temas';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'section-nav-close';
        closeBtn.innerHTML = '✕';
        header.appendChild(headerTitle);
        header.appendChild(closeBtn);
        nav.appendChild(header);
        const list = document.createElement('div');
        list.className = 'section-nav-list';
        nav.appendChild(list);
        document.body.appendChild(nav);

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.id = 'section-nav-toggle';
        toggleBtn.className = 'section-nav-toggle';
        toggleBtn.title = 'Mostrar navegación por temas';
        toggleBtn.setAttribute('aria-label', 'Mostrar navegación por temas');
        toggleBtn.textContent = '📑';
        if (printAllBtn && printAllBtn.parentElement) {
            printAllBtn.parentElement.appendChild(toggleBtn);
        } else {
            document.body.appendChild(toggleBtn);
        }

        const open = () => {
            nav.classList.add('open');
            toggleBtn.classList.add('open');
        };
        const close = () => {
            nav.classList.remove('open');
            toggleBtn.classList.remove('open');
        };
        toggleBtn.addEventListener('click', () => {
            if (nav.classList.contains('open')) {
                close();
            } else {
                open();
            }
        });
        closeBtn.addEventListener('click', close);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });

        const update = () => {
            ensureSectionExportButtons();
            list.innerHTML = '';
            const headers = Array.from(document.querySelectorAll('.section-header-row'));
            headers.forEach(row => {
                if (window.getComputedStyle(row).display === 'none') return;
                const title = row.querySelector('.section-title');
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'section-nav-item';
                item.dataset.section = row.dataset.sectionHeader;
                const labelText = title ? title.textContent.trim() : row.dataset.sectionHeader;
                item.textContent = labelText;
                item.title = labelText;
                item.addEventListener('click', () => {
                    row.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    close();
                });
                list.appendChild(item);
            });
            if (!list.children.length) {
                close();
            }
        };

        const markActiveSection = () => {
            const headers = Array.from(document.querySelectorAll('.section-header-row'));
            const midpoint = window.scrollY + window.innerHeight / 2;
            let activeSection = null;
            headers.forEach(row => {
                const rect = row.getBoundingClientRect();
                const rowTop = window.scrollY + rect.top;
                if (rowTop <= midpoint) {
                    activeSection = row.dataset.sectionHeader;
                }
            });
            if (!activeSection && headers.length) {
                activeSection = headers[0].dataset.sectionHeader;
            }
            list.querySelectorAll('.section-nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.section === activeSection);
            });
        };

        return { update, markActiveSection, close };
    })();

    ensureSectionExportButtons();
    sectionNavigation.update();

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

    function createMapaCellContent() {
        const fragment = document.createDocumentFragment();
        const container = document.createElement('div');
        container.className = 'flex items-center justify-center space-x-2';

        const counterSpan = document.createElement('span');
        counterSpan.className = 'mapa-counter';
        counterSpan.textContent = '0';

        const noteIconSvg = `<svg class="solid-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 15.25z" clip-rule="evenodd" /></svg><svg class="outline-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>`;

        const noteIcon = document.createElement('span');
        noteIcon.className = 'note-icon';
        noteIcon.dataset.noteType = 'mapa';
        noteIcon.title = 'Notas del mapa';
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

        document.querySelectorAll('td.mapa-cell[data-col="mapa"]').forEach(cellEl => {
            cellEl.innerHTML = '';
            cellEl.appendChild(createMapaCellContent());
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
            let current = node;
            while (current && current !== notesEditor) {
                if (current.nodeType === 1 && getComputedStyle(current).display !== 'inline') {
                    return current;
                }
                current = current.parentNode;
            }
            if (node && node.nodeType === 1) {
                return node;
            }
            return node?.parentNode || notesEditor;
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
            const from = Math.min(startIndex, endIndex);
            const to = Math.max(startIndex, endIndex);
            return allBlocks.slice(from, to + 1);
        }

        return [startBlock]; // Fallback
    }

    async function improveSelectedText() {
        const selection = window.getSelection();
        if (!selection || selection.toString().trim() === '') {
            alert('Selecciona el texto a mejorar.');
            return;
        }
        const original = selection.toString();
        try {
            const improved = await improveText(original);
            if (improved) {
                document.execCommand('insertText', false, improved);
            }
        } catch (err) {
            console.error('AI improve error', err);
            alert('No se pudo mejorar el texto.');
        }
    }

    function sanitizeCalloutContent(container) {
        if (!container) return;
        // Preserve user-applied formatting; avoid stripping font or style attributes
        // to maintain original appearance inside callouts.
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        let text;
        while ((text = walker.nextNode())) {
            text.nodeValue = text.nodeValue.replace(/\u00a0/g, ' ');
        }
        const lines = [];
        let current = [];
        Array.from(container.childNodes).forEach(node => {
            if (node.nodeName === 'BR') {
                lines.push(current);
                current = [];
                node.remove();
            } else {
                current.push(node);
            }
        });
        lines.push(current);
        if (lines.length > 1) {
            container.innerHTML = '';
            lines.forEach(nodes => {
                const p = document.createElement('p');
                nodes.forEach(n => p.appendChild(n));
                if (p.textContent.trim()) container.appendChild(p);
            });
        }
    }

    function setupEditorToolbar() {
        editorToolbar.innerHTML = ''; // Clear existing toolbar

        // Run a callback while preserving the current text selection
        const withEditorSelection = (fn) => {
            const sel = window.getSelection();
            const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
            const scrollY = window.scrollY;
            const modalScroll = notesModalContent.scrollTop;
            fn();
            if (range) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
            window.scrollTo(0, scrollY);
            notesModalContent.scrollTop = modalScroll;
        };

        const createButton = (title, content, command, value = null, action = null, extraClass = '') => {
            const btn = document.createElement('button');
            btn.className = 'toolbar-btn' + (extraClass ? ` ${extraClass}` : '');
            btn.title = title;
            btn.innerHTML = content;
            btn.addEventListener('mousedown', e => e.preventDefault());
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                withEditorSelection(() => {
                    if (command) {
                        document.execCommand(command, false, value);
                    }
                    if (action) {
                        action();
                    }
                });
                notesEditor.focus({ preventScroll: true });
            });
            return btn;
        };

        const blockSelector = 'p, h1, h2, h3, h4, h5, h6, div, li, blockquote, pre, details, table';

        const getClosestTooltip = (node) => {
            while (node && node !== notesEditor) {
                if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('editor-tooltip')) {
                    return node;
                }
                node = node.parentNode;
            }
            return null;
        };

        const sanitizeTooltipIcon = (iconChar) => {
            const icon = (iconChar || '').trim();
            return TOOLTIP_ICON_OPTIONS.includes(icon) ? icon : DEFAULT_TOOLTIP_ICON;
        };

        const updateTooltipIconPickerLabel = (icon) => {
            if (tooltipIconPickerBtn) {
                tooltipIconPickerBtn.innerHTML = `<span class="tooltip-icon-current" aria-hidden="true">${icon}</span><span class="tooltip-icon-caret" aria-hidden="true">▾</span>`;
            }
        };

        const highlightTooltipIcon = (icon) => {
            const sanitized = sanitizeTooltipIcon(icon);
            tooltipIconButtons.forEach(btn => {
                const isActive = btn.dataset.icon === sanitized;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
            updateTooltipIconPickerLabel(sanitized);
            return sanitized;
        };

        const setToolbarSelectedTooltipIcon = (icon) => {
            toolbarSelectedTooltipIcon = highlightTooltipIcon(icon);
            if (isTooltipEditing && activeTooltipState) {
                activeTooltipState.icon = toolbarSelectedTooltipIcon;
            }
            return toolbarSelectedTooltipIcon;
        };

        const ensureTooltipStructure = (tooltipEl) => {
            if (!tooltipEl) return null;
            tooltipEl.classList.add('editor-tooltip');
            let content = tooltipEl.querySelector('.editor-tooltip-content');
            if (!content) {
                content = document.createElement('span');
                content.className = 'editor-tooltip-content';
                content.hidden = true;
                if (tooltipEl.dataset.tooltip) {
                    content.innerHTML = tooltipEl.dataset.tooltip;
                    tooltipEl.removeAttribute('data-tooltip');
                } else {
                    content.innerHTML = '<p><br></p>';
                }
                tooltipEl.appendChild(content);
            } else {
                content.className = 'editor-tooltip-content';
            }

            let target = tooltipEl.querySelector('.editor-tooltip-target');
            if (!target) {
                target = document.createElement('span');
                target.className = 'editor-tooltip-target';
                const fragment = document.createDocumentFragment();
                Array.from(tooltipEl.childNodes).forEach(node => {
                    if (node !== content && !(node.nodeType === Node.ELEMENT_NODE && node.classList.contains('editor-tooltip-icon'))) {
                        fragment.appendChild(node);
                    }
                });
                target.appendChild(fragment);
                tooltipEl.insertBefore(target, content);
            } else {
                target.className = 'editor-tooltip-target';
            }
            const hasVisibleTargetContent = target.textContent.trim().length > 0 || target.querySelector('img, video, audio, iframe, svg, object, table');
            if (hasVisibleTargetContent) {
                target.hidden = false;
                target.removeAttribute('aria-hidden');
            } else {
                target.hidden = true;
                target.setAttribute('aria-hidden', 'true');
                target.innerHTML = '';
            }

            let iconEl = tooltipEl.querySelector('.editor-tooltip-icon');
            const icon = sanitizeTooltipIcon(tooltipEl.dataset.tooltipIcon || iconEl?.textContent || DEFAULT_TOOLTIP_ICON);
            if (!iconEl) {
                iconEl = document.createElement('sup');
                iconEl.className = 'editor-tooltip-icon';
                iconEl.textContent = icon;
                tooltipEl.insertBefore(iconEl, content);
            } else {
                iconEl.className = 'editor-tooltip-icon';
                iconEl.textContent = icon;
                if (iconEl.parentNode !== tooltipEl) {
                    tooltipEl.insertBefore(iconEl, content);
                }
            }
            tooltipEl.dataset.tooltipIcon = icon;
            tooltipEl.setAttribute('data-icon', icon);
            tooltipEl.setAttribute('tabindex', '0');
            return tooltipEl;
        };

        normalizeTooltipElement = ensureTooltipStructure;

        const getTooltipContentHTML = (tooltipEl) => {
            const normalized = ensureTooltipStructure(tooltipEl);
            return normalized?.querySelector('.editor-tooltip-content')?.innerHTML || '<p><br></p>';
        };

        const setTooltipIconOnElement = (tooltipEl, icon) => {
            const sanitized = sanitizeTooltipIcon(icon);
            tooltipEl.dataset.tooltipIcon = sanitized;
            tooltipEl.setAttribute('data-icon', sanitized);
            const iconEl = tooltipEl.querySelector('.editor-tooltip-icon');
            if (iconEl) {
                iconEl.textContent = sanitized;
            }
            return sanitized;
        };

        const updateTooltipPreview = (tooltipEl) => {
            const content = tooltipEl.querySelector('.editor-tooltip-content');
            if (!content) return;
            const tmp = document.createElement('div');
            tmp.innerHTML = content.innerHTML || '';
            const text = tmp.textContent.trim().replace(/\s+/g, ' ');
            if (text) {
                tooltipEl.setAttribute('aria-label', text.slice(0, 160));
            } else if (tmp.querySelector('img, video, audio, iframe, svg, table')) {
                tooltipEl.setAttribute('aria-label', 'Tooltip con contenido multimedia');
            } else {
                tooltipEl.removeAttribute('aria-label');
            }
        };

        const isTooltipHtmlEmpty = (html) => {
            const tmp = document.createElement('div');
            tmp.innerHTML = html || '';
            if (tmp.querySelector('img, table, video, audio, iframe, svg, object')) return false;
            return tmp.textContent.trim().length === 0;
        };

        if (tooltipIconOutsideHandler) {
            document.removeEventListener('mousedown', tooltipIconOutsideHandler);
            tooltipIconOutsideHandler = null;
        }
        if (tooltipIconSelector && tooltipIconSelector.parentNode) {
            tooltipIconSelector.remove();
        }
        tooltipIconSelector = document.createElement('div');
        tooltipIconSelector.id = 'tooltip-icon-selector';
        tooltipIconSelector.className = 'tooltip-icon-selector hidden';
        tooltipIconSelector.setAttribute('role', 'menu');
        const tooltipIconLabel = document.createElement('span');
        tooltipIconLabel.className = 'tooltip-icon-selector-label';
        tooltipIconLabel.textContent = 'Icono del tooltip';
        const tooltipIconOptions = document.createElement('div');
        tooltipIconOptions.className = 'tooltip-icon-options';
        tooltipIconSelector.append(tooltipIconLabel, tooltipIconOptions);
        document.body.appendChild(tooltipIconSelector);
        tooltipIconButtons = [];
        TOOLTIP_ICON_OPTIONS.forEach(optionIcon => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tooltip-icon-option';
            btn.dataset.icon = optionIcon;
            btn.textContent = optionIcon;
            btn.setAttribute('aria-pressed', 'false');
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                setToolbarSelectedTooltipIcon(optionIcon);
                if (isTooltipEditing && activeTooltipState) {
                    activeTooltipState.icon = toolbarSelectedTooltipIcon;
                }
                hideTooltipIconSelector();
            });
            tooltipIconOptions.appendChild(btn);
            tooltipIconButtons.push(btn);
        });

        highlightTooltipIcon(toolbarSelectedTooltipIcon);

        const positionTooltipIconSelector = () => {
            if (!tooltipIconSelector || !tooltipIconPickerBtn) return;
            const rect = tooltipIconPickerBtn.getBoundingClientRect();
            tooltipIconSelector.style.top = `${rect.bottom + window.scrollY + 8}px`;
            tooltipIconSelector.style.left = `${rect.left + window.scrollX}px`;
        };

        const showTooltipIconSelector = () => {
            if (!tooltipIconSelector) return;
            positionTooltipIconSelector();
            tooltipIconSelector.classList.remove('hidden');
            tooltipIconPickerBtn?.classList.add('active');
            tooltipIconPickerBtn?.setAttribute('aria-expanded', 'true');
            tooltipIconOutsideHandler = (event) => {
                if (!tooltipIconSelector.contains(event.target) && event.target !== tooltipIconPickerBtn) {
                    hideTooltipIconSelector();
                }
            };
            document.addEventListener('mousedown', tooltipIconOutsideHandler);
        };

        hideTooltipIconSelector = () => {
            if (!tooltipIconSelector) return;
            tooltipIconSelector.classList.add('hidden');
            tooltipIconPickerBtn?.classList.remove('active');
            tooltipIconPickerBtn?.setAttribute('aria-expanded', 'false');
            if (tooltipIconOutsideHandler) {
                document.removeEventListener('mousedown', tooltipIconOutsideHandler);
                tooltipIconOutsideHandler = null;
            }
        };

        window.addEventListener('resize', () => {
            if (!tooltipIconSelector || tooltipIconSelector.classList.contains('hidden')) return;
            positionTooltipIconSelector();
        });

        let subnoteModalWasReadonly = subNoteModalContent?.classList.contains('readonly-mode') || false;
        let previousToolbarTooltipIcon = null;
        let tooltipPopover = null;
        let tooltipPopoverTarget = null;
        let tooltipPopoverTimer = null;

        const destroyTooltipPopover = (immediate = false) => {
            const cleanup = () => {
                tooltipPopover?.remove();
                tooltipPopover = null;
                tooltipPopoverTarget = null;
            };
            clearTimeout(tooltipPopoverTimer);
            if (immediate) {
                cleanup();
            } else {
                tooltipPopoverTimer = setTimeout(cleanup, 180);
            }
        };

        const positionTooltipPopover = () => {
            if (!tooltipPopover || !tooltipPopoverTarget) return;
            const anchor = tooltipPopoverTarget.querySelector('.editor-tooltip-icon') || tooltipPopoverTarget;
            const rect = anchor.getBoundingClientRect();
            const popRect = tooltipPopover.getBoundingClientRect();
            let top = rect.top + window.scrollY - popRect.height - 12;
            const minTop = window.scrollY + 12;
            if (top < minTop) {
                top = rect.bottom + window.scrollY + 12;
            }
            let left = rect.left + window.scrollX + rect.width / 2 - popRect.width / 2;
            const minLeft = window.scrollX + 12;
            const maxLeft = window.scrollX + document.documentElement.clientWidth - popRect.width - 12;
            if (left < minLeft) left = minLeft;
            if (left > maxLeft) left = maxLeft;
            tooltipPopover.style.top = `${Math.max(top, minTop)}px`;
            tooltipPopover.style.left = `${left}px`;
        };

        const showTooltipPopover = (tooltipEl) => {
            const normalized = ensureTooltipStructure(tooltipEl);
            if (!normalized) return;
            const content = normalized.querySelector('.editor-tooltip-content');
            if (!content) return;
            clearTimeout(tooltipPopoverTimer);
            if (!tooltipPopover) {
                tooltipPopover = document.createElement('div');
                tooltipPopover.className = 'manual-tooltip-popover';
                tooltipPopover.addEventListener('mouseenter', () => clearTimeout(tooltipPopoverTimer));
                tooltipPopover.addEventListener('mouseleave', () => destroyTooltipPopover());
                document.body.appendChild(tooltipPopover);
            }
            tooltipPopover.innerHTML = content.innerHTML;
            tooltipPopoverTarget = normalized;
            requestAnimationFrame(() => {
                positionTooltipPopover();
            });
        };

        const createTooltipWrapper = (icon, fragment = null, contentHtml = '<p><br></p>') => {
            const sanitized = sanitizeTooltipIcon(icon);
            const wrapperEl = document.createElement('span');
            wrapperEl.className = 'editor-tooltip';
            const target = document.createElement('span');
            target.className = 'editor-tooltip-target';
            if (fragment && fragment.childNodes && fragment.childNodes.length) {
                target.appendChild(fragment);
                target.hidden = false;
            } else {
                target.hidden = true;
            }
            wrapperEl.appendChild(target);
            const iconSup = document.createElement('sup');
            iconSup.className = 'editor-tooltip-icon';
            iconSup.textContent = sanitized;
            wrapperEl.appendChild(iconSup);
            const content = document.createElement('span');
            content.className = 'editor-tooltip-content';
            content.hidden = true;
            content.innerHTML = contentHtml || '<p><br></p>';
            wrapperEl.appendChild(content);
            wrapperEl.dataset.tooltipIcon = sanitized;
            wrapperEl.setAttribute('data-icon', sanitized);
            return ensureTooltipStructure(wrapperEl);
        };

        const notifyTooltipChange = () => {
            notesEditor.querySelectorAll('.editor-tooltip').forEach(ensureTooltipStructure);
            notesEditor.dispatchEvent(new Event('input', { bubbles: true }));
        };

        const openTooltipEditor = (existingTooltip, range) => {
            hideTooltipIconSelector();
            const normalized = existingTooltip ? ensureTooltipStructure(existingTooltip) : null;
            const startingIcon = normalized ? normalized.dataset.tooltipIcon || DEFAULT_TOOLTIP_ICON : toolbarSelectedTooltipIcon;
            previousToolbarTooltipIcon = normalized ? toolbarSelectedTooltipIcon : null;
            highlightTooltipIcon(startingIcon);
            activeTooltipState = {
                existingTooltip: normalized,
                range: normalized ? null : (range ? range.cloneRange() : null),
                icon: sanitizeTooltipIcon(startingIcon)
            };
            isTooltipEditing = true;
            if (subNoteModalContent) {
                subnoteModalWasReadonly = subNoteModalContent.classList.contains('readonly-mode');
                subNoteModalContent.classList.add('tooltip-mode');
                subNoteModalContent.classList.remove('readonly-mode');
            }
            if (toggleSubnoteReadOnlyBtn) {
                toggleSubnoteReadOnlyBtn.setAttribute('hidden', 'hidden');
            }
            subNoteTitle.textContent = normalized ? 'Editar tooltip' : 'Nuevo tooltip';
            subNoteTitle.contentEditable = false;
            subNoteEditor.contentEditable = true;
            subNoteEditor.innerHTML = normalized ? getTooltipContentHTML(normalized) : '<p><br></p>';
            showModal(subNoteModal);
            requestAnimationFrame(() => subNoteEditor.focus({ preventScroll: true }));
        };

        const resetTooltipEditorState = () => {
            hideTooltipIconSelector();
            if (previousToolbarTooltipIcon !== null) {
                setToolbarSelectedTooltipIcon(previousToolbarTooltipIcon);
                previousToolbarTooltipIcon = null;
            } else {
                highlightTooltipIcon(toolbarSelectedTooltipIcon);
            }
            if (activeTooltipState?.range) {
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(activeTooltipState.range);
                }
            }
            if (toggleSubnoteReadOnlyBtn) {
                toggleSubnoteReadOnlyBtn.removeAttribute('hidden');
            }
            if (subNoteModalContent) {
                subNoteModalContent.classList.remove('tooltip-mode');
                if (subnoteModalWasReadonly) {
                    subNoteModalContent.classList.add('readonly-mode');
                }
            }
            subNoteEditor.contentEditable = false;
            subNoteEditor.innerHTML = '<p><br></p>';
            subNoteTitle.textContent = '';
            subNoteTitle.contentEditable = false;
            activeTooltipState = null;
            isTooltipEditing = false;
            destroyTooltipPopover(true);
        };

        const saveTooltipContent = (closeModal = false) => {
            if (!isTooltipEditing || !activeTooltipState) return;
            hideTooltipIconSelector();
            const html = subNoteEditor.innerHTML;
            if (isTooltipHtmlEmpty(html)) {
                showAlert('El contenido del tooltip no puede estar vacío.');
                return;
            }
            const icon = sanitizeTooltipIcon(activeTooltipState.icon || toolbarSelectedTooltipIcon);
            let wrapper = activeTooltipState.existingTooltip;
            if (wrapper) {
                const normalized = ensureTooltipStructure(wrapper);
                normalized.querySelector('.editor-tooltip-content').innerHTML = html;
                setTooltipIconOnElement(normalized, icon);
                updateTooltipPreview(normalized);
                wrapper = normalized;
            } else if (activeTooltipState.range) {
                const range = activeTooltipState.range.cloneRange ? activeTooltipState.range.cloneRange() : activeTooltipState.range;
                if (!range || range.collapsed) {
                    showAlert('Selecciona el texto al que deseas agregar un tooltip.');
                    return;
                }
                let fragment = null;
                try {
                    fragment = range.cloneContents();
                } catch (error) {
                    console.warn('No se pudo clonar la selección del tooltip:', error);
                }
                const wrapperEl = createTooltipWrapper(icon, fragment, html);
                try {
                    range.deleteContents();
                    range.insertNode(wrapperEl);
                } catch (error) {
                    console.error('No se pudo crear el tooltip a partir de la selección:', error);
                    showAlert('No se pudo crear el tooltip sobre la selección actual. Intenta seleccionar nuevamente el texto.');
                    return;
                }
                wrapper = ensureTooltipStructure(wrapperEl);
                setTooltipIconOnElement(wrapper, icon);
                updateTooltipPreview(wrapper);
                const selection = window.getSelection();
                if (selection) {
                    const collapseRange = document.createRange();
                    collapseRange.setStartAfter(wrapper);
                    collapseRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(collapseRange);
                }
            } else {
                showAlert('Selecciona el texto al que deseas agregar un tooltip.');
                return;
            }
            setToolbarSelectedTooltipIcon(icon);
            previousToolbarTooltipIcon = null;
            activeTooltipState.existingTooltip = wrapper;
            activeTooltipState.range = null;
            recordHistory();
            notifyTooltipChange();
            saveCurrentNote();
            if (closeModal) {
                hideModal(subNoteModal);
            } else {
                subNoteEditor.focus({ preventScroll: true });
            }
        };

        notesEditor.addEventListener('mouseover', (e) => {
            const tooltip = e.target.closest('.editor-tooltip');
            if (tooltip && notesEditor.contains(tooltip)) {
                showTooltipPopover(tooltip);
            }
        });

        notesEditor.addEventListener('mouseout', (e) => {
            const tooltip = e.target.closest('.editor-tooltip');
            if (tooltip && tooltip === tooltipPopoverTarget) {
                const related = e.relatedTarget;
                if (related && (tooltip.contains(related) || tooltipPopover?.contains(related))) {
                    return;
                }
                destroyTooltipPopover();
            }
        });

        notesEditor.addEventListener('focusin', (e) => {
            const tooltip = e.target.closest('.editor-tooltip');
            if (tooltip && notesEditor.contains(tooltip)) {
                showTooltipPopover(tooltip);
            }
        });

        notesEditor.addEventListener('focusout', () => {
            if (tooltipPopoverTarget) {
                destroyTooltipPopover();
            }
        });

        document.addEventListener('scroll', () => {
            if (tooltipPopoverTarget) {
                destroyTooltipPopover(true);
            }
        }, true);

        window.addEventListener('resize', () => {
            if (tooltipPopoverTarget) {
                positionTooltipPopover();
            }
        });

        notesEditor.addEventListener('click', (e) => {
            const icon = e.target.closest('.editor-tooltip-icon');
            if (icon && notesEditor.contains(icon)) {
                e.preventDefault();
                const tooltip = icon.closest('.editor-tooltip');
                if (tooltip) {
                    destroyTooltipPopover(true);
                    openTooltipEditor(tooltip, null);
                }
            }
        });

        notesEditor.addEventListener('dblclick', (e) => {
            const tooltip = e.target.closest('.editor-tooltip');
            if (tooltip && notesEditor.contains(tooltip)) {
                openTooltipEditor(tooltip, null);
            }
        });

        const handleTooltipTool = () => {
            hideTooltipIconSelector();
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                notesEditor.focus({ preventScroll: true });
                showAlert('Coloca el cursor dentro del texto para insertar un tooltip.');
                return;
            }
            const range = selection.getRangeAt(0);
            if (!range || !notesEditor.contains(range.commonAncestorContainer)) {
                notesEditor.focus({ preventScroll: true });
                showAlert('Coloca el cursor dentro del texto para insertar un tooltip.');
                return;
            }
            const startTooltip = getClosestTooltip(range.startContainer);
            const endTooltip = getClosestTooltip(range.endContainer);
            const existingTooltip = (startTooltip && startTooltip === endTooltip)
                ? startTooltip
                : (range.collapsed ? (startTooltip || endTooltip) : null);
            if (existingTooltip) {
                openTooltipEditor(existingTooltip, null);
                return;
            }
            if (range.collapsed) {
                notesEditor.focus({ preventScroll: true });
                showAlert('Selecciona el texto al que deseas agregar un tooltip.');
                return;
            }
            openTooltipEditor(null, range);
        };

        const onDragStart = (e) => {
            const block = e.target.closest(blockSelector);
            if (block && notesEditor.contains(block)) {
                draggedBlock = block;
            } else {
                draggedBlock = null;
            }
        };

        const onDragOver = (e) => {
            if (!draggedBlock) return;
            const block = e.target.closest(blockSelector);
            if (block && notesEditor.contains(block) && block !== draggedBlock) {
                e.preventDefault();
            }
        };

        const onDrop = (e) => {
            if (!draggedBlock) return;
            const block = e.target.closest(blockSelector);
            if (block && notesEditor.contains(block) && block !== draggedBlock) {
                e.preventDefault();
                const rect = block.getBoundingClientRect();
                const after = (e.clientY - rect.top) > rect.height / 2;
                if (after) {
                    block.parentNode.insertBefore(draggedBlock, block.nextSibling);
                } else {
                    block.parentNode.insertBefore(draggedBlock, block);
                }
            }
            draggedBlock = null;
            recordHistory();
        };

        const enableBlockDragging = () => {
            notesEditor.addEventListener('dragstart', onDragStart);
            notesEditor.addEventListener('dragover', onDragOver);
            notesEditor.addEventListener('drop', onDrop);
            notesEditor.querySelectorAll(blockSelector).forEach(block => {
                block.setAttribute('draggable', 'true');
                block.style.cursor = 'move';
            });
            recordHistory();
        };

        const disableBlockDragging = () => {
            notesEditor.removeEventListener('dragstart', onDragStart);
            notesEditor.removeEventListener('dragover', onDragOver);
            notesEditor.removeEventListener('drop', onDrop);
            notesEditor.querySelectorAll(blockSelector).forEach(block => {
                block.removeAttribute('draggable');
                block.style.cursor = '';
            });
            draggedBlock = null;
        };

        const toggleBlockDrag = () => {
            blockDragEnabled = !blockDragEnabled;
            dragBtn?.classList.toggle('active', blockDragEnabled);
            if (blockDragEnabled) {
                enableBlockDragging();
            } else {
                disableBlockDragging();
            }
        };

        const toggleFullscreen = () => {
            if (!fullscreenEnabled) {
                if (notesMainContent) {
                    savedEditorWidth = notesMainContent.offsetWidth;
                    notesMainContent.style.maxWidth = savedEditorWidth + 'px';
                    notesMainContent.style.margin = '0 auto';
                }
            } else {
                if (notesMainContent) {
                    notesMainContent.style.maxWidth = '';
                    notesMainContent.style.margin = '';
                }
            }
            fullscreenEnabled = !fullscreenEnabled;
            notesModalContent?.classList.toggle('fullscreen', fullscreenEnabled);
            fullscreenBtn?.classList.toggle('active', fullscreenEnabled);
        };

        if (dragBtn) {
            dragBtn.addEventListener('click', toggleBlockDrag);
        }
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', toggleFullscreen);
        }

        const resetEditorModes = () => {
            blockDragEnabled = false;
            if (dragBtn) dragBtn.classList.remove('active');
            disableBlockDragging();
            fullscreenEnabled = false;
            if (fullscreenBtn) fullscreenBtn.classList.remove('active');
            if (notesModalContent) notesModalContent.classList.remove('fullscreen');
            if (notesMainContent) {
                notesMainContent.style.maxWidth = '';
                notesMainContent.style.margin = '';
            }
            savedEditorWidth = 0;
        };

        resetEditorModes();

        const adjustIndent = (delta, root) => {
            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            let node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
            if (!root.contains(node)) return;
            const callout = node.closest('.note-callout-content');
            sanitizeCalloutContent(callout);

            const blocks = [];
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
                acceptNode(n) {
                    if (!range.intersectsNode(n)) return NodeFilter.FILTER_SKIP;
                    if (!n.matches('p, li, div, table')) return NodeFilter.FILTER_SKIP;
                    if (n.closest('table') && n.tagName !== 'TABLE') return NodeFilter.FILTER_SKIP;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            let current;
            while ((current = walker.nextNode())) {
                if (!blocks.some(b => b.contains(current))) blocks.push(current);
            }
            if (!blocks.length) {
                let block = range.startContainer;
                if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
                while (block && block !== root && !block.matches('p, li, div, table')) {
                    block = block.parentElement;
                }
                if (block && block !== root) {
                    blocks.push(block);
                } else {
                    const newBlock = document.createElement('p');
                    range.surroundContents(newBlock);
                    blocks.push(newBlock);
                }
            }

            let endBlock = range.endContainer;
            if (endBlock.nodeType === Node.TEXT_NODE) endBlock = endBlock.parentElement;
            while (endBlock && endBlock !== root && !endBlock.matches('p, li, div, table')) {
                endBlock = endBlock.parentElement;
            }
            if (endBlock && !blocks.includes(endBlock)) blocks.push(endBlock);

            blocks.forEach(block => {
                const currentClass = Array.from(block.classList).find(c => c.startsWith('indent-'));
                let level = currentClass ? parseInt(currentClass.split('-')[1], 10) : 0;
                if (currentClass) block.classList.remove(currentClass);
                level = Math.max(0, Math.min(5, level + delta));
                if (level > 0) {
                    block.classList.add(`indent-${level}`);
                } else if (delta < 0) {
                    let target = block;
                    while (target && target !== root) {
                        ['margin-left', 'padding-left', 'text-indent'].forEach(prop => {
                            target.style.removeProperty(prop);
                        });
                        const styleAttr = target.getAttribute('style');
                        if (!styleAttr || styleAttr.trim() === '') {
                            target.removeAttribute('style');
                        }
                        Array.from(target.classList).forEach(cls => {
                            if (cls.startsWith('indent-')) target.classList.remove(cls);
                        });
                        if (target.tagName === 'BLOCKQUOTE') {
                            const parent = target.parentNode;
                            while (target.firstChild) parent.insertBefore(target.firstChild, target);
                            target.remove();
                            target = parent;
                        } else {
                            target = target.parentElement;
                        }
                    }
                }
            });
            recordHistory();
        };

        /**
         * Ajusta manualmente la sangría del bloque que contiene la selección.
         * Esto es útil cuando el usuario desea forzar una clase `indent-n` sin
         * alterar la estructura del DOM.  Ejemplo:
         *   manualIndentBlock(root)   // añade un nivel: indent-1 → indent-2
         *   manualOutdentBlock(root)  // elimina un nivel: indent-2 → indent-1
         */
        const manualIndentBlock = (root) => {
            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            let block = range.startContainer;
            if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
            while (block && block !== root && !block.matches('p, li, div, table')) {
                block = block.parentElement;
            }
            if (block && root.contains(block)) {
                const currentClass = Array.from(block.classList).find(c => c.startsWith('indent-'));
                let level = currentClass ? parseInt(currentClass.split('-')[1], 10) : 0;
                if (currentClass) block.classList.remove(currentClass);
                level = Math.max(0, Math.min(5, level + 1));
                if (level > 0) block.classList.add(`indent-${level}`);
                recordHistory();
            }
        };

        const manualOutdentBlock = (root) => {
            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            let block = range.startContainer;
            if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
            while (block && block !== root && !block.matches('p, li, div, table')) {
                block = block.parentElement;
            }
            if (block && root.contains(block)) {
                const currentClass = Array.from(block.classList).find(c => c.startsWith('indent-'));
                let level = currentClass ? parseInt(currentClass.split('-')[1], 10) : 0;
                if (currentClass) block.classList.remove(currentClass);
                level = Math.max(0, Math.min(5, level - 1));
                if (level > 0) block.classList.add(`indent-${level}`);
                recordHistory();
            }
        };

        const clearFormatting = () => {
            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            const range = sel.getRangeAt(0).cloneRange();
            document.execCommand('removeFormat');

            const unwrapNode = (node) => {
                const parent = node.parentNode;
                if (!parent) return;
                while (node.firstChild) parent.insertBefore(node.firstChild, node);
                parent.removeChild(node);
            };

            const inlineNodes = [];
            const walker = document.createTreeWalker(
                range.commonAncestorContainer,
                NodeFilter.SHOW_ELEMENT,
                {
                    acceptNode(node) {
                        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
                    }
                }
            );
            while (walker.nextNode()) inlineNodes.push(walker.currentNode);
            if (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE) {
                inlineNodes.push(range.commonAncestorContainer);
            }

            inlineNodes.forEach(node => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                if (!notesEditor.contains(node)) return;

                if (node.dataset && node.dataset.lineHighlight) {
                    delete node.dataset.lineHighlight;
                    delete node.dataset.lineHighlightColor;
                    node.style.removeProperty('background-color');
                    node.style.removeProperty('padding-left');
                    node.style.removeProperty('padding-right');
                    node.style.removeProperty('margin-top');
                    node.style.removeProperty('margin-bottom');
                    node.style.removeProperty('border-top-left-radius');
                    node.style.removeProperty('border-top-right-radius');
                    node.style.removeProperty('border-bottom-left-radius');
                    node.style.removeProperty('border-bottom-right-radius');
                }

                if (node.dataset && node.dataset.pillText) {
                    delete node.dataset.pillText;
                }

                if (node.tagName === 'MARK') {
                    unwrapNode(node);
                    return;
                }

                const classList = Array.from(node.classList || []);
                classList
                    .filter(cls => /highlight|pill/i.test(cls))
                    .forEach(cls => node.classList.remove(cls));

                if (typeof node.removeAttribute === 'function') {
                    ['bgcolor', 'color'].forEach(attr => {
                        if (node.hasAttribute(attr)) node.removeAttribute(attr);
                    });
                }

                if (node.style) {
                    Array.from(node.style).forEach(prop => {
                        const normalized = prop.toLowerCase();
                        if (
                            normalized.includes('background') ||
                            normalized.includes('color') ||
                            normalized.includes('shadow') ||
                            normalized.startsWith('--')
                        ) {
                            node.style.removeProperty(prop);
                        }
                    });
                    if (!node.getAttribute('style') || node.getAttribute('style').trim() === '') {
                        node.removeAttribute('style');
                    }
                }

                if (node.tagName === 'SPAN' && !node.attributes.length) {
                    unwrapNode(node);
                }
            });

            const blocks = getSelectedBlockElements();
            blocks.forEach(block => {
                block.removeAttribute('style');
                block.removeAttribute('class');
                if (block.tagName === 'BLOCKQUOTE') {
                    while (block.firstChild) block.parentNode.insertBefore(block.firstChild, block);
                    block.remove();
                }
            });
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
                    withEditorSelection(() => action(color));
                    notesEditor.focus({ preventScroll: true });
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
                    withEditorSelection(() => action(color));
                    submenu.classList.remove('visible');
                    savedEditorSelection = null;
                    notesEditor.focus({ preventScroll: true });
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
                withEditorSelection(() => action(e.target.value));
                savedEditorSelection = null;
                notesEditor.focus({ preventScroll: true });
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
                if (submenu.classList.contains('visible')) {
                    submenu.style.left = '0';
                    submenu.style.right = 'auto';
                    const menuRect = submenu.getBoundingClientRect();
                    const containerRect = group.parentElement.getBoundingClientRect();
                    if (menuRect.right > containerRect.right) {
                        submenu.style.left = 'auto';
                        submenu.style.right = '0';
                    }
                }
            });
            
            return group;
        };

        const createSymbolDropdown = (symbols, title, icon, editHandler, isChar = false) => {
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
                const editBtn = document.createElement('button');
                editBtn.textContent = 'Editar';
                editBtn.className = 'symbol-btn';
                editBtn.addEventListener('click', () => {
                    content.classList.remove('visible');
                    if (editHandler) editHandler();
                });
                content.appendChild(editBtn);
            };
            renderSymbols();
            if (isChar) {
                charDropdownRenderers.push(renderSymbols);
            } else {
                iconDropdownRenderers.push(renderSymbols);
            }
            dropdown.appendChild(content);
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const otherOpen = document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible');
                otherOpen.forEach(d => {
                    if (d !== content) d.classList.remove('visible');
                });
                const willShow = !content.classList.contains('visible');
                content.classList.toggle('visible');
                if (willShow) {
                    // Posicionar inicialmente a la derecha del botón
                    content.style.left = '100%';
                    content.style.right = 'auto';
                    const contentRect = content.getBoundingClientRect();
                    const containerRect = dropdown.parentElement.getBoundingClientRect();
                    // Si se desborda, mostrar a la izquierda
                    if (contentRect.right > containerRect.right) {
                        content.style.left = 'auto';
                        content.style.right = '100%';
                    }
                }
            });
            return dropdown;
        };

        // Font family selector
        const selectFont = document.createElement('select');
        selectFont.className = 'toolbar-select';
        selectFont.title = 'Fuente';
        selectFont.style.width = '60px';
        const fontPlaceholder = document.createElement('option');
        fontPlaceholder.value = "";
        fontPlaceholder.textContent = 'Fuente';
        fontPlaceholder.disabled = true;
        fontPlaceholder.selected = true;
        selectFont.appendChild(fontPlaceholder);
        const fonts = ['San Francisco', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Calibri'];
        fonts.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            opt.style.fontFamily = f;
            selectFont.appendChild(opt);
        });
        selectFont.addEventListener('change', () => {
            if (selectFont.value) {
                withEditorSelection(() => document.execCommand('fontName', false, selectFont.value));
                selectFont.selectedIndex = 0;
                notesEditor.focus({ preventScroll: true });
            }
        });
        editorToolbar.appendChild(selectFont);

        // Zoom selector
        const selectZoom = document.createElement('select');
        selectZoom.className = 'toolbar-select';
        selectZoom.title = 'Zoom';
        selectZoom.style.width = '60px';
        const zoomPlaceholder = document.createElement('option');
        zoomPlaceholder.value = "";
        zoomPlaceholder.textContent = 'Zoom';
        zoomPlaceholder.disabled = true;
        zoomPlaceholder.selected = true;
        selectZoom.appendChild(zoomPlaceholder);
        [50,60,75,80,90,100,110,120,130,150].forEach(level => {
            const opt = document.createElement('option');
            opt.value = (level/100).toString();
            opt.textContent = `${level}%`;
            selectZoom.appendChild(opt);
        });
        selectZoom.addEventListener('change', () => {
            if (selectZoom.value) {
                notesEditor.style.zoom = selectZoom.value;
                selectZoom.selectedIndex = 0;
                notesEditor.focus({ preventScroll: true });
            }
        });
        editorToolbar.appendChild(selectZoom);

        // Font size selector
        const selectSize = document.createElement('select');
        selectSize.className = 'toolbar-select';
        selectSize.title = 'Tamaño de letra';
        selectSize.style.width = '60px';
        
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
                withEditorSelection(() => document.execCommand('fontSize', false, selectSize.value));
                selectSize.selectedIndex = 0; // Reset to placeholder
                notesEditor.focus({ preventScroll: true });
            }
        });
        editorToolbar.appendChild(selectSize);

        const adjustFontSize = (factor) => {
            const blocks = getSelectedBlockElements();
            blocks.forEach(block => {
                if (block && notesEditor.contains(block)) {
                    const elems = [block, ...block.querySelectorAll('*')];
                    const sizes = elems.map(el => parseFloat(window.getComputedStyle(el).fontSize));
                    elems.forEach((el, i) => {
                        el.style.fontSize = (sizes[i] * factor).toFixed(1) + 'px';
                    });
                }
            });
            notesEditor.focus({ preventScroll: true });
        };

        editorToolbar.appendChild(createButton('Disminuir tamaño de fuente', '-', null, null, () => adjustFontSize(0.9), 'compact-btn'));
        editorToolbar.appendChild(createButton('Aumentar tamaño de fuente', '+', null, null, () => adjustFontSize(1.1), 'compact-btn'));

        // Line height selector
        const selectLineHeight = document.createElement('select');
        selectLineHeight.className = 'toolbar-select';
        selectLineHeight.title = 'Interlineado';
        selectLineHeight.style.width = '60px';

        const lineHeightPlaceholder = document.createElement('option');
        lineHeightPlaceholder.value = "";
        lineHeightPlaceholder.textContent = "Interlineado";
        lineHeightPlaceholder.disabled = true;
        lineHeightPlaceholder.selected = true;
        selectLineHeight.appendChild(lineHeightPlaceholder);
        
        const orderedLineHeights = {
            'Grande': '2.0',
            'Normal': '1.6',
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
                withEditorSelection(() => {
                    const elements = getSelectedBlockElements();
                    if (elements.length > 0) {
                        elements.forEach(block => {
                            if (block && notesEditor.contains(block)) {
                                block.style.lineHeight = value;
                            }
                        });
                    }
                });
                selectLineHeight.selectedIndex = 0; // Reset to placeholder
                notesEditor.focus({ preventScroll: true });
            }
        });
        editorToolbar.appendChild(selectLineHeight);

        const adjustLineHeight = (delta) => {
            const blocks = getSelectedBlockElements();
            blocks.forEach(block => {
                if (block && notesEditor.contains(block)) {
                    const computed = window.getComputedStyle(block);
                    const fontSize = parseFloat(computed.fontSize);
                    let lh = parseFloat(computed.lineHeight) / fontSize;
                    if (isNaN(lh)) lh = 1.6;
                    lh = Math.max(1, lh + delta);
                    block.style.lineHeight = lh.toFixed(1);
                }
            });
            notesEditor.focus({ preventScroll: true });
        };

        const buildPresetStyle = (background, color) => `font-family:Arial; font-weight:600; background:${background}; color:${color}; padding:2px 4px; border-radius:4px;`;

        const hexToRgb = (hex) => {
            let value = (hex || '#000000').replace('#', '');
            if (value.length === 3) {
                value = value.split('').map(ch => ch + ch).join('');
            }
            const num = parseInt(value, 16);
            return {
                r: (num >> 16) & 255,
                g: (num >> 8) & 255,
                b: num & 255
            };
        };

        const rgbToHex = (r, g, b) => '#' + [r, g, b]
            .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
            .join('');

        const mixColors = (hex1, hex2, weight = 0.5) => {
            const w = Math.max(0, Math.min(1, weight));
            const c1 = hexToRgb(hex1);
            const c2 = hexToRgb(hex2);
            return rgbToHex(
                c1.r * w + c2.r * (1 - w),
                c1.g * w + c2.g * (1 - w),
                c1.b * w + c2.b * (1 - w)
            );
        };

        const VARIANT_BLUEPRINTS = [
            { name: 'Pastel', create: (bg, color) => ({ background: mixColors(bg, '#ffffff', 0.72), color: mixColors(color, '#374151', 0.55) }) },
            { name: 'Intenso', create: (bg, color) => ({ background: mixColors(bg, '#000000', 0.85), color: mixColors(color, '#ffffff', 0.4) }) },
            { name: 'Contraste', create: (bg, color) => ({ background: mixColors(bg, color, 0.6), color: mixColors(color, '#111827', 0.7) }) },
            { name: 'Suave', create: (bg, color) => ({ background: mixColors(bg, '#ffffff', 0.85), color: mixColors(color, '#000000', 0.5) }) }
        ];

        const createStyleGroup = (label, background, color) => {
            const baseStyle = buildPresetStyle(background, color);
            const variants = VARIANT_BLUEPRINTS.map(variant => {
                const colors = variant.create(background, color);
                return {
                    label: `${label} ${variant.name}`,
                    style: buildPresetStyle(colors.background, colors.color)
                };
            });
            return { label, style: baseStyle, variants };
        };

        const PRESET_STYLE_GROUPS = [
            createStyleGroup('Estilo celeste', '#e0f7fa', '#01579b'),
            createStyleGroup('Estilo lila', '#f3e5f5', '#6a1b9a'),
            createStyleGroup('Estilo menta', '#e8f5e9', '#1b5e20'),
            createStyleGroup('Estilo durazno', '#fff3e0', '#e65100'),
            createStyleGroup('Estilo amarillo', '#fffde7', '#f57f17'),
            createStyleGroup('Estilo rosado', '#fce4ec', '#ad1457'),
            createStyleGroup('Estilo azul', '#e3f2fd', '#1a237e'),
            createStyleGroup('Estilo turquesa', '#e0f2f1', '#004d40'),
            createStyleGroup('Estilo arena', '#fbe9e7', '#4e342e'),
            createStyleGroup('Estilo café', '#efebe9', '#5d4037'),
            createStyleGroup('Estilo rojo', '#f44336', '#ffffff'),
            createStyleGroup('Estilo verde oscuro', '#1b5e20', '#ffffff'),
            createStyleGroup('Estilo coral', '#ffe5e0', '#bf360c'),
            createStyleGroup('Estilo oliva', '#f1f8e9', '#33691e'),
            createStyleGroup('Estilo marino', '#e1f5fe', '#0277bd'),
            createStyleGroup('Estilo grafito', '#eceff1', '#263238')
        ];

        const applyPresetStyle = (cssText, existingSpan = null) => {
            if (existingSpan) {
                existingSpan.style.cssText = cssText;
                existingSpan.dataset.presetStyle = cssText;
                return;
            }
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            if (range.collapsed) return;
            const text = range.toString();
            const span = document.createElement('span');
            span.style.cssText = cssText;
            span.dataset.presetStyle = cssText;
            span.textContent = text;
            range.deleteContents();
            range.insertNode(span);
            const newRange = document.createRange();
            newRange.setStartAfter(span);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        };

        let presetVariantIdCounter = 0;

        const formatPresetLabel = (label) => {
            if (!label) return '';
            const cleaned = label.replace(/^Estilo\s+/i, '').trim();
            if (!cleaned) return label.trim();
            return cleaned.replace(/^./, (c) => c.toUpperCase());
        };

        const renderPresetStyleList = (container, { onSelectStyle }) => {
            container.innerHTML = '';
            const entries = [];
            const closeAll = () => {
                entries.forEach(({ list, toggle }) => {
                    list.hidden = true;
                    toggle.setAttribute('aria-expanded', 'false');
                });
            };
            const handleSelect = (style) => {
                if (typeof onSelectStyle === 'function') {
                    onSelectStyle(style, { closeAll });
                }
            };
            const createPreview = (label, style, badgeText = '') => {
                const preview = document.createElement('span');
                preview.className = 'preset-style-preview';
                preview.setAttribute('style', style);
                const text = document.createElement('span');
                text.className = 'preset-style-label';
                text.textContent = formatPresetLabel(label);
                preview.appendChild(text);
                if (badgeText) {
                    const badge = document.createElement('span');
                    badge.className = 'preset-style-variant-badge';
                    badge.textContent = badgeText;
                    preview.appendChild(badge);
                }
                return preview;
            };
            PRESET_STYLE_GROUPS.forEach(group => {
                const option = document.createElement('div');
                option.className = 'preset-style-option';
                const row = document.createElement('div');
                row.className = 'preset-style-row';
                const mainBtn = document.createElement('button');
                mainBtn.type = 'button';
                mainBtn.className = 'toolbar-btn preset-style-main';
                mainBtn.appendChild(createPreview(group.label, group.style));
                mainBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    handleSelect(group.style);
                });
                row.appendChild(mainBtn);
                const toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'toolbar-btn preset-style-variants-toggle';
                toggle.innerHTML = '＋';
                toggle.title = `Ver variaciones de ${formatPresetLabel(group.label)}`;
                toggle.setAttribute('aria-expanded', 'false');
                row.appendChild(toggle);
                option.appendChild(row);
                const variantsList = document.createElement('div');
                variantsList.className = 'preset-style-variants';
                variantsList.hidden = true;
                const variantsId = `preset-style-variants-${++presetVariantIdCounter}`;
                variantsList.id = variantsId;
                toggle.setAttribute('aria-controls', variantsId);
                group.variants.forEach(variant => {
                    const variantBtn = document.createElement('button');
                    variantBtn.type = 'button';
                    variantBtn.className = 'toolbar-btn preset-style-variant';
                    const variantName = variant.label.replace(`${group.label} `, '').trim();
                    variantBtn.appendChild(
                        createPreview(variant.label, variant.style, variantName)
                    );
                    variantBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        handleSelect(variant.style);
                    });
                    variantsList.appendChild(variantBtn);
                });
                option.appendChild(variantsList);
                toggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    const shouldOpen = variantsList.hidden;
                    closeAll();
                    if (shouldOpen) {
                        variantsList.hidden = false;
                        toggle.setAttribute('aria-expanded', 'true');
                    }
                });
                container.appendChild(option);
                entries.push({ list: variantsList, toggle });
            });
            return { closeAll };
        };

        const buildPresetStylePanel = (container, onSelectStyle) => {
            container.innerHTML = '';
            const header = document.createElement('div');
            header.className = 'preset-style-panel-header';
            const icon = document.createElement('span');
            icon.className = 'preset-style-panel-icon';
            icon.textContent = '🖌️';
            header.appendChild(icon);
            const title = document.createElement('span');
            title.className = 'preset-style-panel-title';
            title.textContent = 'Estilos de texto';
            header.appendChild(title);
            container.appendChild(header);

            const optionsContainer = document.createElement('div');
            optionsContainer.className = 'preset-style-options';
            container.appendChild(optionsContainer);

            return renderPresetStyleList(optionsContainer, {
                onSelectStyle: (style, helpers) => {
                    if (typeof onSelectStyle === 'function') {
                        onSelectStyle(style, helpers);
                    }
                }
            });
        };

        const createPresetStyleDropdown = () => {
            const dropdown = document.createElement('div');
            dropdown.className = 'symbol-dropdown';
            const btn = createButton('Estilos de texto', '🖌️', null, null, null);
            dropdown.appendChild(btn);
            const content = document.createElement('div');
            content.className = 'symbol-dropdown-content preset-style-panel';
            const listControls = buildPresetStylePanel(content, (style, { closeAll }) => {
                applyPresetStyle(style);
                closeAll();
                content.classList.remove('visible');
                notesEditor.focus({ preventScroll: true });
            });
            dropdown.appendChild(content);
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
                    if (d !== content) d.classList.remove('visible');
                });
                const wasVisible = content.classList.contains('visible');
                content.classList.toggle('visible', !wasVisible);
                if (!wasVisible) {
                    const editorRect = notesModalContent.getBoundingClientRect();
                    const dropdownRect = dropdown.getBoundingClientRect();
                    const contentRect = content.getBoundingClientRect();
                    const editorCenter = editorRect.left + editorRect.width / 2;
                    let left = editorCenter - dropdownRect.left - contentRect.width / 2;
                    const minLeft = editorRect.left - dropdownRect.left;
                    const maxLeft = editorRect.right - dropdownRect.left - contentRect.width;
                    if (left < minLeft) left = minLeft;
                    if (left > maxLeft) left = maxLeft;
                    content.style.left = `${left}px`;
                } else {
                    listControls.closeAll();
                }
            });
            return dropdown;
        };

        editorToolbar.appendChild(createButton('Reducir interlineado', '-', null, null, () => adjustLineHeight(-0.2), 'compact-btn'));
        editorToolbar.appendChild(createButton('Aumentar interlineado', '+', null, null, () => adjustLineHeight(0.2), 'compact-btn'));


        editorToolbar.appendChild(createSeparator());

        // Basic formatting
        editorToolbar.appendChild(createButton('Tachado', '<s>S</s>', 'strikeThrough'));
        editorToolbar.appendChild(createButton('Deshacer', '↺', null, null, undoAction));
        editorToolbar.appendChild(createButton('Rehacer', '↻', null, null, redoAction));

        editorToolbar.appendChild(createButton('Limpiar formato', '❌', null, null, clearFormatting));

        editorToolbar.appendChild(createButton('Mejorar texto', '✨', null, null, improveSelectedText));

        editorToolbar.appendChild(createButton('Insertar nota', '📝', null, null, () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                savedEditorSelection = selection.getRangeAt(0).cloneRange();
            }
            openNoteStyleModal();
        }));

        const inlineNoteBtn = createButton('Insertar nota en línea', currentInlineNoteIcon, null, null, insertInlineNoteIcon);
        inlineNoteBtn.setAttribute('aria-label', 'Insertar nota en línea');
        editorToolbar.appendChild(inlineNoteBtn);

        const inlineIconSelect = document.createElement('select');
        inlineIconSelect.className = 'toolbar-select inline-note-icon-select';
        ['ℹ️', '❓', '💡', '🔖', '⁎', '🧩', '🗒️'].forEach(icon => {
            const opt = document.createElement('option');
            opt.value = icon;
            opt.textContent = icon;
            inlineIconSelect.appendChild(opt);
        });
        inlineIconSelect.value = currentInlineNoteIcon;
        inlineIconSelect.addEventListener('change', () => {
            currentInlineNoteIcon = inlineIconSelect.value;
            inlineNoteBtn.innerHTML = currentInlineNoteIcon;
        });
        editorToolbar.appendChild(inlineIconSelect);

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
                    const inTable = !!block.closest('table');
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
                        delete block.dataset.lineHighlight;
                        delete block.dataset.lineHighlightColor;
                    } else {
                        block.style.backgroundColor = color;
                        block.dataset.lineHighlight = 'true';
                        block.dataset.lineHighlightColor = color;
                        if (inTable) {
                            block.style.paddingLeft = '';
                            block.style.paddingRight = '';
                            block.style.marginTop = '';
                            block.style.marginBottom = '';
                            block.style.borderTopLeftRadius = '0';
                            block.style.borderTopRightRadius = '0';
                            block.style.borderBottomLeftRadius = '0';
                            block.style.borderBottomRightRadius = '0';
                        } else {
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
                }
            });
        };

        const typeIcon = UI_ICON_STRINGS.type;
        const highlighterIcon = UI_ICON_STRINGS.highlighter;

        const ensureFloatingToolbarElement = () => {
            if (!floatingFormatToolbar) {
                floatingFormatToolbar = document.createElement('div');
                floatingFormatToolbar.id = 'floating-format-toolbar';
                floatingFormatToolbar.className = 'floating-format-toolbar';
                document.body.appendChild(floatingFormatToolbar);
            }
            return floatingFormatToolbar;
        };

        const hideFloatingToolbar = () => {
            if (!floatingFormatToolbar) return;
            floatingFormatToolbar.classList.remove('visible');
            floatingFormatToolbar.style.visibility = '';
            floatingToolbarRange = null;
            floatingToolbarVisible = false;
        };

        const updateFloatingToolbarPosition = () => {
            const toolbar = ensureFloatingToolbarElement();
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                hideFloatingToolbar();
                return;
            }
            const range = selection.getRangeAt(0);
            if (!range || range.collapsed) {
                hideFloatingToolbar();
                return;
            }
            const anchorInside = range.startContainer && notesEditor.contains(range.startContainer);
            const focusInside = range.endContainer && notesEditor.contains(range.endContainer);
            if (!anchorInside && !focusInside) {
                hideFloatingToolbar();
                return;
            }
            const rect = range.getBoundingClientRect();
            if (!rect || (rect.width === 0 && rect.height === 0)) {
                hideFloatingToolbar();
                return;
            }
            floatingToolbarRange = range.cloneRange();
            toolbar.classList.add('visible');
            toolbar.style.visibility = 'hidden';
            toolbar.style.top = '0px';
            toolbar.style.left = '0px';
            const toolbarRect = toolbar.getBoundingClientRect();
            let top = rect.top + window.scrollY - toolbarRect.height - 8;
            if (top < window.scrollY + 8) {
                top = rect.bottom + window.scrollY + 8;
            }
            let left = rect.left + window.scrollX + rect.width / 2 - toolbarRect.width / 2;
            const minLeft = window.scrollX + 8;
            const maxLeft = window.scrollX + window.innerWidth - toolbarRect.width - 8;
            if (left < minLeft) left = minLeft;
            if (left > maxLeft) left = maxLeft;
            toolbar.style.top = `${top}px`;
            toolbar.style.left = `${left}px`;
            toolbar.style.visibility = '';
            floatingToolbarVisible = true;
        };

        const scheduleFloatingToolbarUpdate = () => {
            requestAnimationFrame(updateFloatingToolbarPosition);
        };

        const rebuildFloatingToolbar = () => {
            const toolbar = ensureFloatingToolbarElement();
            toolbar.innerHTML = '';
            const actionsRow = document.createElement('div');
            actionsRow.className = 'floating-toolbar-row';
            const makeFloatingButton = (title, content, command, value = null, action = null) => {
                const btn = document.createElement('button');
                btn.className = 'toolbar-btn floating-btn';
                btn.title = title;
                btn.innerHTML = content;
                btn.addEventListener('mousedown', (e) => e.preventDefault());
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    withEditorSelection(() => {
                        if (command) {
                            document.execCommand(command, false, value);
                        }
                        if (typeof action === 'function') {
                            action();
                        }
                    });
                    scheduleFloatingToolbarUpdate();
                });
                return btn;
            };
            actionsRow.appendChild(makeFloatingButton('Negrita', '<b>B</b>', 'bold'));
            actionsRow.appendChild(makeFloatingButton('Cursiva', '<i>I</i>', 'italic'));
            actionsRow.appendChild(makeFloatingButton('Subrayado', '<u>U</u>', 'underline'));
            actionsRow.appendChild(makeFloatingButton('Superíndice', 'X²', 'superscript'));
            toolbar.appendChild(actionsRow);

            const colorRow = document.createElement('div');
            colorRow.className = 'floating-toolbar-row floating-toolbar-colors';
            const floatingTextPalette = createColorPalette('Color de Texto', applyForeColor, textColors, extraTextColors, typeIcon);
            floatingTextPalette.classList.add('floating-color-palette');
            const floatingHighlightPalette = createColorPalette('Color de Resaltado', applyHiliteColor, highlightColors, extraHighlightColors, highlighterIcon);
            floatingHighlightPalette.classList.add('floating-color-palette');
            const floatingLinePalette = createColorPalette('Color de fondo de línea', applyLineHighlight, ['#FFFFFF'], extraHighlightColors.concat(highlightColors), highlighterIcon);
            floatingLinePalette.classList.add('floating-color-palette');
            colorRow.appendChild(floatingTextPalette);
            colorRow.appendChild(floatingHighlightPalette);
            colorRow.appendChild(floatingLinePalette);
            toolbar.appendChild(colorRow);
            hideFloatingToolbar();
        };

        const registerFloatingToolbarListeners = () => {
            if (floatingToolbarListenersInitialized) return;
            const monitorSelection = () => {
                const selection = window.getSelection();
                if (!selection || selection.rangeCount === 0) {
                    hideFloatingToolbar();
                    return;
                }
                const range = selection.getRangeAt(0);
                if (!range || range.collapsed) {
                    hideFloatingToolbar();
                    return;
                }
                const anchorInside = range.startContainer && notesEditor.contains(range.startContainer);
                const focusInside = range.endContainer && notesEditor.contains(range.endContainer);
                if (!anchorInside && !focusInside) {
                    hideFloatingToolbar();
                    return;
                }
                scheduleFloatingToolbarUpdate();
            };
            const updateIfVisible = () => {
                if (floatingToolbarVisible) scheduleFloatingToolbarUpdate();
            };
            notesEditor.addEventListener('mouseup', monitorSelection);
            notesEditor.addEventListener('keyup', monitorSelection);
            notesEditor.addEventListener('touchend', monitorSelection);
            document.addEventListener('selectionchange', monitorSelection);
            window.addEventListener('scroll', updateIfVisible, true);
            window.addEventListener('resize', updateIfVisible);
            notesModalContent?.addEventListener('scroll', updateIfVisible);
            document.addEventListener('mousedown', (e) => {
                if (!floatingToolbarVisible) return;
                if (floatingFormatToolbar && floatingFormatToolbar.contains(e.target)) return;
                if (notesEditor.contains(e.target)) return;
                hideFloatingToolbar();
            });
            floatingToolbarListenersInitialized = true;
        };

        rebuildFloatingToolbar();
        registerFloatingToolbarListeners();

        const tailwindSpacingScale = {
            '0': 0,
            '1': 4,
            '2': 8,
            '3': 12,
            '4': 16,
            '5': 20,
            '6': 24,
            '8': 32,
            '10': 40
        };

        const createTailwindSpacingControl = () => {
            const dropdown = document.createElement('div');
            dropdown.className = 'symbol-dropdown tailwind-spacing-control';

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'toolbar-btn';
            toggle.title = 'Ajustar clases Tailwind de espacio';
            toggle.textContent = '📏';
            dropdown.appendChild(toggle);

            const panel = document.createElement('div');
            panel.className = 'symbol-dropdown-content tailwind-spacing-panel';
            dropdown.appendChild(panel);

            const info = document.createElement('p');
            info.className = 'tailwind-spacing-info';
            info.textContent = 'Controla los márgenes mb-* y el espaciado space-y-* del bloque seleccionado.';
            panel.appendChild(info);

            const spacingPresets = [
                { value: '', label: 'Sin cambio' },
                { value: '0', label: '0 (0px)' },
                { value: '1', label: '1 (4px)' },
                { value: '2', label: '2 (8px)' },
                { value: '3', label: '3 (12px)' },
                { value: '4', label: '4 (16px)' },
                { value: '5', label: '5 (20px)' },
                { value: '6', label: '6 (24px)' },
                { value: '8', label: '8 (32px)' },
                { value: '10', label: '10 (40px)' },
                { value: 'custom', label: 'Personalizado (px)' }
            ];

            const buildRow = (labelText) => {
                const row = document.createElement('div');
                row.className = 'tailwind-spacing-row';
                const label = document.createElement('label');
                label.textContent = labelText;
                label.className = 'tailwind-spacing-label';
                const select = document.createElement('select');
                select.className = 'tailwind-spacing-select';
                spacingPresets.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.label;
                    select.appendChild(option);
                });
                const customWrapper = document.createElement('div');
                customWrapper.className = 'tailwind-spacing-custom';
                const customInput = document.createElement('input');
                customInput.type = 'number';
                customInput.placeholder = 'px';
                customInput.className = 'tailwind-spacing-input';
                customWrapper.appendChild(customInput);
                customWrapper.hidden = true;
                select.addEventListener('change', () => {
                    customWrapper.hidden = select.value !== 'custom';
                });
                row.appendChild(label);
                row.appendChild(select);
                row.appendChild(customWrapper);
                panel.appendChild(row);
                return { row, select, customWrapper, customInput };
            };

            const marginRow = buildRow('Margen inferior (mb-*)');
            const spaceRow = buildRow('Espaciado vertical (space-y-*)');

            const parsePx = (value) => {
                const num = parseFloat(value);
                return Number.isFinite(num) ? Math.round(num) : null;
            };

            const setRowFromBlock = (block, { select, customWrapper, customInput }, type) => {
                let classValue = null;
                if (block.classList) {
                    const prefix = type === 'margin' ? 'mb-' : 'space-y-';
                    const match = Array.from(block.classList).find(cls => cls.startsWith(prefix));
                    if (match) classValue = match.replace(prefix, '');
                }
                let unit = null;
                let storedValue = null;
                const valueAttr = type === 'margin' ? block.dataset.tailwindMbValue || block.dataset.tailwindMb : block.dataset.tailwindSpaceYValue || block.dataset.tailwindSpaceY;
                const unitAttr = type === 'margin' ? block.dataset.tailwindMbUnit : block.dataset.tailwindSpaceYUnit;
                if (classValue && tailwindSpacingScale[classValue] !== undefined) {
                    unit = 'scale';
                    storedValue = classValue;
                } else if (valueAttr) {
                    storedValue = valueAttr;
                    unit = unitAttr || (tailwindSpacingScale[valueAttr] !== undefined ? 'scale' : 'px');
                }
                if (!storedValue) {
                    const styleValue = type === 'margin'
                        ? block.style.marginBottom || window.getComputedStyle(block).marginBottom
                        : block.style.getPropertyValue('--tailwind-space-y') || window.getComputedStyle(block).getPropertyValue('--tailwind-space-y');
                    const parsed = parsePx(styleValue);
                    if (parsed !== null) {
                        storedValue = String(parsed);
                        unit = 'px';
                    }
                }
                if (unit === 'scale' && storedValue in tailwindSpacingScale) {
                    select.value = storedValue;
                    customWrapper.hidden = true;
                    customInput.value = '';
                } else if (unit === 'px' && storedValue) {
                    select.value = 'custom';
                    customWrapper.hidden = false;
                    customInput.value = storedValue.replace(/[^0-9.-]/g, '');
                } else {
                    select.value = '';
                    customWrapper.hidden = true;
                    customInput.value = '';
                }
            };

            const syncPanelWithSelection = () => {
                const blocks = getSelectedBlockElements().filter(block => block && notesEditor.contains(block));
                const primary = blocks[0];
                if (!primary) {
                    marginRow.select.value = '';
                    marginRow.customWrapper.hidden = true;
                    marginRow.customInput.value = '';
                    spaceRow.select.value = '';
                    spaceRow.customWrapper.hidden = true;
                    spaceRow.customInput.value = '';
                    return;
                }
                setRowFromBlock(primary, marginRow, 'margin');
                setRowFromBlock(primary, spaceRow, 'space');
            };

            const applySpacing = () => {
                const marginChoice = marginRow.select.value;
                const spaceChoice = spaceRow.select.value;
                const updateMargin = marginChoice !== '';
                const updateSpace = spaceChoice !== '';
                if (!updateMargin && !updateSpace) {
                    panel.classList.remove('visible');
                    return;
                }
                withEditorSelection(() => {
                    const blocks = getSelectedBlockElements().filter(block => block && notesEditor.contains(block));
                    if (!blocks.length) return;
                    blocks.forEach(block => {
                        if (updateMargin) {
                            if (block.classList) {
                                Array.from(block.classList).forEach(cls => {
                                    if (cls.startsWith('mb-')) block.classList.remove(cls);
                                });
                            }
                            let px = null;
                            if (marginChoice === 'custom') {
                                const parsed = parseFloat(marginRow.customInput.value || '0');
                                px = Number.isFinite(parsed) ? parsed : 0;
                                block.dataset.tailwindMbUnit = 'px';
                                block.dataset.tailwindMbValue = String(px);
                            } else {
                                const mapped = tailwindSpacingScale[marginChoice];
                                px = typeof mapped === 'number' ? mapped : 0;
                                if (block.classList) block.classList.add(`mb-${marginChoice}`);
                                block.dataset.tailwindMbUnit = 'scale';
                                block.dataset.tailwindMbValue = marginChoice;
                            }
                            block.style.marginBottom = `${px}px`;
                        }
                        if (updateSpace) {
                            if (block.classList) {
                                Array.from(block.classList).forEach(cls => {
                                    if (cls.startsWith('space-y-')) block.classList.remove(cls);
                                });
                            }
                            let px = null;
                            if (spaceChoice === 'custom') {
                                const parsed = parseFloat(spaceRow.customInput.value || '0');
                                px = Number.isFinite(parsed) ? parsed : 0;
                                block.dataset.tailwindSpaceYUnit = 'px';
                                block.dataset.tailwindSpaceYValue = String(px);
                            } else {
                                const mapped = tailwindSpacingScale[spaceChoice];
                                px = typeof mapped === 'number' ? mapped : 0;
                                if (block.classList) block.classList.add(`space-y-${spaceChoice}`);
                                block.dataset.tailwindSpaceYUnit = 'scale';
                                block.dataset.tailwindSpaceYValue = spaceChoice;
                            }
                            block.style.setProperty('--tailwind-space-y', `${px}px`);
                            block.style.rowGap = `${px}px`;
                        }
                    });
                    recordHistory();
                });
                panel.classList.remove('visible');
                notesEditor.focus({ preventScroll: true });
            };

            const resetSpacing = () => {
                withEditorSelection(() => {
                    const blocks = getSelectedBlockElements().filter(block => block && notesEditor.contains(block));
                    if (!blocks.length) return;
                    blocks.forEach(block => {
                        if (block.classList) {
                            Array.from(block.classList).forEach(cls => {
                                if (cls.startsWith('mb-') || cls.startsWith('space-y-')) {
                                    block.classList.remove(cls);
                                }
                            });
                        }
                        block.style.removeProperty('margin-bottom');
                        block.style.removeProperty('--tailwind-space-y');
                        block.style.removeProperty('row-gap');
                        delete block.dataset.tailwindMbValue;
                        delete block.dataset.tailwindMbUnit;
                        delete block.dataset.tailwindSpaceYValue;
                        delete block.dataset.tailwindSpaceYUnit;
                    });
                    recordHistory();
                });
                panel.classList.remove('visible');
                notesEditor.focus({ preventScroll: true });
            };

            const actions = document.createElement('div');
            actions.className = 'tailwind-spacing-actions';
            const applyBtn = document.createElement('button');
            applyBtn.type = 'button';
            applyBtn.className = 'toolbar-btn tailwind-spacing-apply';
            applyBtn.textContent = 'Aplicar';
            applyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                applySpacing();
            });
            const resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.className = 'toolbar-btn tailwind-spacing-reset';
            resetBtn.textContent = 'Restablecer';
            resetBtn.addEventListener('click', (e) => {
                e.preventDefault();
                resetSpacing();
            });
            actions.appendChild(applyBtn);
            actions.appendChild(resetBtn);
            panel.appendChild(actions);

            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
                    if (d !== panel) d.classList.remove('visible');
                });
                const willShow = !panel.classList.contains('visible');
                panel.classList.toggle('visible', willShow);
                if (willShow) {
                    syncPanelWithSelection();
                }
            });

            return dropdown;
        };

        editorToolbar.appendChild(createTailwindSpacingControl());

        const convertListTag = (list, tagName) => {
            if (!list || list.tagName.toLowerCase() === tagName.toLowerCase()) return list;
            const newList = document.createElement(tagName);
            newList.className = list.className;
            Array.from(list.attributes).forEach(attr => {
                if (attr.name !== 'style') {
                    newList.setAttribute(attr.name, attr.value);
                }
            });
            if (list.getAttribute('style')) {
                newList.setAttribute('style', list.getAttribute('style'));
            }
            Object.entries(list.dataset || {}).forEach(([key, value]) => {
                newList.dataset[key] = value;
            });
            while (list.firstChild) {
                newList.appendChild(list.firstChild);
            }
            list.parentNode?.replaceChild(newList, list);
            return newList;
        };

        const applyBulletStyle = ({ listTag, style }) => {
            document.execCommand(listTag === 'ol' ? 'insertOrderedList' : 'insertUnorderedList', false, null);
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            const range = selection.getRangeAt(0);
            const targets = new Set();
            getSelectedBlockElements().forEach(block => {
                const list = block?.closest('ul, ol');
                if (list) targets.add(list);
            });
            const anchorList = range.startContainer?.closest?.('ul, ol');
            if (anchorList) targets.add(anchorList);
            targets.forEach(list => {
                if (!list) return;
                let targetList = list;
                if (listTag === 'ul' && list.tagName !== 'UL') {
                    targetList = convertListTag(list, 'ul');
                } else if (listTag === 'ol' && list.tagName !== 'OL') {
                    targetList = convertListTag(list, 'ol');
                }
                if (!targetList) return;
                targetList.style.listStyleType = style;
                targetList.dataset.listStyleType = style;
            });
            recordHistory();
        };

        const bulletOptions = [
            { label: 'Viñeta clásica', preview: '•', listTag: 'ul', style: 'disc' },
            { label: 'Viñeta hueca', preview: '○', listTag: 'ul', style: 'circle' },
            { label: 'Viñeta cuadrada', preview: '■', listTag: 'ul', style: 'square' },
            { label: 'Numerada', preview: '1.', listTag: 'ol', style: 'decimal' },
            { label: 'Romanos', preview: 'I.', listTag: 'ol', style: 'upper-roman' }
        ];

        const bulletDropdown = document.createElement('div');
        bulletDropdown.className = 'symbol-dropdown bullet-style-dropdown';
        const bulletBtn = document.createElement('button');
        bulletBtn.type = 'button';
        bulletBtn.className = 'toolbar-btn';
        bulletBtn.title = 'Insertar viñetas';
        bulletBtn.innerHTML = '•✚';
        bulletBtn.addEventListener('mousedown', (event) => event.preventDefault());
        const bulletMenu = document.createElement('div');
        bulletMenu.className = 'symbol-dropdown-content bullet-style-menu';
        bulletOptions.forEach(option => {
            const optionBtn = document.createElement('button');
            optionBtn.type = 'button';
            optionBtn.className = 'toolbar-btn bullet-style-option';
            optionBtn.innerHTML = `<span class="bullet-preview">${option.preview}</span><span class="bullet-option-label">${option.label}</span>`;
            optionBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                withEditorSelection(() => applyBulletStyle(option));
                bulletMenu.classList.remove('visible');
                notesEditor.focus({ preventScroll: true });
            });
            bulletMenu.appendChild(optionBtn);
        });
        bulletDropdown.appendChild(bulletBtn);
        bulletDropdown.appendChild(bulletMenu);
        bulletBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(el => {
                if (el !== bulletMenu) el.classList.remove('visible');
            });
            bulletMenu.classList.toggle('visible');
        });
        document.addEventListener('click', (event) => {
            if (!bulletDropdown.contains(event.target)) {
                bulletMenu.classList.remove('visible');
            }
        });
        editorToolbar.appendChild(bulletDropdown);

        const removeBullets = () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            const scrollY = window.scrollY;
            const modalScroll = notesModalContent.scrollTop;
            const lists = new Set();
            getSelectedBlockElements().forEach(block => {
                const li = block?.closest('li');
                if (li) lists.add(li.parentElement);
            });
            const anchorLi = selection.anchorNode?.closest?.('li');
            if (anchorLi) lists.add(anchorLi.parentElement);
            if (!lists.size) return;
            let focusTarget = null;
            lists.forEach(list => {
                if (!list) return;
                const fragment = document.createDocumentFragment();
                Array.from(list.children).forEach(item => {
                    if (item.tagName !== 'LI') return;
                    const paragraph = document.createElement('p');
                    while (item.firstChild) {
                        paragraph.appendChild(item.firstChild);
                    }
                    if (!paragraph.textContent.trim()) {
                        paragraph.innerHTML = '<br>';
                    }
                    if (!focusTarget) focusTarget = paragraph;
                    fragment.appendChild(paragraph);
                });
                if (fragment.childNodes.length) {
                    list.parentNode?.insertBefore(fragment, list);
                }
                list.remove();
            });
            if (focusTarget) {
                moveCaretToElementStart(focusTarget);
            }
            recordHistory();
            window.scrollTo(0, scrollY);
            notesModalContent.scrollTop = modalScroll;
            notesEditor.focus({ preventScroll: true });
        };

        const removeBulletsBtn = document.createElement('button');
        removeBulletsBtn.type = 'button';
        removeBulletsBtn.className = 'toolbar-btn';
        removeBulletsBtn.title = 'Eliminar viñetas';
        removeBulletsBtn.innerHTML = '•✖';
        removeBulletsBtn.addEventListener('mousedown', (event) => event.preventDefault());
        removeBulletsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            removeBullets();
        });
        editorToolbar.appendChild(removeBulletsBtn);

        editorToolbar.appendChild(createPresetStyleDropdown());

        const inlineColorMenu = document.createElement('div');
        inlineColorMenu.className = 'inline-color-menu';
        document.body.appendChild(inlineColorMenu);
        let inlineColorTarget = null;
        let inlineColorRange = null;
        let inlineColorType = null;

        const hideInlineColorMenu = () => {
            inlineColorMenu.style.display = 'none';
            inlineColorMenu.innerHTML = '';
        };
        const hideInlineColorControls = () => {
            hideInlineColorMenu();
            inlineColorTarget = null;
            inlineColorRange = null;
            inlineColorType = null;
        };
        hideInlineColorControlsFn = hideInlineColorControls;

        const getInlineRange = () => {
            if (inlineColorRange) {
                return inlineColorRange.cloneRange();
            }
            if (inlineColorTarget) {
                const range = document.createRange();
                range.selectNodeContents(inlineColorTarget);
                return range;
            }
            return null;
        };

        const restoreInlineSelection = () => {
            const range = getInlineRange();
            if (!range) return;
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        };

        const isMeaningfulColor = (value) => {
            if (!value) return false;
            const normalized = String(value).trim().toLowerCase();
            if (!normalized) return false;
            const condensed = normalized.replace(/\s+/g, '');
            if (!condensed || condensed.startsWith('var(')) return false;
            return ![
                'transparent',
                'rgba(0,0,0,0)',
                'rgb(0,0,0,0)',
                '#00000000',
                'inherit',
                'initial',
                'unset',
                'currentcolor'
            ].includes(condensed);
        };

        const detectInlineColorContext = (node) => {
            if (!node) return null;
            let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
            while (current && current !== notesEditor) {
                if (current.nodeType === Node.ELEMENT_NODE) {
                    const attrColor = typeof current.getAttribute === 'function' ? current.getAttribute('color') : null;
                    const inlineColor = current.style?.color;
                    if (isMeaningfulColor(inlineColor) || isMeaningfulColor(attrColor)) {
                        return { target: current, type: 'fore' };
                    }

                    const computed = window.getComputedStyle(current);
                    const datasetLine = current.dataset?.lineHighlight === 'true' &&
                        isMeaningfulColor(current.dataset.lineHighlightColor) &&
                        isMeaningfulColor(computed.backgroundColor);
                    if (datasetLine) {
                        return { target: current, type: 'line' };
                    }

                    const inlineBackground = current.style?.backgroundColor;
                    if (isMeaningfulColor(inlineBackground)) {
                        const isInline = computed.display.includes('inline');
                        return { target: current, type: isInline ? 'highlight' : 'line' };
                    }

                    if (current.tagName === 'MARK') {
                        const markBg = computed.backgroundColor;
                        if (isMeaningfulColor(markBg)) {
                            return { target: current, type: 'highlight' };
                        }
                    }
                }
                current = current.parentElement;
            }
            return null;
        };

        const positionInlineColorMenu = () => {
            if (!inlineColorTarget) return;
            requestAnimationFrame(() => {
                const rect = inlineColorTarget.getBoundingClientRect();
                const menuRect = inlineColorMenu.getBoundingClientRect();
                let top = window.scrollY + rect.bottom + 6;
                if (top + menuRect.height > window.scrollY + window.innerHeight - 8) {
                    top = window.scrollY + rect.top - menuRect.height - 6;
                }
                let left = window.scrollX + rect.left + (rect.width / 2) - (menuRect.width / 2);
                const minLeft = window.scrollX + 4;
                const maxLeft = window.scrollX + window.innerWidth - menuRect.width - 8;
                if (left < minLeft) left = minLeft;
                if (left > maxLeft) left = maxLeft;
                inlineColorMenu.style.top = `${Math.max(window.scrollY + 4, top)}px`;
                inlineColorMenu.style.left = `${left}px`;
            });
        };

        const showInlineColorMenu = () => {
            if (!inlineColorTarget || !inlineColorType) return;
            inlineColorMenu.innerHTML = '';
            const range = getInlineRange();
            savedEditorSelection = range ? range.cloneRange() : null;
            let paletteGroup;
            if (inlineColorType === 'fore') {
                paletteGroup = createColorPalette('Color de Texto', actionWithInlineSelection(applyForeColor), textColors, extraTextColors, typeIcon);
            } else if (inlineColorType === 'highlight') {
                paletteGroup = createColorPalette('Color de Resaltado', actionWithInlineSelection(applyHiliteColor), highlightColors, extraHighlightColors, highlighterIcon);
            } else {
                paletteGroup = createColorPalette('Color de fondo de línea', actionWithInlineSelection(applyLineHighlight), ['#FFFFFF'], extraHighlightColors.concat(highlightColors), highlighterIcon);
            }
            inlineColorMenu.appendChild(paletteGroup);
            document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
                if (!inlineColorMenu.contains(d)) d.classList.remove('visible');
            });
            inlineColorMenu.style.display = 'flex';
            positionInlineColorMenu();
        };

        const actionWithInlineSelection = (fn) => (value) => {
            const clearEmptyStyle = (el) => {
                if (!el || !el.getAttribute) return;
                const styleAttr = el.getAttribute('style');
                if (!styleAttr || styleAttr.trim() === '') {
                    el.removeAttribute('style');
                }
            };
            let handledDirectly = false;
            let selectionAnchor = inlineColorTarget;

            if (inlineColorTarget) {
                if (inlineColorType === 'fore') {
                    handledDirectly = true;
                    if (!value || value === 'transparent') {
                        inlineColorTarget.style.removeProperty('color');
                        if (inlineColorTarget.hasAttribute('color')) inlineColorTarget.removeAttribute('color');
                    } else {
                        inlineColorTarget.style.setProperty('color', value);
                    }
                    clearEmptyStyle(inlineColorTarget);
                } else if (inlineColorType === 'highlight') {
                    handledDirectly = true;
                    if (!value || value === 'transparent') {
                        inlineColorTarget.style.removeProperty('background-color');
                        if (inlineColorTarget.tagName === 'MARK') {
                            const parent = inlineColorTarget.parentElement;
                            while (inlineColorTarget.firstChild) {
                                parent?.insertBefore(inlineColorTarget.firstChild, inlineColorTarget);
                            }
                            inlineColorTarget.remove();
                            selectionAnchor = parent || notesEditor;
                        } else {
                            clearEmptyStyle(inlineColorTarget);
                        }
                    } else {
                        inlineColorTarget.style.setProperty('background-color', value);
                    }
                } else if (inlineColorType === 'line') {
                    handledDirectly = true;
                    restoreInlineSelection();
                    fn(value);
                }
            }

            if (!handledDirectly) {
                restoreInlineSelection();
                fn(value);
            }

            recordHistory();

            const selection = window.getSelection();
            if (selection && selection.rangeCount) {
                inlineColorRange = selection.getRangeAt(0).cloneRange();
            } else if (selectionAnchor && notesEditor.contains(selectionAnchor)) {
                const newRange = document.createRange();
                try {
                    newRange.selectNodeContents(selectionAnchor);
                    selection?.removeAllRanges();
                    selection?.addRange(newRange);
                    inlineColorRange = newRange.cloneRange();
                } catch (error) {
                    inlineColorRange = null;
                }
            } else {
                inlineColorRange = null;
            }

            const anchorNode = selection && selection.anchorNode ? selection.anchorNode : (selectionAnchor || inlineColorTarget);
            const updated = detectInlineColorContext(anchorNode);
            if (updated) {
                inlineColorTarget = updated.target;
                inlineColorType = updated.type;
                showInlineColorMenu();
            } else {
                hideInlineColorControls();
            }
            notesEditor.focus({ preventScroll: true });
        };

        inlineColorMenu.addEventListener('mousedown', (e) => e.preventDefault());
        inlineColorMenu.addEventListener('click', (e) => e.stopPropagation());

        const handleInlineColorClick = (e) => {
            if (!notesEditor.isContentEditable) {
                hideInlineColorControls();
                return;
            }
            const context = detectInlineColorContext(e.target);
            if (context) {
                inlineColorTarget = context.target;
                inlineColorType = context.type;
                const selection = window.getSelection();
                inlineColorRange = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
                showInlineColorMenu();
                e.stopPropagation();
            } else {
                hideInlineColorControls();
            }
        };
        const selectionInsideEditor = (node) => {
            if (!node) return false;
            if (node === notesEditor) return true;
            let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
            while (current) {
                if (current === notesEditor) return true;
                current = current.parentElement;
            }
            return false;
        };

        const handleSelectionChange = () => {
            if (!notesEditor.isContentEditable) {
                hideInlineColorControls();
                return;
            }
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
                hideInlineColorControls();
                return;
            }
            const range = selection.getRangeAt(0);
            if (!selectionInsideEditor(selection.anchorNode) &&
                !selectionInsideEditor(selection.focusNode) &&
                !selectionInsideEditor(range.commonAncestorContainer)) {
                hideInlineColorControls();
                return;
            }

            let context = null;
            if (selection.isCollapsed) {
                context = detectInlineColorContext(selection.focusNode || selection.anchorNode);
            } else {
                const startContext = detectInlineColorContext(range.startContainer);
                const endContext = detectInlineColorContext(range.endContainer);
                if (startContext && endContext && startContext.target === endContext.target && startContext.type === endContext.type) {
                    context = startContext;
                } else if (startContext && !endContext) {
                    context = startContext;
                } else if (!startContext && endContext) {
                    context = endContext;
                } else {
                    context = detectInlineColorContext(range.commonAncestorContainer);
                }
            }

            if (context) {
                if (inlineColorMenu.style.display === 'flex' && inlineColorTarget === context.target) {
                    inlineColorRange = range.cloneRange();
                    inlineColorType = context.type;
                    positionInlineColorMenu();
                } else {
                    hideInlineColorControls();
                }
            } else if (inlineColorMenu.style.display === 'flex') {
                hideInlineColorControls();
            }
        };

        notesEditor.addEventListener('click', handleInlineColorClick);
        document.addEventListener('selectionchange', handleSelectionChange);
        notesEditor.addEventListener('input', hideInlineColorControls);

        document.addEventListener('click', (event) => {
            if (inlineColorMenu.contains(event.target) || notesEditor.contains(event.target)) {
                return;
            }
            hideInlineColorControls();
        });
        window.addEventListener('scroll', hideInlineColorControls, true);
        notesModalContent?.addEventListener('scroll', hideInlineColorControls);
        notesEditor.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                hideInlineColorControls();
            }
        });

        // Popup to change existing preset styles
        const stylePopup = document.createElement('div');
        stylePopup.className = 'styled-style-popup';
        document.body.appendChild(stylePopup);
        let currentStyledSpan = null;

        const renderStyledPopup = () => {
            stylePopup.innerHTML = '';
            const header = document.createElement('div');
            header.className = 'styled-style-popup-header';
            const title = document.createElement('span');
            title.textContent = 'Cambiar estilo';
            header.appendChild(title);
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'styled-style-popup-close';
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', hideStylePopup);
            header.appendChild(closeBtn);
            stylePopup.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'styled-style-popup-grid';

            PRESET_STYLE_GROUPS.forEach(group => {
                const card = document.createElement('div');
                card.className = 'styled-style-card';

                const mainBtn = document.createElement('button');
                mainBtn.type = 'button';
                mainBtn.className = 'styled-style-main';
                const mainPreview = document.createElement('span');
                mainPreview.className = 'styled-style-preview';
                mainPreview.setAttribute('style', group.style);
                mainPreview.textContent = formatPresetLabel(group.label);
                mainBtn.appendChild(mainPreview);
                mainBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    if (!currentStyledSpan) return;
                    applyPresetStyle(group.style, currentStyledSpan);
                    hideStylePopup();
                    notesEditor.focus({ preventScroll: true });
                });
                card.appendChild(mainBtn);

                if (group.variants && group.variants.length) {
                    const variantsRow = document.createElement('div');
                    variantsRow.className = 'styled-style-variants';
                    group.variants.forEach(variant => {
                        const variantBtn = document.createElement('button');
                        variantBtn.type = 'button';
                        variantBtn.className = 'styled-style-variant-btn';
                        const variantPreview = document.createElement('span');
                        variantPreview.className = 'styled-style-preview';
                        variantPreview.setAttribute('style', variant.style);
                        variantPreview.textContent = formatPresetLabel(variant.label);
                        variantBtn.appendChild(variantPreview);
                        const variantName = document.createElement('span');
                        variantName.className = 'styled-style-variant-label';
                        const labelText = variant.label.replace(`${group.label} `, '').trim();
                        variantName.textContent = labelText || 'Variante';
                        variantBtn.appendChild(variantName);
                        variantBtn.addEventListener('click', (event) => {
                            event.preventDefault();
                            if (!currentStyledSpan) return;
                            applyPresetStyle(variant.style, currentStyledSpan);
                            hideStylePopup();
                            notesEditor.focus({ preventScroll: true });
                        });
                        variantsRow.appendChild(variantBtn);
                    });
                    card.appendChild(variantsRow);
                }

                grid.appendChild(card);
            });

            stylePopup.appendChild(grid);
        };

        const hideStylePopup = () => {
            stylePopup.classList.remove('visible');
            currentStyledSpan = null;
        };

        const showStylePopup = (span) => {
            currentStyledSpan = span;
            renderStyledPopup();
            stylePopup.classList.add('visible');
            requestAnimationFrame(() => {
                if (!currentStyledSpan) return;
                const editorRect = notesEditor.getBoundingClientRect();
                const desiredWidth = Math.min(560, Math.max(320, editorRect.width - 16));
                stylePopup.style.maxWidth = `${desiredWidth}px`;
                const spanRect = span.getBoundingClientRect();
                const popupRect = stylePopup.getBoundingClientRect();
                let top = spanRect.bottom + window.scrollY + 8;
                if (top + popupRect.height > window.scrollY + window.innerHeight - 8) {
                    top = spanRect.top + window.scrollY - popupRect.height - 8;
                }
                let left = spanRect.left + window.scrollX;
                if (left + popupRect.width > window.scrollX + window.innerWidth - 8) {
                    left = Math.max(window.scrollX + 8, window.scrollX + window.innerWidth - popupRect.width - 8);
                }
                stylePopup.style.top = `${Math.max(window.scrollY + 8, top)}px`;
                stylePopup.style.left = `${Math.max(window.scrollX + 8, left)}px`;
            });
        };

        hideStylePopup();

        notesEditor.addEventListener('dblclick', (event) => {
            const span = event.target.closest('span[data-preset-style]');
            if (!span) return;
            event.preventDefault();
            event.stopPropagation();
            showStylePopup(span);
        });

        notesEditor.addEventListener('click', (event) => {
            if (!event.target.closest('span[data-preset-style]')) {
                hideStylePopup();
            }
        });

        document.addEventListener('click', (event) => {
            if (!stylePopup.contains(event.target)) hideStylePopup();
        });

        // --- Pills text styles ---
        const PILL_TEXT_STYLES = [
            ['#fffde7', '#fff176', '#795548'],
            ['#ffe0b2', '#ff9800', '#4e342e'],
            ['#bbdefb', '#2196f3', '#0d47a1'],
            ['#e1f5fe', '#4fc3f7', '#01579b'],
            ['#c8e6c9', '#388e3c', '#1b5e20'],
            ['#dcedc8', '#8bc34a', '#33691e'],
            ['#e1bee7', '#9c27b0', '#4a148c'],
            ['#d7ccc8', '#795548', '#3e2723'],
            ['#f5f5f5', '#9e9e9e', '#212121'],
            ['#ffcdd2', '#f44336', '#b71c1c']
        ];

        const pillTextPopup = document.createElement('div');
        pillTextPopup.className = 'preset-style-popup';
        document.body.appendChild(pillTextPopup);
        let currentPillSpan = null;

        const hidePillTextPopup = () => {
            pillTextPopup.style.display = 'none';
            currentPillSpan = null;
        };

        const applyPillTextStyle = (colors, existingSpan = null) => {
            const css = `background:linear-gradient(to right, ${colors[0]}, ${colors[1]}); color:${colors[2]}; padding:2px 8px; border-radius:20px; font-weight:bold;`;
            if (existingSpan) {
                existingSpan.style.cssText = css;
                existingSpan.dataset.pillText = colors.join('|');
                return;
            }
            if (savedEditorSelection) {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(savedEditorSelection);
            }
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed) return;
            const range = sel.getRangeAt(0);
            const span = document.createElement('span');
            span.style.cssText = css;
            span.dataset.pillText = colors.join('|');
            span.textContent = range.toString();
            range.deleteContents();
            range.insertNode(span);
            const newRange = document.createRange();
            newRange.setStartAfter(span);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            savedEditorSelection = null;
        };

        const showPillTextPopup = (span = null, anchor = null) => {
            const sample = span ? span.textContent : (savedEditorSelection ? savedEditorSelection.toString() : window.getSelection().toString());
            pillTextPopup.innerHTML = '';
            PILL_TEXT_STYLES.forEach(colors => {
                const b = document.createElement('button');
                b.className = 'toolbar-btn';
                b.innerHTML = `<span style=\"background:linear-gradient(to right, ${colors[0]}, ${colors[1]}); color:${colors[2]}; padding:2px 8px; border-radius:20px; font-weight:bold;\">${sample}</span>`;
                b.addEventListener('click', () => {
                    applyPillTextStyle(colors, currentPillSpan);
                    hidePillTextPopup();
                    notesEditor.focus({ preventScroll: true });
                });
                pillTextPopup.appendChild(b);
            });
            pillTextPopup.style.display = 'block';
            let rect;
            if (span) {
                rect = span.getBoundingClientRect();
            } else if (savedEditorSelection) {
                rect = savedEditorSelection.getBoundingClientRect();
            } else if (anchor) {
                rect = anchor.getBoundingClientRect();
            } else {
                const sel = window.getSelection();
                if (sel && sel.rangeCount) rect = sel.getRangeAt(0).getBoundingClientRect();
            }
            if (rect) {
                pillTextPopup.style.top = `${window.scrollY + rect.top - pillTextPopup.offsetHeight - 8}px`;
                pillTextPopup.style.left = `${window.scrollX + rect.left}px`;
            }
        };

        const setPillsText = (span = null, anchor = null) => {
            currentPillSpan = span;
            showPillTextPopup(span, anchor);
        };

        const pillTextBtn = createButton('Texto Píldora', '💊', null, null, null);
        pillTextBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const selection = window.getSelection();
            if (selection.rangeCount > 0 && notesEditor.contains(selection.anchorNode)) {
                savedEditorSelection = selection.getRangeAt(0).cloneRange();
            } else {
                savedEditorSelection = null;
            }
        });
        pillTextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (savedEditorSelection && !savedEditorSelection.collapsed) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedEditorSelection);
                setPillsText(null, pillTextBtn);
            }
        });
        editorToolbar.appendChild(pillTextBtn);

        notesEditor.addEventListener('click', (e) => {
            const span = e.target.closest('span[data-pill-text]');
            if (span) {
                e.stopPropagation();
                savedEditorSelection = null;
                setPillsText(span);
            } else if (!e.target.closest('.preset-style-popup')) {
                hidePillTextPopup();
            }
        });
        document.addEventListener('click', (e) => {
            if (!pillTextPopup.contains(e.target)) hidePillTextPopup();
        });
        notesEditor.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                hidePillTextPopup();
            }
        });

        // Floating menu for table tools
        const tableMenu = document.createElement('div');
        tableMenu.className = 'table-menu-popup';
        document.body.appendChild(tableMenu);
        let currentTable = null;
        let editingTable = null;
        let tableEditMode = false;
        const hideTableMenu = () => {
            tableMenu.style.display = 'none';
            currentTable = null;
        };
        const cloneCellTemplate = (templateCell) => {
            const tagName = templateCell && templateCell.tagName === 'TH' ? 'th' : 'td';
            const cell = document.createElement(tagName);
            if (templateCell) {
                cell.className = templateCell.className;
                Array.from(templateCell.attributes).forEach(attr => {
                    if (!['id', 'style', 'rowspan', 'colspan', 'contenteditable'].includes(attr.name)) {
                        cell.setAttribute(attr.name, attr.value);
                    }
                });
                if (templateCell.style && templateCell.style.cssText) {
                    cell.style.cssText = templateCell.style.cssText;
                }
                Object.entries(templateCell.dataset || {}).forEach(([key, value]) => {
                    cell.dataset[key] = value;
                });
            }
            cell.removeAttribute('rowspan');
            cell.removeAttribute('colspan');
            cell.contentEditable = true;
            cell.innerHTML = '&nbsp;';
            return cell;
        };

        const addRow = (table, index) => {
            const existingRows = Array.from(table.rows);
            const templateRow = existingRows.length ? existingRows[Math.min(index, existingRows.length - 1)] : null;
            const row = table.insertRow(index);
            if (templateRow && templateRow.cells.length) {
                Array.from(templateRow.cells).forEach(templateCell => {
                    const newCell = cloneCellTemplate(templateCell);
                    row.appendChild(newCell);
                });
            } else {
                const cell = document.createElement('td');
                cell.innerHTML = '&nbsp;';
                cell.contentEditable = true;
                row.appendChild(cell);
            }
            ensureSpacingState(table);
            const lineHeight = parseFloat(table.dataset.cellLineHeight || '1.4');
            const padding = parseFloat(table.dataset.cellPadding || '6');
            applyTableSpacing(table, lineHeight, padding);
            initTableResize(table);
        };
        const deleteRow = (table, index) => { if (table.rows.length > 1) table.deleteRow(index); };
        const addColumn = (table, index) => {
            Array.from(table.rows).forEach(row => {
                const cells = Array.from(row.cells);
                const referenceIndex = Math.min(index, Math.max(cells.length - 1, 0));
                const templateCell = cells[referenceIndex] || null;
                const newCell = cloneCellTemplate(templateCell);
                if (index >= row.cells.length) {
                    row.appendChild(newCell);
                } else {
                    row.insertBefore(newCell, row.cells[index]);
                }
            });
            ensureSpacingState(table);
            const lineHeight = parseFloat(table.dataset.cellLineHeight || '1.4');
            const padding = parseFloat(table.dataset.cellPadding || '6');
            applyTableSpacing(table, lineHeight, padding);
            initTableResize(table);
        };
        const deleteColumn = (table, index) => { Array.from(table.rows).forEach(r => { if (r.cells.length > 1) r.deleteCell(index); }); };
        const selectColumn = (table, index) => {
            if (!table || index < 0) return;
            const rows = Array.from(table.rows);
            if (!rows.length) return;
            const cells = rows.map(row => row.cells[index]).filter(Boolean);
            if (!cells.length) return;
            const range = document.createRange();
            range.setStartBefore(cells[0]);
            range.setEndAfter(cells[cells.length - 1]);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        };
        const clearTableInlineStyles = (table) => {
            if (!table) return;
            Array.from(table.querySelectorAll('th, td')).forEach(cell => {
                cell.style.backgroundColor = '';
                cell.style.color = '';
                cell.style.borderColor = '';
                cell.style.borderTopColor = '';
                cell.style.borderBottomColor = '';
                cell.style.borderRadius = '';
                cell.style.borderWidth = '';
                cell.style.borderLeftWidth = '';
                cell.style.borderRightWidth = '';
                cell.style.borderTopWidth = '';
                cell.style.borderBottomWidth = '';
                cell.style.borderStyle = '';
            });
            table.style.borderColor = '';
            table.style.borderWidth = '';
            table.style.borderStyle = '';
            delete table.dataset.dividerColor;
            delete table.dataset.dividerWidth;
            delete table.dataset.hideVerticalBorders;
            delete table.dataset.hideHorizontalBorders;
        };
        const convertCellTag = (cell, tagName) => {
            if (!cell || cell.tagName === tagName.toUpperCase()) return cell;
            const newCell = document.createElement(tagName);
            Array.from(cell.attributes).forEach(attr => {
                if (attr.name !== 'id') {
                    newCell.setAttribute(attr.name, attr.value);
                }
            });
            newCell.innerHTML = cell.innerHTML;
            newCell.contentEditable = cell.contentEditable;
            cell.parentNode.replaceChild(newCell, cell);
            return newCell;
        };
        const applyTableTheme = (table, themeClass) => {
            if (!table) return;
            TABLE_THEMES.forEach(tt => table.classList.remove(tt.class));
            clearTableInlineStyles(table);
            const rows = Array.from(table.rows);
            if (rows.length) {
                Array.from(rows[0].cells).forEach(cell => convertCellTag(cell, 'th'));
                rows.slice(1).forEach(row => {
                    Array.from(row.cells).forEach(cell => convertCellTag(cell, 'td'));
                });
            }
            if (themeClass) {
                table.classList.add(themeClass);
            }
            initTableResize(table);
            ensureDividerState(table);
        };
        const applyTableMargins = (table, top, bottom) => {
            if (!table) return;
            const topValue = Number.isFinite(top) ? top : parseFloat(table.dataset.tableMarginTop || '12');
            const bottomValue = Number.isFinite(bottom) ? bottom : parseFloat(table.dataset.tableMarginBottom || '12');
            if (Number.isFinite(topValue)) {
                table.style.marginTop = `${topValue}px`;
                table.dataset.tableMarginTop = `${topValue}`;
            }
            if (Number.isFinite(bottomValue)) {
                table.style.marginBottom = `${bottomValue}px`;
                table.dataset.tableMarginBottom = `${bottomValue}`;
            }
        };

        const ensureSpacingState = (table) => {
            if (!table) return;
            const firstCell = table.querySelector('th, td');
            if (firstCell) {
                const computed = window.getComputedStyle(firstCell);
                if (!table.dataset.cellLineHeight) {
                    const fontSize = parseFloat(computed.fontSize) || 16;
                    const lineHeightPx = parseFloat(computed.lineHeight);
                    if (!Number.isNaN(lineHeightPx) && lineHeightPx > 0 && fontSize > 0) {
                        const ratio = Math.round((lineHeightPx / fontSize) * 100) / 100;
                        table.dataset.cellLineHeight = ratio.toFixed(2);
                    }
                }
                if (!table.dataset.cellPadding) {
                    const padTop = parseFloat(computed.paddingTop);
                    if (!Number.isNaN(padTop)) {
                        table.dataset.cellPadding = String(Math.round(padTop));
                    }
                }
            }
            if (!table.dataset.cellLineHeight) table.dataset.cellLineHeight = '1.4';
            if (!table.dataset.cellPadding) table.dataset.cellPadding = '6';
            const computedTableStyle = window.getComputedStyle(table);
            if (!table.dataset.tableMarginTop) {
                const marginTop = parseFloat(computedTableStyle.marginTop);
                if (!Number.isNaN(marginTop)) {
                    table.dataset.tableMarginTop = String(Math.round(marginTop));
                }
            }
            if (!table.dataset.tableMarginBottom) {
                const marginBottom = parseFloat(computedTableStyle.marginBottom);
                if (!Number.isNaN(marginBottom)) {
                    table.dataset.tableMarginBottom = String(Math.round(marginBottom));
                }
            }
            if (!table.dataset.tableMarginTop) table.dataset.tableMarginTop = '12';
            if (!table.dataset.tableMarginBottom) table.dataset.tableMarginBottom = '12';
            applyTableMargins(table, parseFloat(table.dataset.tableMarginTop), parseFloat(table.dataset.tableMarginBottom));
        };
        const applyDividerStyles = (table) => {
            if (!table) return;
            const color = (table.dataset.dividerColor || '').trim();
            const widthValue = parseFloat(table.dataset.dividerWidth || '1');
            const hideVertical = table.dataset.hideVerticalBorders === 'true';
            const hideHorizontal = table.dataset.hideHorizontalBorders === 'true';
            const hasWidth = Number.isFinite(widthValue) && widthValue >= 0;
            const pxWidth = hasWidth ? `${widthValue}px` : '';

            if (color) {
                table.style.setProperty('border-color', color);
                table.style.setProperty('border-style', 'solid');
            } else {
                table.style.removeProperty('border-color');
            }
            if (hasWidth) {
                table.style.setProperty('border-width', pxWidth);
                table.style.setProperty('border-style', 'solid');
            } else {
                table.style.removeProperty('border-width');
            }

            Array.from(table.querySelectorAll('th, td')).forEach(cell => {
                if (color) {
                    cell.style.setProperty('border-color', color);
                } else {
                    cell.style.removeProperty('border-color');
                }
                if (hasWidth) {
                    cell.style.setProperty('border-width', pxWidth);
                    cell.style.setProperty('border-style', 'solid');
                } else {
                    cell.style.removeProperty('border-width');
                    cell.style.removeProperty('border-style');
                }

                if (hideVertical) {
                    cell.style.setProperty('border-left-width', '0px');
                    cell.style.setProperty('border-right-width', '0px');
                } else if (hasWidth) {
                    cell.style.setProperty('border-left-width', pxWidth);
                    cell.style.setProperty('border-right-width', pxWidth);
                } else {
                    cell.style.removeProperty('border-left-width');
                    cell.style.removeProperty('border-right-width');
                }

                if (hideHorizontal) {
                    cell.style.setProperty('border-top-width', '0px');
                    cell.style.setProperty('border-bottom-width', '0px');
                } else if (hasWidth) {
                    cell.style.setProperty('border-top-width', pxWidth);
                    cell.style.setProperty('border-bottom-width', pxWidth);
                } else {
                    cell.style.removeProperty('border-top-width');
                    cell.style.removeProperty('border-bottom-width');
                }
            });
        };
        const ensureDividerState = (table) => {
            if (!table) return;
            const firstCell = table.querySelector('th, td');
            const tableComputed = window.getComputedStyle(table);
            const cellComputed = firstCell ? window.getComputedStyle(firstCell) : null;
            const isTransparent = (value) => {
                if (!value) return true;
                const normalized = value.trim().toLowerCase();
                return normalized === 'transparent' || normalized === 'rgba(0, 0, 0, 0)' || normalized === 'rgba(0,0,0,0)';
            };

            if (!table.dataset.dividerColor) {
                if (cellComputed && !isTransparent(cellComputed.borderColor)) {
                    table.dataset.dividerColor = cellComputed.borderColor;
                } else if (!isTransparent(tableComputed.borderColor)) {
                    table.dataset.dividerColor = tableComputed.borderColor;
                } else {
                    table.dataset.dividerColor = '#d1d5db';
                }
            }

            if (!table.dataset.dividerWidth) {
                let width = 1;
                if (cellComputed) {
                    const cellWidth = parseFloat(cellComputed.borderTopWidth || cellComputed.borderWidth);
                    if (Number.isFinite(cellWidth) && cellWidth >= 0) width = cellWidth;
                } else {
                    const tableWidth = parseFloat(tableComputed.borderTopWidth || tableComputed.borderWidth);
                    if (Number.isFinite(tableWidth) && tableWidth >= 0) width = tableWidth;
                }
                table.dataset.dividerWidth = String(width);
            }

            if (!table.dataset.hideVerticalBorders) table.dataset.hideVerticalBorders = 'false';
            if (!table.dataset.hideHorizontalBorders) table.dataset.hideHorizontalBorders = 'false';
            applyDividerStyles(table);
        };
        const applyTableSpacing = (table, lineHeight, padding) => {
            if (!table) return;
            const lh = parseFloat(lineHeight);
            const pad = parseFloat(padding);
            Array.from(table.querySelectorAll('th, td')).forEach(cell => {
                cell.style.lineHeight = isNaN(lh) ? '' : `${lh}`;
                cell.style.paddingTop = isNaN(pad) ? '' : `${pad}px`;
                cell.style.paddingBottom = isNaN(pad) ? '' : `${pad}px`;
            });
            if (!isNaN(lh)) table.dataset.cellLineHeight = `${lh}`;
            if (!isNaN(pad)) table.dataset.cellPadding = `${pad}`;
        };
        const TABLE_THEMES = [
            { label: 'Clásico azul', class: 'table-theme-blue', preview: { headerBg: '#bbdefb', headerColor: '#0d47a1', row1: '#ffffff', row2: '#e3f2fd', border: '#2196f3' } },
            { label: 'Selva vibrante', class: 'table-theme-green', preview: { headerBg: '#c8e6c9', headerColor: '#1b5e20', row1: '#ffffff', row2: '#eaf5eb', border: '#4caf50' } },
            { label: 'Profesional gris', class: 'table-theme-slate', preview: { headerBg: '#cfd8dc', headerColor: '#29434e', row1: '#ffffff', row2: '#f5f7f8', border: '#607d8b' } },
            { label: 'Coral suave', class: 'table-theme-rose', preview: { headerBg: '#ffc1e3', headerColor: '#ad1457', row1: '#fff6fb', row2: '#ffe0ef', border: '#f06292' } },
            { label: 'Amanecer cálido', class: 'table-theme-sunrise', preview: { headerBg: '#ffe0b2', headerColor: '#e65100', row1: '#fffaf5', row2: '#ffe8d9', border: '#ff7043' } },
            { label: 'Lavanda', class: 'table-theme-purple', preview: { headerBg: '#e1bee7', headerColor: '#4a148c', row1: '#ffffff', row2: '#f5e9f7', border: '#9c27b0' } },
            { label: 'Turquesa brillante', class: 'table-theme-teal', preview: { headerBg: '#e0f2f1', headerColor: '#004d40', row1: '#ffffff', row2: '#e8fffb', border: '#009688' } },
            { label: 'Zafiro', class: 'table-theme-indigo', preview: { headerBg: '#c5cae9', headerColor: '#1a237e', row1: '#ffffff', row2: '#e8eaf6', border: '#3949ab' } },
            { label: 'Arena dorada', class: 'table-theme-amber', preview: { headerBg: '#ffecb3', headerColor: '#ff6f00', row1: '#fffdf5', row2: '#fff5d7', border: '#ffb300' } },
            { label: 'Esmeralda', class: 'table-theme-emerald', preview: { headerBg: '#b9f6ca', headerColor: '#1b5e20', row1: '#ffffff', row2: '#e6ffef', border: '#2e7d32' } },
            { label: 'Clásico rojo', class: 'table-theme-red', preview: { headerBg: '#ffcdd2', headerColor: '#b71c1c', row1: '#ffffff', row2: '#ffe7ea', border: '#f44336' } },
            { label: 'Minimalista gris', class: 'table-theme-gray', preview: { headerBg: '#e0e0e0', headerColor: '#212121', row1: '#ffffff', row2: '#f7f7f7', border: '#9e9e9e' } },
            { label: 'Blanco y negro', class: 'table-theme-monochrome', preview: { headerBg: '#111827', headerColor: '#f9fafb', row1: '#ffffff', row2: '#f3f4f6', border: '#111827' } }
        ];
        const showTableMenu = (table, cell) => {
            currentTable = table;
            tableMenu.innerHTML = '';

            const resizeBtn = document.createElement('button');
            resizeBtn.className = 'toolbar-btn';
            resizeBtn.innerHTML = '↔️ Ajustar tamaño';
            resizeBtn.addEventListener('click', () => {
                tableEditMode = true;
                editingTable = table;
                table.classList.add('selected');
                hideTableMenu();
            });
            tableMenu.appendChild(resizeBtn);

            const tabsBar = document.createElement('div');
            tabsBar.className = 'table-menu-tabs';
            const tabContent = document.createElement('div');
            tabContent.className = 'tab-content';
            tableMenu.appendChild(tabsBar);
            tableMenu.appendChild(tabContent);

            const rIndex = cell ? cell.parentElement.rowIndex : 0;
            const cIndex = cell ? cell.cellIndex : 0;

            const buildEditTab = () => {
                tabContent.innerHTML = '';
                const layout = document.createElement('div');
                layout.className = 'table-edit-layout';
                const createGroup = (title) => {
                    const group = document.createElement('div');
                    group.className = 'table-edit-group';
                    const heading = document.createElement('div');
                    heading.className = 'table-edit-group-title';
                    heading.textContent = title;
                    group.appendChild(heading);
                    return group;
                };
                const createActionButton = (label, icon, handler) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'toolbar-btn table-edit-btn';
                    btn.innerHTML = `<span class="table-edit-icon">${icon}</span><span>${label}</span>`;
                    btn.addEventListener('click', () => {
                        handler();
                        hideTableMenu();
                        notesEditor.focus({ preventScroll: true });
                    });
                    return btn;
                };
                const rowsGroup = createGroup('Filas');
                rowsGroup.appendChild(createActionButton('Agregar arriba', '⬆️', () => addRow(table, rIndex)));
                rowsGroup.appendChild(createActionButton('Agregar abajo', '⬇️', () => addRow(table, rIndex + 1)));
                rowsGroup.appendChild(createActionButton('Eliminar fila', '🗑️', () => deleteRow(table, rIndex)));
                const colsGroup = createGroup('Columnas');
                colsGroup.appendChild(createActionButton('Añadir a la izquierda', '⬅️', () => addColumn(table, cIndex)));
                colsGroup.appendChild(createActionButton('Añadir a la derecha', '➡️', () => addColumn(table, cIndex + 1)));
                colsGroup.appendChild(createActionButton('Eliminar columna', '🗑️', () => deleteColumn(table, cIndex)));
                colsGroup.appendChild(createActionButton('Seleccionar columna', '🔎', () => selectColumn(table, cIndex)));
                layout.appendChild(rowsGroup);
                layout.appendChild(colsGroup);
                tabContent.appendChild(layout);
            };

            const HEADER_COLORS = [
                { label: 'Cabecera azul suave', bg: '#bbdefb', color: '#0d47a1', accent: '#2196f3' },
                { label: 'Cabecera índigo', bg: '#c5cae9', color: '#1a237e', accent: '#3949ab' },
                { label: 'Cabecera verde lima', bg: '#dcedc8', color: '#33691e', accent: '#8bc34a' },
                { label: 'Cabecera esmeralda', bg: '#b2f2bb', color: '#1b5e20', accent: '#2e7d32' },
                { label: 'Cabecera ámbar', bg: '#ffecb3', color: '#ff6f00', accent: '#ffb300' },
                { label: 'Cabecera coral', bg: '#ffccbc', color: '#bf360c', accent: '#ff7043' },
                { label: 'Cabecera lavanda', bg: '#e1bee7', color: '#4a148c', accent: '#ab47bc' },
                { label: 'Cabecera gris azulado', bg: '#cfd8dc', color: '#37474f', accent: '#90a4ae' },
                { label: 'Cabecera negro clásico', bg: '#111827', color: '#f9fafb', accent: '#000000' },
                { label: 'Cabecera gris perla', bg: '#f3f4f6', color: '#1f2937', accent: '#9ca3af' },
                { label: 'Cabecera azul profundo', bg: '#bfdbfe', color: '#1e3a8a', accent: '#2563eb' },
                { label: 'Cabecera verde bosque', bg: '#c7f9cc', color: '#065f46', accent: '#047857' },
                { label: 'Cabecera naranja intensa', bg: '#ffedd5', color: '#9a3412', accent: '#f97316' },
                { label: 'Cabecera ciruela', bg: '#f3e8ff', color: '#581c87', accent: '#7c3aed' }
            ];

            const buildStyleTab = () => {
                tabContent.innerHTML = '';
                ensureSpacingState(table);
                ensureDividerState(table);
                const layout = document.createElement('div');
                layout.className = 'table-style-layout';
                const themesColumn = document.createElement('div');
                themesColumn.className = 'table-style-column';
                const spacingColumn = document.createElement('div');
                spacingColumn.className = 'table-style-column table-spacing-column';

                const themeSection = document.createElement('div');
                themeSection.className = 'table-style-section';
                const themeTitle = document.createElement('div');
                themeTitle.className = 'table-style-section-title';
                themeTitle.textContent = 'Temas completos';
                themeSection.appendChild(themeTitle);
                const themeGrid = document.createElement('div');
                themeGrid.className = 'table-theme-grid';
                TABLE_THEMES.forEach(theme => {
                    const option = document.createElement('button');
                    option.type = 'button';
                    option.className = 'table-theme-option';
                    option.innerHTML = `
                        <div class="table-theme-preview">
                            <div class="header-row"><span>Aa</span><span>Bb</span><span>Cc</span></div>
                            <div class="body-row"><div class="cell"></div><div class="cell"></div><div class="cell"></div></div>
                            <div class="body-row"><div class="cell"></div><div class="cell"></div><div class="cell"></div></div>
                        </div>
                        <span class="table-theme-option-label">${theme.label}</span>
                    `;
                    option.style.setProperty('--table-preview-border', theme.preview.border);
                    option.style.setProperty('--table-preview-header-bg', theme.preview.headerBg);
                    option.style.setProperty('--table-preview-header-color', theme.preview.headerColor);
                    option.style.setProperty('--table-preview-row1-bg', theme.preview.row1);
                    option.style.setProperty('--table-preview-row2-bg', theme.preview.row2);
                    option.addEventListener('click', () => {
                        applyTableTheme(table, theme.class);
                        hideTableMenu();
                        notesEditor.focus({ preventScroll: true });
                    });
                    themeGrid.appendChild(option);
                });
                themeSection.appendChild(themeGrid);
                themesColumn.appendChild(themeSection);

                const headerSection = document.createElement('div');
                headerSection.className = 'table-style-section';
                const headerTitle = document.createElement('div');
                headerTitle.className = 'table-style-section-title';
                headerTitle.textContent = 'Cabeceras rápidas';
                headerSection.appendChild(headerTitle);
                const headerList = document.createElement('div');
                headerList.className = 'table-header-list';
                HEADER_COLORS.forEach(preset => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'table-header-option';
                    btn.innerHTML = `<span class="table-header-preview">Aa</span><span class="table-header-option-label">${preset.label}</span>`;
                    btn.style.setProperty('--table-header-bg', preset.bg);
                    btn.style.setProperty('--table-header-color', preset.color);
                    btn.style.setProperty('--table-header-border', preset.accent || preset.color);
                    btn.addEventListener('click', () => {
                        const row = table.rows[0];
                        if (row) {
                            Array.from(row.cells).forEach(c => {
                                c.style.backgroundColor = preset.bg;
                                c.style.color = preset.color;
                                if (preset.accent) {
                                    c.style.borderBottomColor = preset.accent;
                                    c.style.borderTopColor = preset.accent;
                                }
                            });
                        }
                        hideTableMenu();
                        notesEditor.focus({ preventScroll: true });
                    });
                    headerList.appendChild(btn);
                });
                headerSection.appendChild(headerList);
                themesColumn.appendChild(headerSection);

                const spacingSection = document.createElement('div');
                spacingSection.className = 'table-style-section';
                const spacingTitle = document.createElement('div');
                spacingTitle.className = 'table-style-section-title';
                spacingTitle.textContent = 'Espaciado y altura';
                spacingSection.appendChild(spacingTitle);

                let currentLineHeight = parseFloat(table.dataset.cellLineHeight || '1.4');
                let currentPadding = parseFloat(table.dataset.cellPadding || '6');
                let currentMarginTop = parseFloat(table.dataset.tableMarginTop || '12');
                let currentMarginBottom = parseFloat(table.dataset.tableMarginBottom || '12');
                const defaultMarginTop = currentMarginTop;
                const defaultMarginBottom = currentMarginBottom;
                const updateSpacing = (lineHeight, padding) => {
                    currentLineHeight = parseFloat(lineHeight);
                    currentPadding = parseFloat(padding);
                    applyTableSpacing(table, currentLineHeight, currentPadding);
                };
                const updateMargins = (marginTop, marginBottom) => {
                    currentMarginTop = parseFloat(marginTop);
                    currentMarginBottom = parseFloat(marginBottom);
                    applyTableMargins(table, currentMarginTop, currentMarginBottom);
                };

                const createSlider = (label, min, max, step, value, formatter, onInput) => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'table-spacing-control';
                    const header = document.createElement('div');
                    header.className = 'table-spacing-label';
                    const valueDisplay = document.createElement('span');
                    valueDisplay.className = 'table-spacing-value';
                    const labelSpan = document.createElement('span');
                    labelSpan.textContent = label;
                    valueDisplay.textContent = formatter(value);
                    header.appendChild(labelSpan);
                    header.appendChild(valueDisplay);
                    const input = document.createElement('input');
                    input.type = 'range';
                    input.min = String(min);
                    input.max = String(max);
                    input.step = String(step);
                    input.value = String(value);
                    input.addEventListener('input', () => {
                        valueDisplay.textContent = formatter(input.value);
                        onInput(parseFloat(input.value));
                    });
                    wrapper.appendChild(header);
                    wrapper.appendChild(input);
                    return { element: wrapper, input, valueDisplay };
                };

                const lineHeightSlider = createSlider('Interlineado', 1, 2.4, 0.05, currentLineHeight, (v) => `${parseFloat(v).toFixed(2)}`, (val) => {
                    updateSpacing(val, currentPadding);
                });
                const paddingSlider = createSlider('Padding vertical', 0, 16, 1, currentPadding, (v) => `${Math.round(parseFloat(v))} px`, (val) => {
                    updateSpacing(currentLineHeight, val);
                });
                spacingSection.appendChild(lineHeightSlider.element);
                spacingSection.appendChild(paddingSlider.element);
                const marginTopSlider = createSlider('Espacio superior', 0, 64, 1, currentMarginTop, (v) => `${Math.round(parseFloat(v))} px`, (val) => {
                    updateMargins(val, currentMarginBottom);
                });
                const marginBottomSlider = createSlider('Espacio inferior', 0, 64, 1, currentMarginBottom, (v) => `${Math.round(parseFloat(v))} px`, (val) => {
                    updateMargins(currentMarginTop, val);
                });
                spacingSection.appendChild(marginTopSlider.element);
                spacingSection.appendChild(marginBottomSlider.element);

                const presets = [
                    { label: 'Ultra compacto', lineHeight: 1.1, padding: 2 },
                    { label: 'Compacto', lineHeight: 1.3, padding: 4 },
                    { label: 'Equilibrado', lineHeight: 1.5, padding: 6 },
                    { label: 'Amplio', lineHeight: 1.8, padding: 10 }
                ];
                const presetsContainer = document.createElement('div');
                presetsContainer.className = 'table-spacing-presets';
                presets.forEach(preset => {
                    const presetBtn = document.createElement('button');
                    presetBtn.type = 'button';
                    presetBtn.className = 'toolbar-btn table-spacing-btn';
                    presetBtn.textContent = preset.label;
                    presetBtn.addEventListener('click', () => {
                        lineHeightSlider.input.value = String(preset.lineHeight);
                        paddingSlider.input.value = String(preset.padding);
                        lineHeightSlider.valueDisplay.textContent = `${preset.lineHeight.toFixed(2)}`;
                        paddingSlider.valueDisplay.textContent = `${preset.padding} px`;
                        updateSpacing(preset.lineHeight, preset.padding);
                    });
                    presetsContainer.appendChild(presetBtn);
                });
                const resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.className = 'toolbar-btn table-spacing-btn';
                resetBtn.textContent = 'Restablecer';
                resetBtn.addEventListener('click', () => {
                    lineHeightSlider.input.value = '1.4';
                    paddingSlider.input.value = '6';
                    lineHeightSlider.valueDisplay.textContent = '1.40';
                    paddingSlider.valueDisplay.textContent = '6 px';
                    updateSpacing(1.4, 6);
                    marginTopSlider.input.value = String(defaultMarginTop);
                    marginBottomSlider.input.value = String(defaultMarginBottom);
                    marginTopSlider.valueDisplay.textContent = `${defaultMarginTop} px`;
                    marginBottomSlider.valueDisplay.textContent = `${defaultMarginBottom} px`;
                    updateMargins(defaultMarginTop, defaultMarginBottom);
                });
                presetsContainer.appendChild(resetBtn);
                spacingSection.appendChild(presetsContainer);

                const dividerSection = document.createElement('div');
                dividerSection.className = 'table-style-section';
                const dividerTitle = document.createElement('div');
                dividerTitle.className = 'table-style-section-title';
                dividerTitle.textContent = 'Líneas divisorias';
                dividerSection.appendChild(dividerTitle);

                const dividerColors = [
                    { label: 'Negro', value: '#111827' },
                    { label: 'Gris oscuro', value: '#374151' },
                    { label: 'Gris medio', value: '#6b7280' },
                    { label: 'Gris claro', value: '#d1d5db' },
                    { label: 'Blanco', value: '#ffffff' },
                    { label: 'Azul', value: '#2563eb' },
                    { label: 'Celeste', value: '#0ea5e9' },
                    { label: 'Verde', value: '#059669' },
                    { label: 'Ámbar', value: '#f59e0b' },
                    { label: 'Rojo', value: '#dc2626' },
                    { label: 'Morado', value: '#7c3aed' }
                ];
                const dividerColorGroup = document.createElement('div');
                dividerColorGroup.className = 'line-style-group';
                const dividerColorButtons = [];
                const setDividerColor = (color) => {
                    table.dataset.dividerColor = color || '';
                    applyDividerStyles(table);
                    updateDividerColorButtons();
                };
                const updateDividerColorButtons = () => {
                    const current = (table.dataset.dividerColor || '').toLowerCase();
                    dividerColorButtons.forEach(({ btn, value }) => {
                        btn.classList.toggle('active', current === value.toLowerCase());
                    });
                };
                dividerColors.forEach(color => {
                    const colorBtn = document.createElement('button');
                    colorBtn.type = 'button';
                    colorBtn.className = 'toolbar-btn line-color-option';
                    colorBtn.style.setProperty('background', color.value);
                    colorBtn.title = color.label;
                    colorBtn.setAttribute('aria-label', color.label);
                    colorBtn.addEventListener('click', () => setDividerColor(color.value));
                    dividerColorButtons.push({ btn: colorBtn, value: color.value });
                    dividerColorGroup.appendChild(colorBtn);
                });
                const customDividerLabel = document.createElement('label');
                customDividerLabel.className = 'toolbar-btn line-color-custom';
                customDividerLabel.title = 'Color personalizado';
                customDividerLabel.textContent = '🎨';
                const customDividerInput = document.createElement('input');
                customDividerInput.type = 'color';
                customDividerInput.style.position = 'absolute';
                customDividerInput.style.width = '0';
                customDividerInput.style.height = '0';
                customDividerInput.style.opacity = '0';
                customDividerInput.addEventListener('input', (event) => {
                    setDividerColor(event.target.value);
                });
                customDividerInput.addEventListener('click', (event) => event.stopPropagation());
                customDividerLabel.appendChild(customDividerInput);
                dividerColorGroup.appendChild(customDividerLabel);
                dividerSection.appendChild(dividerColorGroup);

                const currentDividerWidth = parseFloat(table.dataset.dividerWidth || '1');
                const widthSlider = createSlider('Grosor de línea', 0, 6, 0.25, currentDividerWidth, (v) => `${parseFloat(v).toFixed(2)} px`, (val) => {
                    const normalized = Math.max(0, parseFloat(val));
                    table.dataset.dividerWidth = String(Number.isFinite(normalized) ? normalized : 0);
                    applyDividerStyles(table);
                });
                dividerSection.appendChild(widthSlider.element);

                const toggleGroup = document.createElement('div');
                toggleGroup.className = 'line-toggle-group';
                const createDividerToggle = (label, key) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'toolbar-btn line-toggle-btn';
                    btn.textContent = label;
                    btn.addEventListener('click', () => {
                        const current = table.dataset[key] === 'true';
                        table.dataset[key] = current ? 'false' : 'true';
                        applyDividerStyles(table);
                        updateToggleStates();
                    });
                    return btn;
                };
                const verticalToggle = createDividerToggle('Ocultar líneas verticales', 'hideVerticalBorders');
                const horizontalToggle = createDividerToggle('Ocultar líneas horizontales', 'hideHorizontalBorders');
                toggleGroup.appendChild(verticalToggle);
                toggleGroup.appendChild(horizontalToggle);
                dividerSection.appendChild(toggleGroup);

                const updateToggleStates = () => {
                    verticalToggle.classList.toggle('active', table.dataset.hideVerticalBorders === 'true');
                    horizontalToggle.classList.toggle('active', table.dataset.hideHorizontalBorders === 'true');
                };

                updateDividerColorButtons();
                updateToggleStates();

                spacingColumn.appendChild(spacingSection);
                spacingColumn.appendChild(dividerSection);
                layout.appendChild(themesColumn);
                layout.appendChild(spacingColumn);
                tabContent.appendChild(layout);
            };

            const tabs = [
                { label: '✏️', build: buildEditTab },
                { label: '🎨', build: buildStyleTab }
            ];
            tabs.forEach((t, i) => {
                const b = document.createElement('button');
                b.className = 'tab-btn';
                b.innerHTML = t.label;
                b.addEventListener('click', () => {
                    tabsBar.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                    b.classList.add('active');
                    t.build();
                });
                if (i === 0) { b.classList.add('active'); t.build(); }
                tabsBar.appendChild(b);
            });

            const editorRect = notesEditor.getBoundingClientRect();
            const editorWidth = Math.max(280, editorRect.width - 16);
            const viewportLimit = Math.max(280, window.innerWidth - 32);
            const maxWidth = Math.min(editorWidth, viewportLimit);
            const preferredWidth = Math.max(420, Math.min(maxWidth, 640));
            const targetWidth = Math.min(preferredWidth, maxWidth);
            tableMenu.style.maxWidth = `${maxWidth}px`;
            tableMenu.style.width = `${targetWidth}px`;
            tableMenu.style.display = 'block';
            const rect = table.getBoundingClientRect();
            const menuHeight = tableMenu.offsetHeight;
            const top = rect.top + window.scrollY - menuHeight - 8;
            tableMenu.style.top = `${top < 0 ? 0 : top}px`;
            let left = rect.left + window.scrollX;
            const editorRight = window.scrollX + editorRect.right;
            if (left + tableMenu.offsetWidth > editorRight) {
                left = Math.max(window.scrollX + 8, editorRight - tableMenu.offsetWidth - 8);
            }
            tableMenu.style.left = `${left}px`;
            tableMenu.style.zIndex = 10001;
        };
        notesEditor.addEventListener('dblclick', (e) => {
            if (tableEditMode) return;
            const cell = e.target.closest('td, th');
            const table = e.target.closest('table');
            if (!table || !notesEditor.contains(table) || !cell) {
                return;
            }
            const row = cell.closest('tr');
            const sectionRowIndex = row && typeof row.sectionRowIndex === 'number' ? row.sectionRowIndex : (row ? row.rowIndex : 0);
            const cellIndex = typeof cell.cellIndex === 'number' ? cell.cellIndex : 0;
            if (sectionRowIndex !== 0 && cellIndex !== 0) {
                return;
            }
            showTableMenu(table, cell);
            e.stopPropagation();
        });
        document.addEventListener('click', (e) => {
            if (tableEditMode && editingTable && !editingTable.contains(e.target)) {
                tableEditMode = false;
                editingTable.classList.remove('selected');
                editingTable = null;
            }
        });
        document.addEventListener('click', (e) => {
            if (!tableMenu.contains(e.target)) hideTableMenu();
        });

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
            const iconSVG = UI_ICON_STRINGS.highlightSize;
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
                    notesEditor.focus({ preventScroll: true });
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

        const LINE_GRADIENTS = [
            ['#fffde7','#fff176'],
            ['#ffe0b2','#ff9800'],
            ['#bbdefb','#2196f3'],
            ['#e1f5fe','#4fc3f7'],
            ['#c8e6c9','#388e3c'],
            ['#dcedc8','#8bc34a'],
            ['#e1bee7','#9c27b0'],
            ['#d7ccc8','#795548'],
            ['#f5f5f5','#9e9e9e'],
            ['#ffcdd2','#f44336']
        ];
        const lineStylePopup = document.createElement('div');
        lineStylePopup.className = 'preset-style-popup';
        document.body.appendChild(lineStylePopup);
        let currentLine = null;

        const SIMPLE_LINES = [1,3,5].map(t => `border:none; border-top:${t}px solid #000; height:${t}px; margin:0;`);
        const DASHED_LINES = [1,3,5].map(t => `border:none; border-top:${t}px dashed #000; height:${t}px; margin:0;`);
        const DOTTED_LINES = [1,3,5].map(t => `border:none; border-top:${t}px dotted #000; height:${t}px; margin:0;`);

        const applyLineStyle = (style) => {
            if (currentLine) {
                currentLine.style.cssText = style;
            } else {
                // Ensure the editor retains focus so the divider is inserted
                // at the current caret position even when no text is selected.
                notesEditor.focus({ preventScroll: true });
                const selection = window.getSelection();
                if (savedEditorSelection) {
                    selection.removeAllRanges();
                    selection.addRange(savedEditorSelection);
                }
                const range = selection.rangeCount ? selection.getRangeAt(0) : null;
                if (range) {
                    range.deleteContents();
                    const hr = document.createElement('hr');
                    hr.setAttribute('style', style);
                    range.insertNode(hr);
                    range.setStartAfter(hr);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                } else {
                    document.execCommand('insertHTML', false, `<hr style="${style}">`);
                }
                savedEditorSelection = null;
            }
            hideLineStylePopup();
            notesEditor.focus({ preventScroll: true });
        };

        const renderLineStylePopup = () => {
            lineStylePopup.innerHTML = '';
            const addGroup = (title, styles) => {
                const label = document.createElement('div');
                label.textContent = title;
                lineStylePopup.appendChild(label);
                const group = document.createElement('div');
                group.className = 'line-style-group';
                styles.forEach(s => {
                    const b = document.createElement('button');
                    b.className = 'toolbar-btn';
                    b.innerHTML = `<div style="${s} width:40px;"></div>`;
                    b.addEventListener('click', () => applyLineStyle(s));
                    group.appendChild(b);
                });
                lineStylePopup.appendChild(group);
            };
            addGroup('Sólidas', SIMPLE_LINES);
            addGroup('Segmentadas', DASHED_LINES);
            addGroup('Punteadas', DOTTED_LINES);
            const gradientsGroup = LINE_GRADIENTS.map(([c1,c2]) => `height:4px; border:none; margin:0; border-radius:2px; background:linear-gradient(to right, ${c1}, ${c2});`);
            addGroup('Degradadas', gradientsGroup);
        };

        const showLineStylePopup = (hr = null, anchor = null) => {
            currentLine = hr;
            renderLineStylePopup();
            if (!hr && savedEditorSelection) {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(savedEditorSelection);
            }
            lineStylePopup.style.display = 'block';
            let rect;
            if (hr) {
                rect = hr.getBoundingClientRect();
            } else if (savedEditorSelection) {
                rect = savedEditorSelection.getBoundingClientRect();
            } else if (anchor) {
                rect = anchor.getBoundingClientRect();
            } else {
                const sel = window.getSelection();
                if (sel && sel.rangeCount) rect = sel.getRangeAt(0).getBoundingClientRect();
            }
            if (rect) {
                lineStylePopup.style.top = `${window.scrollY + rect.top - lineStylePopup.offsetHeight - 8}px`;
                lineStylePopup.style.left = `${window.scrollX + rect.left}px`;
            }
        };

        const hideLineStylePopup = () => {
            lineStylePopup.style.display = 'none';
            currentLine = null;
        };

        const lineBtn = createButton('Insertar línea separadora', '—', null, null, null);
        lineBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const selection = window.getSelection();
            if (selection.rangeCount > 0 && notesEditor.contains(selection.anchorNode)) {
                savedEditorSelection = selection.getRangeAt(0).cloneRange();
            } else {
                savedEditorSelection = null;
            }
        });
        lineBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => d.classList.remove('visible'));
            showLineStylePopup(null, lineBtn);
        });
        editorToolbar.appendChild(lineBtn);
        editorToolbar.appendChild(createSeparator());
        notesEditor.addEventListener('click', (e) => {
            if (e.target.tagName === 'HR') {
                e.stopPropagation();
                showLineStylePopup(e.target);
            }
        });
        document.addEventListener('click', (e) => {
            if (!lineStylePopup.contains(e.target)) hideLineStylePopup();
        });

        const outdentSVG = UI_ICON_STRINGS.indentDecrease;
        const indentSVG = UI_ICON_STRINGS.indentIncrease;
        editorToolbar.appendChild(createButton('Disminuir sangría', outdentSVG, null, null, () => adjustIndent(-1, notesEditor)));
        editorToolbar.appendChild(createButton('Aumentar sangría', indentSVG, null, null, () => adjustIndent(1, notesEditor)));
        editorToolbar.appendChild(createButton('Corregir sangría inversa', '↤', null, null, () => manualOutdentBlock(notesEditor)));
        editorToolbar.appendChild(createButton('Corregir sangría bloque', '↦', null, null, () => manualIndentBlock(notesEditor)));

        const moveCaretToElementStart = (element) => {
            if (!element) return;
            const selection = window.getSelection();
            if (!selection) return;
            const range = document.createRange();
            if (element.firstChild && element.firstChild.nodeType === Node.TEXT_NODE) {
                range.setStart(element.firstChild, 0);
            } else {
                range.selectNodeContents(element);
                range.collapse(true);
            }
            selection.removeAllRanges();
            selection.addRange(range);
        };

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
                moveCaretToElementStart(blank);
            }
            recordHistory();
            notesEditor.focus({ preventScroll: true });
        };

        const insertBlankLineBelow = () => {
            let blocks = getSelectedBlockElements();
            if (blocks.length === 0) {
                document.execCommand('formatBlock', false, 'p');
                blocks = getSelectedBlockElements();
            }
            const last = blocks[blocks.length - 1];
            if (last && notesEditor.contains(last)) {
                const tag = last.tagName === 'LI' ? 'li' : 'p';
                const blank = document.createElement(tag);
                blank.innerHTML = '<br>';
                last.parentNode.insertBefore(blank, last.nextSibling);
                moveCaretToElementStart(blank);
            }
            recordHistory();
            notesEditor.focus({ preventScroll: true });
        };

        editorToolbar.appendChild(createButton('Insertar línea en blanco arriba', '⬆️⏎', null, null, insertBlankLineAbove));
        editorToolbar.appendChild(createButton('Insertar línea en blanco abajo', '⬇️⏎', null, null, insertBlankLineBelow));

        const rectanglesOverlap = (a, b) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

        let lineEraseOverlay = document.querySelector('.line-erase-selection');
        if (!lineEraseOverlay) {
            lineEraseOverlay = document.createElement('div');
            lineEraseOverlay.className = 'line-erase-selection';
            document.body.appendChild(lineEraseOverlay);
        }

        let lineEraseSelectionStart = null;
        let lineEraseDragging = false;

        function hideLineEraseOverlay() {
            lineEraseOverlay.classList.remove('active');
            lineEraseOverlay.style.width = '0px';
            lineEraseOverlay.style.height = '0px';
        }

        function updateLineEraseOverlay(rect) {
            const left = Math.min(rect.left, rect.right);
            const top = Math.min(rect.top, rect.bottom);
            const width = Math.abs(rect.right - rect.left);
            const height = Math.abs(rect.bottom - rect.top);
            lineEraseOverlay.classList.add('active');
            lineEraseOverlay.style.left = `${left}px`;
            lineEraseOverlay.style.top = `${top}px`;
            lineEraseOverlay.style.width = `${width}px`;
            lineEraseOverlay.style.height = `${height}px`;
        }

        function cancelLineEraseSelection() {
            lineEraseDragging = false;
            lineEraseSelectionStart = null;
            hideLineEraseOverlay();
            document.removeEventListener('mousemove', handleLineEraseMouseMove);
            document.removeEventListener('mouseup', handleLineEraseMouseUp);
        }

        function applyLineEraseRect(rect) {
            if (!rect) return;
            const normalized = {
                left: Math.min(rect.left, rect.right),
                right: Math.max(rect.left, rect.right),
                top: Math.min(rect.top, rect.bottom),
                bottom: Math.max(rect.top, rect.bottom)
            };
            if (Math.abs(normalized.right - normalized.left) < 3 && Math.abs(normalized.bottom - normalized.top) < 3) {
                normalized.left -= 2;
                normalized.right += 2;
                normalized.top -= 2;
                normalized.bottom += 2;
            }

            const editorRect = notesEditor.getBoundingClientRect();
            const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
            const pointToRange = (x, y) => {
                const clampedX = clamp(x, editorRect.left + 1, editorRect.right - 1);
                const clampedY = clamp(y, editorRect.top + 1, editorRect.bottom - 1);
                let caretRange = null;
                if (typeof document.caretRangeFromPoint === 'function') {
                    caretRange = document.caretRangeFromPoint(clampedX, clampedY);
                }
                if (!caretRange && typeof document.caretPositionFromPoint === 'function') {
                    const pos = document.caretPositionFromPoint(clampedX, clampedY);
                    if (pos) {
                        caretRange = document.createRange();
                        caretRange.setStart(pos.offsetNode, pos.offset);
                        caretRange.collapse(true);
                    }
                }
                if (!caretRange || !caretRange.startContainer) return null;
                if (!notesEditor.contains(caretRange.startContainer)) return null;
                return caretRange;
            };
            const findRange = (xCandidates, yCandidates) => {
                for (const y of yCandidates) {
                    for (const x of xCandidates) {
                        const range = pointToRange(x, y);
                        if (range) return range;
                    }
                }
                return null;
            };

            const xCandidates = [
                normalized.left + 2,
                (normalized.left + normalized.right) / 2,
                normalized.right - 2
            ];
            const startRange = findRange(xCandidates, [normalized.top + 2, normalized.bottom - 2, (normalized.top + normalized.bottom) / 2]);
            const endRange = findRange(xCandidates.slice().reverse(), [normalized.bottom - 2, normalized.top + 2, (normalized.top + normalized.bottom) / 2]);
            if (!startRange || !endRange) return;

            let start = startRange;
            let end = endRange;
            if (start.compareBoundaryPoints(Range.START_TO_START, end) === 1) {
                [start, end] = [end, start];
            }

            const deletionRange = document.createRange();
            deletionRange.setStart(start.startContainer, start.startOffset);
            deletionRange.setEnd(end.endContainer || end.startContainer, end.endOffset || end.startOffset);
            if (deletionRange.collapsed) return;

            const fragment = deletionRange.cloneContents();
            const hasContent = (fragment.textContent && fragment.textContent.trim().length > 0) || (typeof fragment.querySelector === 'function' && fragment.querySelector('*'));
            if (!hasContent) return;

            const scrollY = window.scrollY;
            const modalScroll = notesModalContent.scrollTop;

            const candidateBlocks = Array.from(notesEditor.querySelectorAll(blockSelector)).filter(block => {
                const blockRect = block.getBoundingClientRect();
                return rectanglesOverlap(blockRect, normalized);
            });

            const caretRange = deletionRange.cloneRange();
            caretRange.collapse(true);
            deletionRange.deleteContents();

            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                try {
                    selection.addRange(caretRange);
                } catch (error) {
                    selection.removeAllRanges();
                }
            }

            if (!selection || selection.rangeCount === 0) {
                const fallbackBlock = candidateBlocks.find(block => notesEditor.contains(block)) || notesEditor.querySelector(blockSelector);
                if (fallbackBlock) {
                    moveCaretToElementStart(fallbackBlock);
                }
            }

            const cleanupBlock = (block) => {
                if (!block || !notesEditor.contains(block)) return;
                if (!block.textContent.trim()) {
                    if (block.matches('li')) {
                        const list = block.parentElement;
                        block.remove();
                        if (list && !list.querySelector('li')) {
                            const placeholder = document.createElement('p');
                            placeholder.innerHTML = '<br>';
                            list.parentNode?.replaceChild(placeholder, list);
                        }
                    } else {
                        block.innerHTML = '<br>';
                    }
                }
            };
            candidateBlocks.forEach(cleanupBlock);

            recordHistory();
            window.scrollTo(0, scrollY);
            notesModalContent.scrollTop = modalScroll;
            notesEditor.focus({ preventScroll: true });
        }

        function handleLineEraseMouseMove(event) {
            if (!lineEraseDragging || !lineEraseSelectionStart) return;
            const current = { x: event.clientX, y: event.clientY };
            const rect = {
                left: Math.min(lineEraseSelectionStart.x, current.x),
                right: Math.max(lineEraseSelectionStart.x, current.x),
                top: Math.min(lineEraseSelectionStart.y, current.y),
                bottom: Math.max(lineEraseSelectionStart.y, current.y)
            };
            updateLineEraseOverlay(rect);
        }

        function handleLineEraseMouseUp(event) {
            if (!lineEraseDragging) {
                cancelLineEraseSelection();
                return;
            }
            lineEraseDragging = false;
            document.removeEventListener('mousemove', handleLineEraseMouseMove);
            document.removeEventListener('mouseup', handleLineEraseMouseUp);
            if (!lineEraseSelectionStart) {
                cancelLineEraseSelection();
                return;
            }
            const endPoint = { x: event.clientX, y: event.clientY };
            const rect = {
                left: Math.min(lineEraseSelectionStart.x, endPoint.x),
                right: Math.max(lineEraseSelectionStart.x, endPoint.x),
                top: Math.min(lineEraseSelectionStart.y, endPoint.y),
                bottom: Math.max(lineEraseSelectionStart.y, endPoint.y)
            };
            lineEraseSelectionStart = null;
            hideLineEraseOverlay();
            applyLineEraseRect(rect);
        }

        const startLineEraseSelection = (event) => {
            if (!lineEraseMode || event.button !== 0) return;
            if (!notesEditor.contains(event.target)) return;
            lineEraseDragging = true;
            lineEraseSelectionStart = { x: event.clientX, y: event.clientY };
            const rect = {
                left: lineEraseSelectionStart.x,
                right: lineEraseSelectionStart.x,
                top: lineEraseSelectionStart.y,
                bottom: lineEraseSelectionStart.y
            };
            updateLineEraseOverlay(rect);
            event.preventDefault();
            document.addEventListener('mousemove', handleLineEraseMouseMove);
            document.addEventListener('mouseup', handleLineEraseMouseUp);
        };

        if (!notesEditor.dataset.lineEraseSetup) {
            notesEditor.addEventListener('mousedown', startLineEraseSelection);
            notesModalContent.addEventListener('scroll', () => {
                if (lineEraseMode) cancelLineEraseSelection();
            });
            notesEditor.dataset.lineEraseSetup = 'true';
        }

        let eraseLineBtn;

        const deactivateLineEraseMode = () => {
            lineEraseMode = false;
            cancelLineEraseSelection();
            notesEditor.style.cursor = '';
            if (eraseLineBtn) eraseLineBtn.classList.remove('active');
        };

        const activateLineEraseMode = () => {
            lineEraseMode = true;
            notesEditor.style.cursor = 'crosshair';
            if (eraseLineBtn) eraseLineBtn.classList.add('active');
        };

        const toggleLineEraseMode = () => {
            if (lineEraseMode) {
                deactivateLineEraseMode();
            } else {
                activateLineEraseMode();
            }
        };

        eraseLineBtn = createButton('Borrado por área', '🧹', null, null, toggleLineEraseMode);
        editorToolbar.appendChild(eraseLineBtn);

        document.addEventListener('keydown', (event) => {
            if (!lineEraseMode) return;
            if (event.key === 'Escape') {
                deactivateLineEraseMode();
            }
        });

        const deleteLineBtn = document.createElement('button');
        deleteLineBtn.className = 'toolbar-btn';
        deleteLineBtn.title = 'Eliminar línea actual';
        deleteLineBtn.textContent = '🗑️⏎';
        deleteLineBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            const range = sel.getRangeAt(0);
            let container = range.startContainer;
            if (container.nodeType === Node.TEXT_NODE) {
                container = container.parentElement;
            }
            let block = container?.closest('p, h1, h2, h3, h4, h5, h6, div, li, blockquote, pre, details');
            if (!block || !notesEditor.contains(block)) return;

            const scrollY = window.scrollY;
            const modalScroll = notesModalContent.scrollTop;

            const restoreFocus = () => {
                window.scrollTo(0, scrollY);
                notesModalContent.scrollTop = modalScroll;
                notesEditor.focus({ preventScroll: true });
            };

            if (block.tagName === 'LI') {
                const list = block.parentElement;
                const nextItem = block.nextElementSibling || block.previousElementSibling;
                block.remove();
                if (list && !list.querySelector('li')) {
                    const placeholder = document.createElement('p');
                    placeholder.innerHTML = '<br>';
                    list.parentNode?.replaceChild(placeholder, list);
                    moveCaretToElementStart(placeholder);
                } else if (nextItem) {
                    moveCaretToElementStart(nextItem);
                } else if (list && notesEditor.contains(list)) {
                    moveCaretToElementStart(list);
                } else {
                    moveCaretToElementStart(notesEditor);
                }
                recordHistory();
                restoreFocus();
                return;
            }

            const beforeRange = range.cloneRange();
            beforeRange.setStart(block, 0);
            const tempContainer = document.createElement('div');
            tempContainer.appendChild(beforeRange.cloneContents());
            const lineIndex = tempContainer.querySelectorAll('br').length;

            const childNodes = Array.from(block.childNodes);
            const lines = [];
            let currentLine = [];
            childNodes.forEach(node => {
                if (node.nodeName === 'BR') {
                    lines.push({ nodes: currentLine, breakNode: node });
                    currentLine = [];
                } else {
                    currentLine.push(node);
                }
            });
            lines.push({ nodes: currentLine, breakNode: null });

            const targetIndex = Math.min(lineIndex, lines.length - 1);
            const targetLine = lines[targetIndex];
            if (!targetLine) return;

            let removedSomething = false;
            targetLine.nodes.forEach(node => {
                if (node.parentNode === block) {
                    block.removeChild(node);
                    removedSomething = true;
                }
            });
            if (targetLine.breakNode && targetLine.breakNode.parentNode === block) {
                block.removeChild(targetLine.breakNode);
                removedSomething = true;
            } else if (targetIndex > 0) {
                const previousBreak = lines[targetIndex - 1]?.breakNode;
                if (previousBreak && previousBreak.parentNode === block) {
                    block.removeChild(previousBreak);
                    removedSomething = true;
                }
            }

            if (!removedSomething) {
                restoreFocus();
                return;
            }

            if (!block.childNodes.length) {
                block.innerHTML = '<br>';
            }

            const nextLine = lines[targetIndex + 1];
            const previousLine = lines[targetIndex - 1];
            let caretNode = null;
            if (nextLine && nextLine.nodes.length) {
                caretNode = nextLine.nodes[0];
            } else if (previousLine && previousLine.nodes.length) {
                caretNode = previousLine.nodes[previousLine.nodes.length - 1];
            }

            const newRange = document.createRange();
            if (caretNode && caretNode.parentNode) {
                if (caretNode.nodeType === Node.TEXT_NODE) {
                    newRange.setStart(caretNode, 0);
                } else {
                    newRange.selectNodeContents(caretNode);
                    newRange.collapse(true);
                }
            } else {
                newRange.selectNodeContents(block);
                newRange.collapse(true);
            }
            sel.removeAllRanges();
            sel.addRange(newRange);

            recordHistory();
            restoreFocus();
        });
        editorToolbar.appendChild(deleteLineBtn);

        const collapsibleListSVG = UI_ICON_STRINGS.collapsibleList;
        const collapsibleListHTML = `<details class="collapsible-list"><summary>Elemento</summary><div>Texto...<br></div></details><p><br></p>`;

        editorToolbar.appendChild(createButton('Insertar lista colapsable', collapsibleListSVG, 'insertHTML', collapsibleListHTML));

        const htmlCodeBtn = createButton('Insertar HTML', '&lt;/&gt;', null, null, () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                savedEditorSelection = range.cloneRange();
                const div = document.createElement('div');
                div.appendChild(range.cloneContents());
                savedSelectedHtml = div.innerHTML;
            } else {
                savedEditorSelection = null;
                savedSelectedHtml = '';
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

        const subnoteSVG = UI_ICON_STRINGS.subnote;
        // El botón ahora crea una sub-nota en lugar de un Post-it
        editorToolbar.appendChild(createButton('Añadir Sub-nota', subnoteSVG, null, null, createSubnoteLink));

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
            notesEditor.focus({ preventScroll: true });
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

        const moveLeftBtn = createButton('Mover imagen/tabla a la izquierda', '⬅️', null, null, () => moveSelectedElement(-10));
        editorToolbar.appendChild(moveLeftBtn);

        const moveRightBtn = createButton('Mover imagen/tabla a la derecha', '➡️', null, null, () => moveSelectedElement(10));
        editorToolbar.appendChild(moveRightBtn);

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
        editorToolbar.appendChild(createSymbolDropdown(
            toolbarIcons,
            'Insertar Símbolo',
            '📌',
            () => {
                renderIconManager();
                showModal(iconManagerModal);
            }
        ));

        editorToolbar.appendChild(createSymbolDropdown(
            globalSpecialChars,
            'Caracteres Especiales',
            'Ω',
            () => {
                renderCharManager();
                showModal(charManagerModal);
            },
            true
        ));
    }

    function rgbToHex(rgb) {
        const result = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(rgb);
        return result ? '#' + result.slice(1).map(n => ('0' + parseInt(n).toString(16)).slice(-2)).join('') : rgb;
    }

    function openNoteStyleModal(callout = null) {
        savedNoteScrollY = window.scrollY;
        savedNoteScrollTop = notesModalContent.scrollTop;
        currentCallout = callout;
        noteStyleModal.classList.add('visible');
        noteStyleTabPre.classList.add('border-b-2', 'border-blue-500');
        noteStyleTabCustom.classList.remove('border-b-2', 'border-blue-500');
        noteStylePre.classList.remove('hidden');
        noteStyleCustom.classList.add('hidden');
        if (callout) {
            noteBgColorInput.value = rgbToHex(callout.style.backgroundColor || '#ffffff');
            noteBorderColorInput.value = rgbToHex(callout.style.borderColor || '#000000');
            noteTextColorInput.value = rgbToHex(callout.style.color || '#000000');
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
        requestAnimationFrame(() => {
            window.scrollTo(0, savedNoteScrollY);
            notesModalContent.scrollTop = savedNoteScrollTop;
        });
    }

    function applyNoteStyle(opts) {
        const PREDEF_CLASSES = ['note-blue-left','note-green-card','note-lila-dotted','note-peach-dashed','note-cyan-top','note-pink-double','note-yellow-corner','note-gradient','note-mint-bottom','note-violet-shadow','note-gray-neutral'];
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
                savedEditorSelection.insertNode(callout);
            } else {
                notesEditor.appendChild(callout);
            }
            currentCallout = callout;
        }
        if (!currentCallout.querySelector('.note-callout-content')) {
            const innerContent = document.createElement('div');
            innerContent.className = 'note-callout-content';
            innerContent.contentEditable = 'true';
            while (currentCallout.firstChild) {
                innerContent.appendChild(currentCallout.firstChild);
            }
            if (!innerContent.textContent.trim()) {
                innerContent.textContent = 'Escribe una nota...';
            }
            currentCallout.appendChild(innerContent);
        }
        const inner = currentCallout.querySelector('.note-callout-content');
        sanitizeCalloutContent(inner);
        currentCallout.contentEditable = 'false';
        currentCallout.classList.remove(...PREDEF_CLASSES, 'note-shadow');
        if (opts.presetClass) {
            currentCallout.removeAttribute('style');
            currentCallout.classList.add(opts.presetClass);
        } else {
            currentCallout.style.backgroundColor = opts.backgroundColor;
            currentCallout.style.borderColor = opts.borderColor;
            currentCallout.style.color = opts.textColor;
            currentCallout.style.borderWidth = opts.borderWidth + 'px';
            currentCallout.style.borderRadius = opts.borderRadius + 'px';
            currentCallout.style.padding = opts.padding + 'px';
            currentCallout.style.margin = opts.margin + 'px 0';
            if (opts.shadow) {
                currentCallout.classList.add('note-shadow');
            }
        }
        const range = document.createRange();
        range.selectNodeContents(inner);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        inner.focus({ preventScroll: true });
        notesEditor.focus({ preventScroll: true });
        closeNoteStyleModal();
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

    function moveSelectedElement(deltaX) {
        let elem = selectedImageForResize || selectedTableForMove;
        if (elem && elem.tagName === 'IMG') {
            const fig = elem.closest('figure.float-image');
            if (fig) elem = fig;
        }
        if (!elem) {
            showAlert("Selecciona una imagen o tabla para moverla.");
            return;
        }
        const current = parseFloat(elem.style.marginLeft) || 0;
        elem.style.marginLeft = `${current + deltaX}px`;
    }

    function updateAllTotals() {
        let grandLectura = 0;
        let grandMapa = 0;

        const allRows = document.querySelectorAll('tr[data-topic-id]');
        const totalTopics = allRows.length;

        allRows.forEach(row => {
            const mapaCounter = row.querySelector(`td[data-col="mapa"] .mapa-counter`);
            const mapaCount = parseInt(mapaCounter?.textContent || '0', 10);
            if (mapaCount > 0) {
                grandMapa++;
            }
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
            let sectionMapaCount = 0;
            let sectionReferencesCount = 0;

            sectionRows.forEach(row => {
                const mapaCounter = row.querySelector(`td[data-col="mapa"] .mapa-counter`);
                const mapaValue = parseInt(mapaCounter?.textContent || '0', 10);
                if (mapaValue > 0) sectionMapaCount++;

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
            if (totalRowTds[2]) { // Mapa column
                totalRowTds[2].textContent = `${sectionMapaCount} / ${sectionTotalTopics}`;
                totalRowTds[2].style.fontSize = '0.75rem';
            }
            if (totalRowTds[3]) { // Lectura column
                totalRowTds[3].textContent = `${sectionLecturaCount} / ${sectionTotalTopics}`;
                totalRowTds[3].style.fontSize = '0.75rem'; // Make font smaller
            }
        });

        grandTotalSpans.references.textContent = '-';
        grandTotalSpans.mapa.textContent = String(grandMapa);
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
            const mapaNotes = JSON.parse(row.dataset.mapaNotes || '[]');
            const topicData = {
                notes: notes.map(note => ({ ...note, lastEdited: note.lastEdited || new Date().toISOString() })),
                mapaNotes: mapaNotes.map(note => ({ ...note, lastEdited: note.lastEdited || new Date().toISOString() })),
                confidence: row.querySelector('.confidence-dot')?.dataset.confidenceLevel || '0',
                references: JSON.parse(row.dataset.references || '[]'),
                mapa: row.querySelector(`td[data-col="mapa"] .mapa-counter`)?.textContent || '0',
                lectura: row.querySelector(`td[data-col="lectura"] .lectura-counter`)?.textContent || '0'
            };
            state.topics[topicId] = topicData;
        });
        
        document.querySelectorAll('tr[data-section-header]').forEach(row => {
            const sectionId = row.dataset.sectionHeader;
            state.sections[sectionId] = {
                isCollapsed: row.classList.contains('collapsed'),
                title: row.querySelector('.section-title').textContent,
                note: row.dataset.sectionNote || '',
                coverImage: row.dataset.coverImage || ''
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

                const mapaCell = row.querySelector('td[data-col="mapa"]');
                const mapaCount = topicData.mapa || '0';
                if (mapaCell) {
                    const counter = mapaCell.querySelector('.mapa-counter');
                    const count = parseInt(mapaCount, 10);
                    if (counter) counter.textContent = count;
                    mapaCell.classList.toggle('mapa-filled', count > 0);
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

                const mapaNotes = topicData.mapaNotes || [];
                row.dataset.mapaNotes = JSON.stringify(mapaNotes);
                const mapaIcon = row.querySelector(`.note-icon[data-note-type="mapa"]`);
                if (mapaIcon) {
                    const hasMapaContent = mapaNotes.some(n => n.content && n.content.trim() !== '' && n.content.trim() !== '<p><br></p>');
                    mapaIcon.classList.toggle('has-note', hasMapaContent);
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
                    if (sectionData.coverImage) {
                        headerRow.dataset.coverImage = sectionData.coverImage;
                        const coverIcon = headerRow.querySelector('.section-cover-icon');
                        if (coverIcon) coverIcon.classList.add('has-cover');
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
            recordHistory();
            sectionNavigation.update();
            sectionNavigation.markActiveSection();
        }
    }

    function showModal(modal) {
        modal.classList.add('visible');
    }

    function hideModal(modal) {
        modal.classList.remove('visible');
        hideTooltipIconSelector();
        if (modal === notesModal) {
            resetEditorModes();
        }
        if (modal === subNoteModal && isTooltipEditing) {
            resetTooltipEditorState();
        }
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
        if (data && Array.isArray(data.value) && data.value.length > 0) {
            htmlFavorites = data.value.map(f => ({
                name: f.name,
                code: f.code,
                tags: f.tags || [],
                favorite: !!f.favorite,
                uses: f.uses || 0,
                created: f.created || Date.now()
            }));
        } else {
            htmlFavorites = DEFAULT_HTML_FAVORITES.map(f => ({ ...f }));
            await saveHtmlFavorites();
        }
    }

    async function saveHtmlFavorites() {
        await db.set('keyvalue', { key: 'htmlFavorites', value: htmlFavorites });
    }

    function renderTagFilter() {
        const tags = new Set();
        htmlFavorites.forEach(f => f.tags.forEach(t => tags.add(t)));
        tagFilter.innerHTML = '';
        tags.forEach(tag => {
            const btn = document.createElement('button');
            btn.className = `px-1.5 py-0.5 rounded-lg text-xs border border-border-color bg-secondary whitespace-nowrap ${templateTagFilter === tag ? 'bg-indigo-600 text-white' : ''}`;
            btn.textContent = tag;
            btn.addEventListener('click', () => {
                templateTagFilter = templateTagFilter === tag ? null : tag;
                templatePage = 0;
                populateHtmlFavorites();
            });
            tagFilter.appendChild(btn);
        });
    }

    function populateHtmlFavorites() {
        let favorites = [...htmlFavorites];
        renderTagFilter();

        if (templateSearchQuery) {
            favorites = favorites.filter(f => f.name.toLowerCase().includes(templateSearchQuery));
        }
        if (templateTagFilter) {
            favorites = favorites.filter(f => f.tags.includes(templateTagFilter));
        }

        // sort favorites: favorites first
        favorites.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
        if (templateSortMode === 'az') {
            favorites.sort((a, b) => a.name.localeCompare(b.name));
        } else if (templateSortMode === 'used') {
            favorites.sort((a, b) => (b.uses || 0) - (a.uses || 0));
        } else {
            favorites.sort((a, b) => (b.created || 0) - (a.created || 0));
        }

        const totalPages = Math.max(1, Math.ceil(favorites.length / TEMPLATES_PER_PAGE));
        if (templatePage >= totalPages) templatePage = totalPages - 1;
        const start = templatePage * TEMPLATES_PER_PAGE;
        const pageItems = favorites.slice(start, start + TEMPLATES_PER_PAGE);

        htmlFavoritesList.innerHTML = '';
        pageItems.forEach(fav => {
            const card = document.createElement('div');
            card.className = 'relative group border border-border-color rounded-lg p-1 bg-secondary cursor-pointer text-xs';

            const title = document.createElement('div');
            title.className = 'font-semibold truncate text-xs';
            title.textContent = fav.name;
            card.appendChild(title);

            const star = document.createElement('button');
            star.className = 'absolute top-1 left-1 text-yellow-400';
            star.textContent = fav.favorite ? '⭐' : '☆';
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                fav.favorite = !fav.favorite;
                saveHtmlFavorites();
                populateHtmlFavorites();
            });
            card.appendChild(star);

            const actions = document.createElement('div');
            actions.className = 'absolute top-1 right-1 gap-1 flex ' + (favoritesEditMode ? '' : 'opacity-0 group-hover:opacity-100');

            const editBtn = document.createElement('button');
            editBtn.textContent = '✏️';
            editBtn.className = 'p-0.5 text-xs';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                htmlFavoriteName.value = fav.name;
                htmlFavoriteTags.value = fav.tags.join(',');
                htmlCodeInput.value = fav.code;
                editingFavoriteIndex = htmlFavorites.indexOf(fav);
            });
            actions.appendChild(editBtn);

            const delBtn = document.createElement('button');
            delBtn.textContent = '🗑️';
            delBtn.className = 'p-0.5 text-xs';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteFavorite(htmlFavorites.indexOf(fav));
            });
            actions.appendChild(delBtn);

            card.appendChild(actions);

            card.addEventListener('click', () => {
                htmlCodeInput.value = fav.code;
                fav.uses = (fav.uses || 0) + 1;
                saveHtmlFavorites();
            });

            htmlFavoritesList.appendChild(card);
        });

        templatePageInfo.textContent = favorites.length === 0 ? '0/0' : `${templatePage + 1}/${totalPages}`;
        prevTemplatePage.disabled = templatePage === 0;
        nextTemplatePage.disabled = templatePage >= totalPages - 1;
    }

    function openHtmlCodeModal() {
        htmlCodeInput.value = '';
        htmlFavoriteName.value = '';
        htmlFavoriteTags.value = '';
        templateSearchQuery = '';
        templateSearch.value = '';
        templateSortMode = 'recent';
        templateSort.value = 'recent';
        templateTagFilter = null;
        templatePage = 0;
        favoritesEditMode = false;
        editingFavoriteIndex = null;
        toggleTemplateEdit.classList.remove('bg-indigo-600','text-white');
        loadHtmlFavorites().then(() => {
            populateHtmlFavorites();
        });
        showModal(htmlCodeModal);
        setTimeout(() => htmlCodeInput.focus(), 0);
    }

    function showToast(message) {
        htmlFavoriteToast.textContent = '';
        htmlFavoriteToast.innerHTML = message;
        htmlFavoriteToast.classList.remove('hidden');
        if (undoTimer) clearTimeout(undoTimer);
        undoTimer = setTimeout(() => {
            htmlFavoriteToast.classList.add('hidden');
        }, 5000);
    }

    function deleteFavorite(index) {
        const [fav] = htmlFavorites.splice(index, 1);
        deletedFavorite = { fav, index };
        saveHtmlFavorites();
        populateHtmlFavorites();
        showToast(`Plantilla eliminada ✓ <button id="undo-template-delete" class="underline ml-2">Deshacer</button>`);
        const undoBtn = getElem('undo-template-delete');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                if (deletedFavorite) {
                    htmlFavorites.splice(deletedFavorite.index, 0, deletedFavorite.fav);
                    saveHtmlFavorites();
                    populateHtmlFavorites();
                    deletedFavorite = null;
                }
                htmlFavoriteToast.classList.add('hidden');
            });
        }
    }

    templateSearch.addEventListener('input', (e) => {
        templateSearchQuery = e.target.value.toLowerCase();
        templatePage = 0;
        populateHtmlFavorites();
    });

    templateSort.addEventListener('change', (e) => {
        templateSortMode = e.target.value;
        populateHtmlFavorites();
    });

    toggleTemplateEdit.addEventListener('click', () => {
        favoritesEditMode = !favoritesEditMode;
        toggleTemplateEdit.classList.toggle('bg-indigo-600');
        toggleTemplateEdit.classList.toggle('text-white');
        populateHtmlFavorites();
    });

    prevTemplatePage.addEventListener('click', () => {
        if (templatePage > 0) {
            templatePage--;
            populateHtmlFavorites();
        }
    });

    nextTemplatePage.addEventListener('click', () => {
        templatePage++;
        populateHtmlFavorites();
    });

    exportHtmlFavoritesBtn.addEventListener('click', async () => {
        await loadHtmlFavorites();
        const blob = new Blob([JSON.stringify(htmlFavorites, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'html-favorites.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    importHtmlFavoritesBtn.addEventListener('click', () => importHtmlFile.click());

    importHtmlFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (Array.isArray(data)) {
                htmlFavorites = data.map(f => ({
                    name: f.name,
                    code: f.code,
                    tags: f.tags || [],
                    favorite: !!f.favorite,
                    uses: f.uses || 0,
                    created: f.created || Date.now()
                }));
                await saveHtmlFavorites();
                populateHtmlFavorites();
            }
        } catch (err) {
            console.error('Error importing favorites', err);
        } finally {
            importHtmlFile.value = '';
        }
    });

    function insertSelectedTextIntoTemplate(template, selectedHtml) {
        if (!selectedHtml) return template;
        const container = document.createElement('div');
        container.innerHTML = template;
        const nodes = Array.from(container.querySelectorAll('*'));
        const placeholders = nodes.filter(node => {
            const inner = node.innerHTML.trim().toLowerCase();
            const text = node.textContent.trim();
            const hasBr = node.childElementCount === 1 && (inner === '<br>' || inner === '<br/>');
            return (node.childElementCount === 0 && text === '') || hasBr;
        });
        if (placeholders.length > 0) {
            placeholders.forEach(node => node.innerHTML = selectedHtml);
        } else {
            nodes.filter(n => n.childElementCount === 0).forEach(n => n.innerHTML = selectedHtml);
        }
        return container.innerHTML;
    }

    insertHtmlBtn.addEventListener('click', () => {
        let html = htmlCodeInput.value;
        if (html) {
            if (savedSelectedHtml) {
                html = insertSelectedTextIntoTemplate(html, savedSelectedHtml);
            }
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
        savedSelectedHtml = '';
    });

    cancelHtmlBtn.addEventListener('click', () => {
        hideModal(htmlCodeModal);
        if (currentHtmlEditor) currentHtmlEditor.focus();
        savedEditorSelection = null;
        savedSelectedHtml = '';
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
        const tags = htmlFavoriteTags.value.split(',').map(t => t.trim()).filter(Boolean);
        if (!name || !code) return;
        await loadHtmlFavorites();
        if (editingFavoriteIndex !== null) {
            htmlFavorites[editingFavoriteIndex] = { ...htmlFavorites[editingFavoriteIndex], name, code, tags };
            editingFavoriteIndex = null;
        } else {
            htmlFavorites.push({ name, code, tags, favorite: false, uses: 0, created: Date.now() });
        }
        await saveHtmlFavorites();
        await populateHtmlFavorites();
        htmlFavoriteName.value = '';
        htmlFavoriteTags.value = '';
    });

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

        sectionNavigation.update();
        sectionNavigation.markActiveSection();
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
        if (activeTabId) {
            const closingId = activeTabId;
            closeTab(closingId);
            return;
        }
        if (openNoteTabs.length > 0) {
            while (openNoteTabs.length) {
                closeTab(openNoteTabs[0].id);
            }
            return;
        }
        hideModal(notesModal);
        activeNoteIcon = null;
        currentNoteRow = null;
        currentNotesArray = [];
        activeNoteIndex = 0;
        activeTabId = null;
        resetHistory('<p><br></p>');
        manualReadOnly = false;
        noteLocked = false;
        updateEditorReadOnlyState();
    }

    function saveCurrentNote(index = activeNoteIndex) {
        if (!currentNoteRow || !currentNotesArray || currentNotesArray.length === 0) return;
        if (index < 0 || index >= currentNotesArray.length) return;

        const currentContent = notesEditor.innerHTML;
        const currentTitle = notesModalTitle.textContent.trim();

        // Keep existing postits and quick note data
        const existingPostits = currentNotesArray[index].postits || {};
        const existingQuickNote = currentNotesArray[index].quickNote || '';
        const existingLocked = !!currentNotesArray[index].locked;
        currentNotesArray[index] = {
            title: currentTitle,
            content: currentContent,
            lastEdited: new Date().toISOString(),
            postits: existingPostits,
            quickNote: existingQuickNote,
            locked: existingLocked
        };

        const noteType = activeNoteIcon.dataset.noteType;
        if (noteType === 'section') {
            currentNoteRow.dataset.sectionNote = JSON.stringify(currentNotesArray);
        } else if (noteType === 'mapa') {
            currentNoteRow.dataset.mapaNotes = JSON.stringify(currentNotesArray);
        } else {
            currentNoteRow.dataset.notes = JSON.stringify(currentNotesArray);
        }

        const currentTab = openNoteTabs.find(t => t.id === activeTabId);
        if (currentTab) currentTab.notesArray = currentNotesArray;
        
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
            initAllResizableElements(notesEditor);
        }, 50);
    }
    function initTableResize(element) {
        if (!element) return;
        element.querySelector('.table-resize-handle')?.remove();
        element.querySelector('.table-resize-guide')?.remove();
        if (element instanceof HTMLTableElement) {
            element.classList.add('resizable-table');
            element.classList.remove('resizable-block');
        } else {
            element.classList.add('resizable-block');
            element.classList.remove('resizable-table');
        }
        element.removeAttribute('data-resizable-initialized');
        makeTableResizable(element);
    }

    function wrapClinicalNoteBlocks(root) {
        if (!root) return;
        const headers = root.querySelectorAll('.nota-clinica__header');
        headers.forEach(header => {
            if (header.closest('.nota-clinica')) return;
            const container = document.createElement('div');
            container.className = 'nota-clinica';
            const parent = header.parentNode;
            const bodyCandidate = header.nextElementSibling;
            parent.insertBefore(container, header);
            container.appendChild(header);
            if (bodyCandidate && bodyCandidate.classList.contains('nota-clinica__body')) {
                container.appendChild(bodyCandidate);
            }
        });
        const bodies = root.querySelectorAll('.nota-clinica__body');
        bodies.forEach(body => {
            if (body.closest('.nota-clinica')) return;
            const container = document.createElement('div');
            container.className = 'nota-clinica';
            const parent = body.parentNode;
            parent.insertBefore(container, body);
            container.appendChild(body);
        });
    }

    function initAllResizableElements(root = notesEditor) {
        if (!root) return;
        wrapClinicalNoteBlocks(root);
        root.querySelectorAll('table').forEach(initTableResize);
        root.querySelectorAll('.nota-clinica').forEach(initTableResize);
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

            if (note.locked) {
                const lockBadge = document.createElement('span');
                lockBadge.className = 'note-lock-indicator';
                lockBadge.textContent = '🔒';
                btn.appendChild(lockBadge);
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
        if (index !== activeNoteIndex && currentNotesArray.length > 0) {
            saveCurrentNote(activeNoteIndex);
        }
        if (index < 0 || index >= currentNotesArray.length) {
            if (currentNotesArray.length === 0) {
               addNewNote(false);
               return;
            }
            index = 0; // fallback to the first note
        }

        activeNoteIndex = index;
        const note = currentNotesArray[index];

        const currentTab = openNoteTabs.find(t => t.id === activeTabId);
        if (currentTab) currentTab.activeIndex = index;

        notesModalTitle.textContent = note.title || `Nota ${index + 1}`;
        notesEditor.innerHTML = note.content || '<p><br></p>';
        initAllResizableElements(notesEditor);
        resetHistory(notesEditor.innerHTML);

        manualReadOnly = false;
        noteLocked = !!note.locked;
        updateEditorReadOnlyState();

        renderNotesList();
        notesEditor.focus({ preventScroll: true });
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
            quickNote: '',
            locked: false
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

    function renderNoteTabs() {
        if (!noteTabs) return;
        noteTabs.innerHTML = '';
        openNoteTabs.forEach(tab => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'note-tab' + (tab.id === activeTabId ? ' active' : '');
            tabBtn.textContent = tab.title;
            tabBtn.dataset.tabId = tab.id;
            const close = document.createElement('span');
            close.className = 'close-tab';
            close.textContent = '×';
            close.addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(tab.id);
            });
            tabBtn.appendChild(close);
            tabBtn.addEventListener('click', () => switchToTab(tab.id));
            noteTabs.appendChild(tabBtn);
        });
        if (noteTabsBar) {
            const show = openNoteTabs.length > 0 && (!tabBarToggle || tabBarToggle.checked);
            noteTabsBar.classList.toggle('hidden', !show);
            showTabBarBtn.classList.toggle('hidden', show || openNoteTabs.length === 0);
        }
        updateTabNav();
    }

    function saveActiveTab() {
        if (!activeTabId) return;
        const tab = openNoteTabs.find(t => t.id === activeTabId);
        if (!tab) return;
        saveCurrentNote();
        tab.notesArray = currentNotesArray;
        tab.activeIndex = activeNoteIndex;
    }

    function loadTab(tab) {
        currentNoteRow = tab.row;
        activeNoteIcon = tab.icon;
        currentNotesArray = tab.notesArray;
        activeNoteIndex = tab.activeIndex || 0;
        loadNoteIntoEditor(activeNoteIndex);
    }

    function switchToTab(id) {
        saveActiveTab();
        const tab = openNoteTabs.find(t => t.id === id);
        if (!tab) return;
        activeTabId = id;
        loadTab(tab);
        renderNoteTabs();
        showModal(notesModal);
    }

    function closeTab(id) {
        const index = openNoteTabs.findIndex(t => t.id === id);
        const found = index !== -1;
        const closingActive = found && openNoteTabs[index].id === activeTabId;
        if (closingActive) {
            saveActiveTab();
        }
        if (found) {
            openNoteTabs.splice(index, 1);
        }
        const tabBtn = noteTabs?.querySelector(`[data-tab-id="${id}"]`);
        tabBtn?.remove();
        if (openNoteTabs.length > 0) {
            if (closingActive) {
                activeTabId = openNoteTabs[0].id;
                loadTab(openNoteTabs[0]);
            }
            renderNoteTabs();
        } else {
            activeTabId = null;
            hideModal(notesModal);
            renderNoteTabs();
            activeNoteIcon = null;
            currentNoteRow = null;
            currentNotesArray = [];
            activeNoteIndex = 0;
            resetHistory('<p><br></p>');
        }
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
        notesEditor.focus({ preventScroll: true });
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
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        if (!range || !notesEditor.contains(range.commonAncestorContainer)) return;

        const insertionRange = range.cloneRange();
        insertionRange.collapse(true);

        const uniqueId = `inline-note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const icon = document.createElement('span');
        icon.className = 'inline-note';
        icon.dataset.subnoteId = uniqueId;
        icon.textContent = currentInlineNoteIcon;
        icon.contentEditable = 'false';

        insertionRange.insertNode(icon);

        const spacer = document.createTextNode('\u00A0');
        icon.parentNode.insertBefore(spacer, icon.nextSibling);

        const newRange = document.createRange();
        newRange.setStartAfter(spacer);
        newRange.collapse(true);

        const deferredRange = newRange.cloneRange();
        selection.removeAllRanges();
        selection.addRange(newRange);

        setTimeout(() => {
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(deferredRange);
            }
            notesEditor.focus({ preventScroll: true });
        }, 0);

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
        let currentCoverList = null;
        let counter = 1;
        let lastElementWasCover = false;
        let currentSectionId = null;

        for (const row of rows) {
            if (row.classList.contains('section-header-row')) {
                const sectionTitle = row.querySelector('.section-title')?.textContent || '';
                const sectionId = row.dataset.sectionHeader;
                currentSectionId = sectionId;
                const sectionTopicCount = document.querySelectorAll(`tr[data-section="${sectionId}"]`).length;
                const header = document.createElement('h2');
                header.textContent = sectionTitle;
                const countSpanHeader = document.createElement('span');
                countSpanHeader.textContent = ` (${sectionTopicCount})`;
                countSpanHeader.className = 'section-topic-count';
                header.appendChild(countSpanHeader);
                indexContainer.appendChild(header);
                currentOl = document.createElement('ol');
                currentOl.start = counter;
                indexContainer.appendChild(currentOl);

                const cover = document.createElement('div');
                cover.className = 'section-cover-page';
                cover.id = `print-section-${sectionId}`;
                if (printArea.children.length > 0) {
                    cover.style.pageBreakBefore = 'always';
                }
                const titleEl = document.createElement('h1');
                titleEl.textContent = sectionTitle;
                const countSpan = document.createElement('span');
                countSpan.textContent = ` (${sectionTopicCount})`;
                countSpan.className = 'section-topic-count';
                titleEl.appendChild(countSpan);
                cover.appendChild(titleEl);
                const imgSrc = row.dataset.coverImage;
                if (imgSrc) {
                    const imgEl = document.createElement('img');
                    imgEl.src = imgSrc;
                    cover.appendChild(imgEl);
                }
                const authorEl = document.createElement('p');
                authorEl.className = 'author-info';
                authorEl.textContent = 'Dr Daniel Opazo, Medicina Interna, Universidad de Valparaíso, Chile 2025';
                cover.appendChild(authorEl);

                const list = document.createElement('ol');
                list.className = 'section-cover-topics';
                cover.appendChild(list);
                currentCoverList = list;

                printArea.appendChild(cover);
                lastElementWasCover = true;
                continue;
            } else {
                const topicId = row.dataset.topicId;
                const title = row.cells[1]?.textContent.trim() || '';
                const topicData = await db.get('topics', topicId);
                const hasNotes = topicData && Array.isArray(topicData.notes) && topicData.notes.length > 0;
                const sectionId = currentSectionId;

                if (currentOl) {
                    const li = document.createElement('li');
                    const link = document.createElement('a');
                    link.href = `#print-${topicId}`;
                    link.textContent = title;
                    link.className = hasNotes ? 'topic-developed' : 'topic-pending';
                    li.appendChild(link);
                    currentOl.appendChild(li);
                }

                if (currentCoverList) {
                    const liCover = document.createElement('li');
                    const linkCover = document.createElement('a');
                    const globalNum = counter;
                    linkCover.href = `#print-${topicId}`;
                    linkCover.textContent = `- ${globalNum}. ${title}`;
                    linkCover.className = hasNotes ? 'topic-developed' : 'topic-pending';
                    liCover.appendChild(linkCover);
                    currentCoverList.appendChild(liCover);
                }

                const topicWrapper = document.createElement('div');
                topicWrapper.id = `print-${topicId}`;
                topicWrapper.className = 'topic-print-wrapper';
                if (lastElementWasCover) {
                    topicWrapper.style.pageBreakBefore = 'auto';
                    lastElementWasCover = false;
                }

                const backLink = document.createElement('a');
                backLink.href = '#print-index';
                backLink.textContent = '↩ Volver al índice';
                backLink.className = 'back-to-index';
                topicWrapper.appendChild(backLink);

                const titleEl = document.createElement('h2');
                titleEl.textContent = `${counter}. ${title}`;
                const topLink = document.createElement('a');
                topLink.href = `#print-section-${sectionId}`;
                topLink.textContent = '🔝';
                topLink.className = 'back-to-section';
                titleEl.appendChild(topLink);
                if (!hasNotes) {
                    titleEl.style.color = '#9ca3af';
                }
                topicWrapper.appendChild(titleEl);

                if (hasNotes) {
                    const note = topicData.notes[0];
                    const noteContent = document.createElement('div');
                    noteContent.innerHTML = note.content;
                    noteContent.querySelectorAll('a.subnote-link, a.postit-link, a.gallery-link').forEach(link => {
                        link.outerHTML = `<span>${link.innerHTML}</span>`;
                    });
                    topicWrapper.appendChild(noteContent);
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

    async function handlePrintSection(sectionHeaderRow, targetType = 'lectura') {
        const sectionId = sectionHeaderRow.dataset.sectionHeader;
        const topicRows = document.querySelectorAll(`tr[data-section="${sectionId}"]`);
        const allTopicRows = document.querySelectorAll('tr[data-topic-id]');
        const globalNumbers = {};
        let gCounter = 1;
        allTopicRows.forEach(r => {
            globalNumbers[r.dataset.topicId] = gCounter++;
        });
        const printArea = getElem('print-area');
        printArea.innerHTML = '';

        const noteField = targetType === 'mapa' ? 'mapaNotes' : 'notes';
        const emptyPlaceholder = targetType === 'mapa' ? 'Mapa no desarrollado.' : 'Tema no desarrollado.';
        const emptyAlert = targetType === 'mapa' ? 'No hay mapas que imprimir en esta sección.' : 'No hay notas que imprimir en esta sección.';

        const cover = document.createElement('div');
        cover.className = 'section-cover-page';
        cover.id = `print-section-${sectionId}`;
        const titleText = sectionHeaderRow.querySelector('.section-title')?.textContent || '';
        const topicCount = topicRows.length;
        const titleEl = document.createElement('h1');
        titleEl.textContent = titleText;
        const countSpan = document.createElement('span');
        countSpan.textContent = ` (${topicCount})`;
        countSpan.className = 'section-topic-count';
        titleEl.appendChild(countSpan);
        cover.appendChild(titleEl);
        const imgSrc = sectionHeaderRow.dataset.coverImage;
        if (imgSrc) {
            const imgEl = document.createElement('img');
            imgEl.src = imgSrc;
            cover.appendChild(imgEl);
        }
        const authorEl = document.createElement('p');
        authorEl.className = 'author-info';
        authorEl.textContent = 'Dr Daniel Opazo, Medicina Interna, Universidad de Valparaíso, Chile 2025';
        cover.appendChild(authorEl);

        const list = document.createElement('ol');
        list.className = 'section-cover-topics';
        cover.appendChild(list);

        printArea.appendChild(cover);

        let first = true;
        let localCounter = 1;
        for (const row of topicRows) {
            const topicId = row.dataset.topicId;
            const title = row.cells[1]?.textContent.trim() || '';
            const topicData = await db.get('topics', topicId);
            const notesArray = topicData && Array.isArray(topicData[noteField]) ? topicData[noteField] : [];
            const hasNotes = notesArray.length > 0;

            const li = document.createElement('li');
            const link = document.createElement('a');
            const globalNum = globalNumbers[topicId];
            link.href = `#print-${topicId}`;
            link.textContent = `- ${globalNum}. ${title}`;
            link.className = hasNotes ? 'topic-developed' : 'topic-pending';
            li.appendChild(link);
            list.appendChild(li);

            const topicWrapper = document.createElement('div');
            topicWrapper.id = `print-${topicId}`;
            topicWrapper.className = 'topic-print-wrapper';
            if (first) {
                topicWrapper.style.pageBreakBefore = 'auto';
                first = false;
            }

            const titleEl = document.createElement('h2');
            titleEl.textContent = `${localCounter}. ${title}`;
            const topLink = document.createElement('a');
            topLink.href = `#print-section-${sectionId}`;
            topLink.textContent = '🔝';
            topLink.className = 'back-to-section';
            titleEl.appendChild(topLink);
            if (!hasNotes) {
                titleEl.style.color = '#9ca3af';
            }
            topicWrapper.appendChild(titleEl);

            if (hasNotes) {
                const note = notesArray[0];
                const noteContent = document.createElement('div');
                noteContent.innerHTML = note.content;
                noteContent.querySelectorAll('a.subnote-link, a.postit-link, a.gallery-link').forEach(link => {
                    link.outerHTML = `<span>${link.innerHTML}</span>`;
                });
                topicWrapper.appendChild(noteContent);
            } else {
                const placeholder = document.createElement('p');
                placeholder.textContent = emptyPlaceholder;
                topicWrapper.appendChild(placeholder);
            }
            printArea.appendChild(topicWrapper);
            localCounter++;
        }

        if (!printArea.querySelector('.topic-print-wrapper')) {
            printArea.innerHTML = '';
            await showAlert(emptyAlert);
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

            // Mapa cell click (excluding note icon)
            if (cell.classList.contains('mapa-cell') && !target.closest('.note-icon')) {
                const counter = cell.querySelector('.mapa-counter');
                if (counter) {
                    let count = parseInt(counter.textContent, 10);
                    count = (count + 1) % 2; // Simple toggle between 0 and 1
                    counter.textContent = count;
                    cell.classList.toggle('mapa-filled', count > 0);
                    updateAllTotals();
                    saveState();
                }
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

            // Cover image upload icon click
            if (target.closest('.section-cover-icon')) {
                e.stopPropagation();
                const input = target.closest('.section-cover-icon').querySelector('.section-cover-input');
                if (input) input.click();
                return;
            }

            // Note icon click
            if (target.closest('.note-icon')) {
                e.stopPropagation();
                activeNoteIcon = target.closest('.note-icon');
                currentNoteRow = activeNoteIcon.closest('tr');
                const noteType = activeNoteIcon.dataset.noteType;

                let noteId;
                let notesDataString;
                if (noteType === 'section') {
                    const sectionKey = currentNoteRow.dataset.sectionHeader || `section-${Date.now()}`;
                    noteId = `section-${sectionKey}`;
                    notesDataString = currentNoteRow.dataset.sectionNote || '[]';
                } else {
                    const topicKey = currentNoteRow.dataset.topicId || `topic-${Date.now()}`;
                    if (noteType === 'mapa') {
                        noteId = `${topicKey}-mapa`;
                        notesDataString = currentNoteRow.dataset.mapaNotes || '[]';
                    } else {
                        noteId = topicKey;
                        notesDataString = currentNoteRow.dataset.notes || '[]';
                    }
                }

                let parsed = [];
                try {
                    parsed = JSON.parse(notesDataString);
                } catch (err) {
                    console.error("Error parsing notes data:", err);
                }

                let tab = openNoteTabs.find(t => t.id === noteId);
                const baseTitle = currentNoteRow.cells[1]?.textContent.trim() || 'Nota';
                let tabTitle = baseTitle;
                if (noteType === 'section') {
                    const sectionTitle = currentNoteRow.querySelector('.section-title')?.textContent.trim();
                    if (sectionTitle) {
                        tabTitle = sectionTitle;
                    }
                } else if (noteType === 'mapa') {
                    tabTitle = `${baseTitle} · Mapa`;
                }
                if (!tab) {
                    tab = { id: noteId, row: currentNoteRow, icon: activeNoteIcon, notesArray: parsed, activeIndex: 0, title: tabTitle };
                    openNoteTabs.push(tab);
                } else {
                    tab.notesArray = parsed;
                    tab.row = currentNoteRow;
                    tab.icon = activeNoteIcon;
                    tab.title = tabTitle;
                }
                activeTabId = noteId;
                loadTab(tab);
                renderNoteTabs();
                notesSidePanel.classList.remove('open');
                notesPanelToggle.classList.remove('open');
                notesMainContent.style.width = '';
                notesSidePanel.style.width = '220px';

                const modalContent = notesModal.querySelector('.notes-modal-content');
                modalContent.classList.remove('readonly-mode');
                notesEditor.contentEditable = true;
                notesModalTitle.contentEditable = true;

                showModal(notesModal);
                return;
            }
        });

        tableBody.addEventListener('change', async (e) => {
            const input = e.target.closest('.section-cover-input');
            if (input && input.files && input.files[0]) {
                const file = input.files[0];
                const reader = new FileReader();
                reader.onload = async () => {
                    const headerRow = input.closest('tr.section-header-row');
                    if (headerRow) {
                        headerRow.dataset.coverImage = reader.result;
                        const icon = headerRow.querySelector('.section-cover-icon');
                        if (icon) icon.classList.add('has-cover');
                        await saveState();
                    }
                    input.value = '';
                };
                reader.readAsDataURL(file);
            }
        });

        tableBody.addEventListener('input', (e) => {
            if (e.target.closest('.section-header-row')) {
                sectionNavigation.update();
                sectionNavigation.markActiveSection();
            }
        });

        // Section header collapse/expand
        tableBody.addEventListener('click', (e) => {
            const headerRow = e.target.closest('.section-header-row');
            if (!headerRow) return;

            // Prevent toggle when clicking on note or print icons
            if (
                e.target.closest('.note-icon') ||
                e.target.closest('.print-section-btn') ||
                e.target.closest('.save-section-html-btn')
            ) {
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
            sectionNavigation.markActiveSection();
        });

        // Section print button
        tableBody.addEventListener('click', (e) => {
            const printBtn = e.target.closest('.print-section-btn');
            if (printBtn) {
                e.stopPropagation();
                const sectionHeaderRow = printBtn.closest('.section-header-row');
                const targetType = printBtn.dataset.printTarget || 'lectura';
                handlePrintSection(sectionHeaderRow, targetType);
            }
        });

        tableBody.addEventListener('click', (e) => {
            const exportBtn = e.target.closest('.save-section-html-btn');
            if (exportBtn) {
                e.stopPropagation();
                const sectionHeaderRow = exportBtn.closest('.section-header-row');
                exportSectionToHtml(sectionHeaderRow);
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

        window.addEventListener('scroll', () => sectionNavigation.markActiveSection());
        window.addEventListener('resize', () => {
            sectionNavigation.update();
            sectionNavigation.markActiveSection();
        });
        setTimeout(() => sectionNavigation.markActiveSection(), 200);

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

        if (askNotesBtn) {
            askNotesBtn.addEventListener('click', async () => {
                const question = prompt('¿Qué deseas preguntar sobre las notas?');
                if (!question) return;
                const topics = await db.getAll('topics');
                const notesText = topics.flatMap(t => (t.notes || []).map(n => {
                    const tmp = document.createElement('div');
                    tmp.innerHTML = n.content || '';
                    return tmp.textContent || '';
                })).join('\n');
                try {
                    const answer = await askNotesQuestion(question, notesText);
                    alert(answer);
                } catch (err) {
                    console.error('AI question error', err);
                    alert('No se pudo obtener una respuesta.');
                }
            });
        }

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

        if (toggleReadOnlyBtn) {
            toggleReadOnlyBtn.addEventListener('click', () => {
                if (noteLocked) return;
                manualReadOnly = !manualReadOnly;
                updateEditorReadOnlyState();
            });
        }

        if (lockNoteBtn) {
            lockNoteBtn.addEventListener('click', () => {
                noteLocked = !noteLocked;
                if (noteLocked) {
                    manualReadOnly = false;
                }
                if (currentNotesArray[activeNoteIndex]) {
                    currentNotesArray[activeNoteIndex].locked = noteLocked;
                    const noteType = activeNoteIcon?.dataset.noteType;
                    if (noteType === 'section') {
                        currentNoteRow.dataset.sectionNote = JSON.stringify(currentNotesArray);
                    } else if (noteType === 'mapa') {
                        currentNoteRow.dataset.mapaNotes = JSON.stringify(currentNotesArray);
                    } else {
                        currentNoteRow.dataset.notes = JSON.stringify(currentNotesArray);
                    }
                    const currentTab = openNoteTabs.find(t => t.id === activeTabId);
                    if (currentTab) currentTab.notesArray = currentNotesArray;
                    saveState();
                    renderNotesList();
                }
                updateEditorReadOnlyState();
            });
        }

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
                        initAllResizableElements(notesEditor);
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
                 notesEditor.focus({ preventScroll: true });
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

             // Handle table selection
             const resizable = e.target.closest('table, .nota-clinica');
             if (resizable && notesEditor.contains(resizable)) {
                 notesEditor.querySelectorAll('table, .nota-clinica').forEach(el => el.classList.remove('selected-for-move'));
                 resizable.classList.add('selected-for-move');
                 selectedTableForMove = resizable;
             } else {
                 notesEditor.querySelectorAll('table, .nota-clinica').forEach(el => el.classList.remove('selected-for-move'));
                 selectedTableForMove = null;
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

            const callout = e.target.closest('.note-callout');
            if (callout) {
                if (activeResizableCallout !== callout) {
                    removeCalloutResizeHandles(activeResizableCallout);
                    addCalloutResizeHandles(callout);
                    activeResizableCallout = callout;
                }
            } else {
                removeCalloutResizeHandles(activeResizableCallout);
                activeResizableCallout = null;
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
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                // After allowing the browser to create the new line, remove any
                // formatting that might have been inherited from the previous
                // block. This ensures the new line starts with default styles.
                setTimeout(() => {
                    const sel = window.getSelection();
                    if (!sel.rangeCount) return;

                    let node = sel.anchorNode;
                    if (node && node.nodeType === Node.TEXT_NODE) {
                        node = node.parentNode;
                    }
                    const block = node?.closest('p, h1, h2, h3, h4, h5, h6, div, blockquote, pre, li');
                    if (block && block !== notesEditor && block.innerHTML === '<br>') {
                        block.removeAttribute('style');
                        block.removeAttribute('class');
                        if (block.tagName !== 'LI') {
                            document.execCommand('formatBlock', false, 'p');
                        }
                    }
                }, 0);
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
                textColor: noteTextColorInput.value,
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
                applyNoteStyle({ presetClass: btn.dataset.class });
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

    const updateEditorReadOnlyState = () => {
        const modalContent = notesModal.querySelector('.notes-modal-content');
        const isReadOnly = noteLocked || manualReadOnly;
        modalContent.classList.toggle('readonly-mode', isReadOnly);
        modalContent.classList.toggle('locked-note', noteLocked);
        notesEditor.contentEditable = !isReadOnly;
        notesModalTitle.contentEditable = !isReadOnly;
        if (toggleReadOnlyBtn) {
            toggleReadOnlyBtn.disabled = noteLocked;
            toggleReadOnlyBtn.classList.toggle('active', manualReadOnly && !noteLocked);
        }
        if (lockNoteBtn) {
            lockNoteBtn.classList.toggle('active', noteLocked);
            lockNoteBtn.setAttribute('aria-pressed', noteLocked ? 'true' : 'false');
            lockNoteBtn.title = noteLocked ? 'Nota bloqueada' : 'Bloquear nota';
            lockClosedIcon?.classList.toggle('hidden', !noteLocked);
            lockOpenIcon?.classList.toggle('hidden', noteLocked);
        }
        if (hideInlineColorControlsFn) hideInlineColorControlsFn();
    };


    function init() {
        initializeCells();
        setupEditorToolbar();
        updateEditorReadOnlyState();
        setupImageTools(notesEditor, editorToolbar);
        populateIconPicker();
        loadState();
        setupEventListeners();
        document.querySelectorAll('table').forEach(tbl => {
            if (!notesEditor || !notesEditor.contains(tbl)) {
                initTableResize(tbl);
            }
        });
        initAllResizableElements(notesEditor);
        applyTheme(document.documentElement.dataset.theme || 'default');
        setupAdvancedSearchReplace();
        setupKeyboardShortcuts();
        setupAdvancedEditing(notesEditor);
        setupCloudIntegration();
    }

    init();
});