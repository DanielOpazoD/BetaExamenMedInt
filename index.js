

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from "@google/genai";

const API_KEY = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';

// --- IndexedDB Helper ---
const db = {
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
    const searchBar = getElem('search-bar');
    const progressBar = getElem('progress-bar');
    const askAiBtn = getElem('ask-ai-btn');
    const aiQaModal = getElem('ai-qa-modal');
    const aiResponseArea = getElem('ai-response-area');
    const aiQaLoader = getElem('ai-qa-loader');
    const aiQuestionInput = getElem('ai-question-input');
    const cancelAiQaBtn = getElem('cancel-ai-qa-btn');
    const sendAiQaBtn = getElem('send-ai-qa-btn');
    const exportBtn = getElem('export-btn');
    const importBtn = getElem('import-btn');
    const importFileInput = getElem('import-file-input');
    const exportNoteBtn = getElem('export-note-btn');
    const importNoteBtn = getElem('import-note-btn');
    const importNoteFileInput = getElem('import-note-file-input');
    const settingsBtn = getElem('settings-btn');
    const settingsDropdown = getElem('settings-dropdown');
    const confidenceFiltersContainer = getElem('confidence-filters');
    const saveConfirmation = getElem('save-confirmation');
    const toggleReadOnlyBtn = getElem('toggle-readonly-btn');
    const toggleAllSectionsBtn = getElem('toggle-all-sections-btn');
    
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

    // Multi-note panel elements
    const notesPanelToggle = getElem('notes-panel-toggle');
    const notesSidePanel = getElem('notes-side-panel');
    const notesList = getElem('notes-list');
    const addNotePanelBtn = getElem('add-note-panel-btn');
    const notesMainContent = getElem('notes-main-content');

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

    // --- State Variables ---
    let activeConfidenceFilter = 'all';
    let activeNoteIcon = null;
    let selectedImageForResize = null;
    let saveTimeout;
    let activeReferencesCell = null;
    let activeIconPickerButton = null;
    let currentNotesArray = [];
    let activeNoteIndex = 0;
    let isResizing = false;
    let resolveConfirmation;


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

        const createButton = (title, content, command, value = null, action = null) => {
            const btn = document.createElement('button');
            btn.className = 'toolbar-btn';
            btn.title = title;
            btn.innerHTML = content;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (command) {
                    document.execCommand(command, false, value);
                }
                if (action) {
                    action(value);
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
                swatch.addEventListener('click', (e) => {
                    e.preventDefault();
                    action(color);
                    submenu.classList.remove('visible');
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
                action(e.target.value);
                notesEditor.focus();
            });
             customColorInput.addEventListener('click', (e) => e.stopPropagation());
            submenu.appendChild(customColorLabel);

            group.appendChild(submenu);

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

        const createSymbolDropdown = (symbols) => {
            const dropdown = document.createElement('div');
            dropdown.className = 'symbol-dropdown';
            
            const btn = document.createElement('button');
            btn.className = 'toolbar-btn';
            btn.title = 'Insertar Símbolo';
            btn.innerHTML = '📌';
            dropdown.appendChild(btn);

            const content = document.createElement('div');
            content.className = 'symbol-dropdown-content';
            symbols.forEach(symbol => {
                const symbolBtn = createButton(symbol, symbol, 'insertText', symbol);
                symbolBtn.classList.add('symbol-btn');
                symbolBtn.addEventListener('click', () => content.classList.remove('visible'));
                content.appendChild(symbolBtn);
            });
            dropdown.appendChild(content);

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const otherOpenDropdowns = document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible');
                otherOpenDropdowns.forEach(dropdownEl => {
                    if (dropdownEl !== content) {
                        dropdownEl.classList.remove('visible');
                    }
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

        editorToolbar.appendChild(createSeparator());

        // Basic formatting
        editorToolbar.appendChild(createButton('Negrita', '<b>B</b>', 'bold'));
        editorToolbar.appendChild(createButton('Cursiva', '<i>I</i>', 'italic'));
        editorToolbar.appendChild(createButton('Subrayado', '<u>U</u>', 'underline'));
        editorToolbar.appendChild(createButton('Tachado', '<s>S</s>', 'strikeThrough'));
        editorToolbar.appendChild(createSeparator());

        // --- Color Palettes ---
        const textColors = ['#000000'];
        const extraTextColors = ['#FF0000', '#0000FF', '#008000', '#FFA500', '#FFFF00', '#800080', '#FFC0CB', '#00FFFF', '#00008B', '#8B0000', '#FF8C00', '#FFD700', '#ADFF2F', '#4B0082', '#48D1CC', '#191970', '#A52A2A', '#F0E68C', '#ADD8E6', '#DDA0DD', '#90EE90', '#FA8072'];
        const highlightColors = ['#FAFAD2']; // Pastel yellow
        const extraHighlightColors = ['transparent', '#FFFFFF', '#FFFF00', '#ADD8E6', '#F0FFF0', '#FFF0F5', '#F5FFFA', '#F0F8FF', '#E6E6FA', '#FFF5EE', '#FAEBD7', '#FFE4E1', '#FFFFE0', '#D3FFD3', '#B0E0E6', '#FFB6C1', '#F5DEB3', '#C8A2C8', '#FFDEAD', '#E0FFFF', '#FDF5E6', '#FFFACD', '#F8F8FF'];
        
        const applyForeColor = (color) => document.execCommand('foreColor', false, color);
        const applyHiliteColor = (color) => document.execCommand('hiliteColor', false, color);
        
        const applyLineHighlight = (color) => {
            let elements = getSelectedBlockElements();
            if (elements.length === 0 || (elements.length === 1 && !elements[0])) {
                document.execCommand('formatBlock', false, 'p');
                elements = getSelectedBlockElements();
            }
            elements.forEach(block => {
                if (block && notesEditor.contains(block)) {
                    block.style.backgroundColor = color === 'transparent' ? '' : color;
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

        const hrBtn = createButton('Insertar línea separadora', '—', 'insertHorizontalRule');
        editorToolbar.appendChild(hrBtn);
        editorToolbar.appendChild(createSeparator());

        const outdentSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-indent-decrease w-5 h-5"><polyline points="7 8 3 12 7 16"/><line x1="21" x2="3" y1="12" y2="12"/><line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="3" y1="18" y2="18"/></svg>`;
        const indentSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-indent-increase w-5 h-5"><polyline points="17 8 21 12 17 16"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="17" y1="6" y2="6"/><line x1="3" x2="17" y1="18" y2="18"/></svg>`;
        editorToolbar.appendChild(createButton('Disminuir sangría', outdentSVG, 'outdent'));
        editorToolbar.appendChild(createButton('Aumentar sangría', indentSVG, 'indent'));
        
        const accordionSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-square w-5 h-5"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`;
        const accordionHTML = `<details><summary>Título</summary><div>Contenido...<br></div></details><p><br></p>`;
        
        editorToolbar.appendChild(createButton('Insertar bloque colapsable', accordionSVG, 'insertHTML', accordionHTML));
        
        editorToolbar.appendChild(createSeparator());
        
        // Symbols
        const symbols = ["💡", "⚠️", "📌", "📍", "✴️", "🟢", "🟡", "🔴", "✅", "☑️", "❌", "➡️", "⬅️", "➔", "👉", "↳", "▪️", "▫️", "🔵", "🔹", "🔸", "➕", "➖", "📂", "📄", "📝", "📋", "📎", "🔑", "📈", "📉", "🩺", "💉", "💊", "🩸", "🧪", "🔬", "🩻", "🦠"];
        editorToolbar.appendChild(createSymbolDropdown(symbols));

        // Image controls
        const imageBtn = createButton('Insertar Imagen desde URL', '🖼️', null);
        imageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const url = prompt("Ingresa la URL de la imagen:");
            if (url) {
                notesEditor.focus();
                document.execCommand('insertImage', false, url);
            }
        });
        editorToolbar.appendChild(imageBtn);
        
        const resizePlusBtn = createButton('Aumentar tamaño de imagen (+10%)', '+', null);
        resizePlusBtn.addEventListener('click', () => resizeSelectedImage(1.1));
        editorToolbar.appendChild(resizePlusBtn);

        const resizeMinusBtn = createButton('Disminuir tamaño de imagen (-10%)', '-', null);
        resizeMinusBtn.addEventListener('click', () => resizeSelectedImage(0.9));
        editorToolbar.appendChild(resizeMinusBtn);
        editorToolbar.appendChild(createSeparator());

        // Print/Save
        const printBtn = createButton('Imprimir o Guardar como PDF', '💾', null);
        printBtn.addEventListener('click', () => {
             const printArea = getElem('print-area');
             printArea.innerHTML = `<h1>${notesModalTitle.innerText}</h1><div>${notesEditor.innerHTML}</div>`;
             window.print();
        });
        editorToolbar.appendChild(printBtn);
    }

    function resizeSelectedImage(multiplier) {
        if (selectedImageForResize) {
            const currentWidth = selectedImageForResize.style.width
                ? parseFloat(selectedImageForResize.style.width)
                : selectedImageForResize.naturalWidth;
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

            const migrationDone = await db.get('keyvalue', 'migrationComplete');
            if (migrationDone) {
                await loadStateFromDB();
                return;
            }

            // --- ONE-TIME MIGRATION from localStorage to IndexedDB ---
            const manifestStr = localStorage.getItem('temarioManifest');
            const oldStateStr = localStorage.getItem('temarioProgresoV2');

            if (manifestStr || oldStateStr) {
                console.log("Old data found in localStorage, migrating to IndexedDB...");
                await showAlert("Actualizando formato de guardado para un mayor rendimiento. Esto solo pasará una vez.");

                let stateToMigrate;
                if (manifestStr) { // Granular format
                    const manifest = JSON.parse(manifestStr);
                    stateToMigrate = { topics: {}, sections: {}, settings: {}, headers: {} };
                    stateToMigrate.settings = JSON.parse(localStorage.getItem('app-settings') || '{}');
                    stateToMigrate.headers = JSON.parse(localStorage.getItem('app-headers') || '{}');
                    manifest.topics.forEach(topicId => {
                        const topicStr = localStorage.getItem(`topic-${topicId}`);
                        if (topicStr) stateToMigrate.topics[topicId] = JSON.parse(topicStr);
                    });
                    manifest.sections.forEach(sectionId => {
                        const sectionStr = localStorage.getItem(`section-${sectionId}`);
                        if (sectionStr) stateToMigrate.sections[sectionId] = JSON.parse(sectionStr);
                    });
                } else { // Single object format
                    stateToMigrate = JSON.parse(oldStateStr);
                }

                _loadStateFromObject(stateToMigrate);
                await saveState(); 
                await db.set('keyvalue', { key: 'migrationComplete', value: true });

                // Clean up old localStorage
                if (manifestStr) {
                    const manifest = JSON.parse(manifestStr);
                    manifest.topics.forEach(id => localStorage.removeItem(`topic-${id}`));
                    manifest.sections.forEach(id => localStorage.removeItem(`section-${id}`));
                    localStorage.removeItem('app-settings');
                    localStorage.removeItem('app-headers');
                    localStorage.removeItem('temarioManifest');
                }
                if (oldStateStr) localStorage.removeItem('temarioProgresoV2');
                
                console.log("Migration to IndexedDB successful.");
                await showAlert("Actualización completada.");

            } else {
                // This is a fresh install, no localStorage data to migrate.
                console.log("No old data found. Setting up fresh IndexedDB store.");
                await db.set('keyvalue', { key: 'migrationComplete', value: true });
                await loadStateFromDB(); // Load default/empty state.
            }
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

    function filterTable() {
        const query = searchBar.value.toLowerCase().trim();
        const allTopicRows = document.querySelectorAll('#table-body tr[data-topic-id]');
        
        // This object will track if a section has any visible rows after filtering
        const sectionVisibility = {};
        Object.keys(sections).forEach(name => sectionVisibility[name] = false);

        allTopicRows.forEach(row => {
            const topicText = row.querySelector('.topic-text')?.textContent.toLowerCase() || '';
            const confidence = row.querySelector('.confidence-dot')?.dataset.confidenceLevel || '0';

            // Determine if the row should be visible based on filters
            const matchesSearch = query === '' || topicText.includes(query);
            const matchesConfidence = activeConfidenceFilter === 'all' || confidence === activeConfidenceFilter;

            if (matchesSearch && matchesConfidence) {
                row.style.display = '';
                const sectionName = row.dataset.section;
                if(sectionName) {
                    sectionVisibility[sectionName] = true;
                }
            } else {
                row.style.display = 'none';
            }
        });
        
        // Now, show/hide section headers and totals based on whether they have visible rows
        const isFilteringActive = query !== '' || activeConfidenceFilter !== 'all';

        document.querySelectorAll('.section-header-row').forEach(headerRow => {
            const sectionName = headerRow.dataset.sectionHeader;
            const totalRow = document.getElementById(`total-row-${sectionName}`);
            
            // If any filter is active, hide sections that have no visible children
            if (isFilteringActive) {
                const shouldBeVisible = sectionVisibility[sectionName];
                headerRow.style.display = shouldBeVisible ? '' : 'none';
                if (totalRow) {
                    totalRow.style.display = shouldBeVisible ? '' : 'none';
                }
            } else {
                // If no filters are active, respect the collapsed/expanded state
                headerRow.style.display = '';
                if (totalRow) {
                    totalRow.style.display = '';
                }
                 const isCollapsed = headerRow.classList.contains('collapsed');
                 document.querySelectorAll(`tr[data-section="${sectionName}"]`).forEach(topicRow => {
                    topicRow.style.display = isCollapsed ? 'none' : '';
                 });
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
    
    function populateIconPicker() {
        iconPickerCategories.innerHTML = '';
        emojiGrid.innerHTML = '';
        
        Object.keys(EMOJI_CATEGORIES).forEach((category, index) => {
            const btn = document.createElement('button');
            btn.className = 'category-btn';
            btn.textContent = category;
            btn.dataset.category = category;
            if (index === 0) {
                btn.classList.add('active');
                loadEmojisForCategory(category);
            }
            iconPickerCategories.appendChild(btn);
        });
    }

    function loadEmojisForCategory(category) {
        emojiGrid.innerHTML = '';
        const emojis = EMOJI_CATEGORIES[category] || [];
        emojis.forEach(emoji => {
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

    // --- Event Listeners ---
    tableBody.addEventListener('click', async (e) => {
        const target = e.target;
    
        // Print Section Button Click
        const printBtn = target.closest('.print-section-btn');
        if (printBtn) {
            e.stopPropagation();
            const headerRow = printBtn.closest('.section-header-row');
            const sectionId = headerRow.dataset.sectionHeader;
            const sectionTitle = headerRow.querySelector('.section-title').textContent;
    
            const printArea = getElem('print-area');
            let combinedContent = `<h1>${sectionTitle}</h1>`;
    
            const sectionNoteContent = headerRow.dataset.sectionNote || '';
            if (sectionNoteContent) {
                combinedContent += `<h2>Nota de la sección</h2><div>${sectionNoteContent}</div><hr>`;
            }
    
            const topicRows = document.querySelectorAll(`tr[data-section="${sectionId}"]`);
            for (const row of topicRows) {
                const topicId = row.dataset.topicId;
                const topicData = await db.get('topics', topicId);
                if (topicData && topicData.notes && topicData.notes.length > 0) {
                    topicData.notes.forEach(note => {
                        if (note.content && note.content.trim() && note.content.trim() !== '<p><br></p>') {
                            combinedContent += `<h3>${note.title}</h3><div>${note.content}</div><hr style="margin: 2em 0;">`;
                        }
                    });
                }
            }
    
            printArea.innerHTML = combinedContent;
            window.print();
            printArea.innerHTML = ''; // Clean up
            return; // Exit after handling print
        }
    
        // Confidence Dot Click
        if (target.classList.contains('confidence-dot')) {
            let currentLevel = parseInt(target.dataset.confidenceLevel, 10);
            currentLevel = (currentLevel + 1) % 4; // Cycles 0 -> 1 -> 2 -> 3 -> 0
            target.dataset.confidenceLevel = currentLevel;
            filterTable(); // Apply filter after changing confidence
            saveState();
            return;
        }
    
        const cell = target.closest('td');
        if (!cell) return;
    
        // Lectura cell click
        if (cell.classList.contains('lectura-cell')) {
            const counter = cell.querySelector('.lectura-counter');
            if (counter) {
                let count = parseInt(counter.textContent, 10);
                count = (count + 1) % 5;
                counter.textContent = String(count);
                cell.classList.toggle('lectura-filled', count > 0);
                updateAllTotals();
                saveState();
            }
        }
    
        // Note Icon Click
        if (target.closest('.note-icon')) {
            e.stopPropagation();
            activeNoteIcon = target.closest('.note-icon');
            openNotesModal();
        }
    
        // References cell click
        if (target.closest('.references-cell')) {
            e.stopPropagation();
            activeReferencesCell = target.closest('.references-cell');
            const row = activeReferencesCell.closest('tr');
            const references = JSON.parse(row.dataset.references || '[]');
            openReferencesModal(references);
        }
    });

    // Section header click
    tableBody.addEventListener('click', (e) => {
        const headerRow = e.target.closest('.section-header-row');
        if (!headerRow) return;

        // Ignore clicks on icons within the header
        if (e.target.closest('.note-icon, .print-section-btn')) {
            return;
        }

        const sectionName = headerRow.dataset.sectionHeader;
        headerRow.classList.toggle('collapsed');
        const isCollapsed = headerRow.classList.contains('collapsed');
        
        // When collapsing/expanding, we need to re-evaluate visibility based on current filters
        filterTable(); 
        
        saveState();
    });

    searchBar.addEventListener('input', filterTable);

    confidenceFiltersContainer.addEventListener('click', e => {
        const btn = e.target.closest('button.filter-btn');
        if (!btn) return;
        
        confidenceFiltersContainer.querySelector('.active').classList.remove('active');
        btn.classList.add('active');
        activeConfidenceFilter = btn.dataset.filter;
        filterTable();
    });

    // Top Controls
    exportBtn.addEventListener('click', async () => {
        try {
            const topics = await db.getAll('topics');
            const sections = await db.getAll('sections');
            const settings = await db.get('keyvalue', 'settings');
            const headers = await db.get('keyvalue', 'headers');

            const fullState = {
                version: "temario_indexeddb_v1",
                data: {
                    topics,
                    sections,
                    settings: settings ? settings.value : {},
                    headers: headers ? headers.value : {},
                }
            };
            const dataStr = JSON.stringify(fullState, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().slice(0, 10);
            a.download = `temario-progreso-${date}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error exporting data:", error);
            await showAlert("Hubo un error al exportar el progreso.");
        }
    });

    importBtn.addEventListener('click', () => importFileInput.click());
    
    importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const confirmed = await showConfirmation("¿Estás seguro de que quieres importar este archivo? Tu progreso actual se sobrescribirá.");
        if (!confirmed) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedState = JSON.parse(event.target.result);
                
                if (importedState.version !== "temario_indexeddb_v1" || !importedState.data) {
                    await showAlert("Error: El archivo de importación no es compatible o está corrupto.");
                    return;
                }
                const { topics, sections, settings, headers } = importedState.data;

                const topicPromises = topics.map(topic => db.set('topics', topic));
                const sectionPromises = sections.map(section => db.set('sections', section));
                const settingsPromise = db.set('keyvalue', { key: 'settings', value: settings });
                const headersPromise = db.set('keyvalue', { key: 'headers', value: headers });

                await Promise.all([...topicPromises, ...sectionPromises, settingsPromise, headersPromise]);
                
                await showAlert("Importación completada. La página se recargará.");
                location.reload();
            } catch (err) {
                console.error("Error al importar el archivo:", err);
                await showAlert("Error: El archivo seleccionado no es un JSON válido o está corrupto.");
            }
        };
        reader.readAsText(file);
    });

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!settingsBtn.contains(e.target) && !settingsDropdown.contains(e.target)) {
            settingsDropdown.classList.add('hidden');
        }
        const visibleSubmenu = document.querySelector('.color-submenu.visible, .symbol-dropdown-content.visible');
        if (visibleSubmenu && !visibleSubmenu.parentElement.contains(e.target)) {
             visibleSubmenu.classList.remove('visible');
        }
    });
    
    settingsDropdown.addEventListener('click', (e) => {
        e.preventDefault();
        const target = e.target;
        if(target.classList.contains('theme-option')) {
            applyTheme(target.dataset.theme);
            settingsDropdown.classList.add('hidden');
            saveState();
        }
        if(target.classList.contains('icon-style-option')) {
            applyIconStyle(target.dataset.style);
            settingsDropdown.classList.add('hidden');
            saveState();
        }
    });

    toggleAllSectionsBtn.addEventListener('click', () => {
        const allHeaders = document.querySelectorAll('.section-header-row');
        // Check if any section is currently expanded (i.e., not collapsed)
        const isAnyExpanded = Array.from(allHeaders).some(h => !h.classList.contains('collapsed'));

        allHeaders.forEach(headerRow => {
            const shouldCollapse = isAnyExpanded; // If any is open, collapse all. Otherwise, expand all.
            headerRow.classList.toggle('collapsed', shouldCollapse);
        });
        
        filterTable(); // Re-apply filters to show/hide rows correctly
        saveState();
    });

    // Notes Modal Functions
    function openNotesModal() {
        const noteType = activeNoteIcon.dataset.noteType;
        const parentEl = noteType === 'topic' ? activeNoteIcon.closest('tr') : activeNoteIcon.closest('.section-header-row');

        // Configure modal based on note type
        if (noteType === 'topic') {
            const topicTitle = parentEl.querySelector('.topic-text')?.textContent.trim() || 'Nota';
            currentNotesArray = JSON.parse(parentEl.dataset.notes || '[]');
            if (currentNotesArray.length === 0) {
                currentNotesArray.push({ id: `note-${Date.now()}`, title: topicTitle, content: '', lastEdited: new Date().toISOString() });
            } else {
                 // Ensure title is up-to-date with main table
                currentNotesArray.forEach(note => {
                    if(!note.title || note.title === 'Nota') note.title = topicTitle;
                });
            }
            notesSidePanel.style.display = 'flex';
            notesPanelToggle.style.display = 'block';
             if (!notesSidePanel.classList.contains('open')) {
                notesMainContent.style.paddingLeft = '1rem';
             }
        } else { // section note
            const sectionTitle = parentEl.querySelector('.section-title')?.textContent.trim() || 'Nota de sección';
            currentNotesArray = [{ id: `section-${parentEl.dataset.sectionHeader}`, title: sectionTitle, content: parentEl.dataset.sectionNote || '', lastEdited: new Date().toISOString() }];
            notesSidePanel.style.display = 'none';
            notesPanelToggle.style.display = 'none';
            notesMainContent.style.paddingLeft = '1rem';
        }
        
        // Reset to edit mode when opening
        const modalContent = notesModal.querySelector('.notes-modal-content');
        modalContent.classList.remove('readonly-mode');
        notesEditor.setAttribute('contenteditable', 'true');
        notesModalTitle.setAttribute('contenteditable', 'true');
        const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye w-5 h-5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
        toggleReadOnlyBtn.innerHTML = eyeIcon;
        toggleReadOnlyBtn.title = "Activar modo lectura";

        activeNoteIndex = 0;
        loadNoteIntoEditor(activeNoteIndex);
        updateNotesList();
        showModal(notesModal);
        notesEditor.focus();
    }

    function loadNoteIntoEditor(index) {
        if (index < 0 || index >= currentNotesArray.length) {
            console.error("Invalid note index");
            return;
        }
        activeNoteIndex = index;
        const note = currentNotesArray[activeNoteIndex];
        notesModalTitle.textContent = note.title;
        notesEditor.innerHTML = note.content || '<p><br></p>';
        
        // Update active state in side panel
        document.querySelectorAll('#notes-list .note-item-btn.active').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`#notes-list button[data-note-index="${index}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    function saveCurrentNote() {
        if (activeNoteIndex < 0 || activeNoteIndex >= currentNotesArray.length) return;
        
        const note = currentNotesArray[activeNoteIndex];
        note.title = notesModalTitle.textContent.trim() || 'Sin Título';
        note.content = notesEditor.innerHTML;
        note.lastEdited = new Date().toISOString();
        
        // Update the main data structure
        const noteType = activeNoteIcon.dataset.noteType;
        const parentEl = noteType === 'topic' ? activeNoteIcon.closest('tr') : activeNoteIcon.closest('.section-header-row');

        if (noteType === 'topic') {
            parentEl.dataset.notes = JSON.stringify(currentNotesArray);
            const hasContent = currentNotesArray.some(n => n.content && n.content.trim() !== '' && n.content.trim() !== '<p><br></p>');
            activeNoteIcon.classList.toggle('has-note', hasContent);
        } else {
             parentEl.dataset.sectionNote = note.content;
             activeNoteIcon.classList.toggle('has-note', note.content && note.content.trim() !== '');
        }
        
        updateNotesList();
        saveState();
    }
    
    function updateNotesList() {
        notesList.innerHTML = '';
        currentNotesArray.forEach((note, index) => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'note-item-btn';
            btn.dataset.noteIndex = index;
            if (index === activeNoteIndex) {
                btn.classList.add('active');
            }
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'note-title-text';
            titleSpan.textContent = note.title;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-note-btn toolbar-btn';
            deleteBtn.title = 'Borrar nota';
            deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>`;
            deleteBtn.dataset.noteIndex = index;
            
            btn.appendChild(titleSpan);
            btn.appendChild(deleteBtn);
            li.appendChild(btn);
            notesList.appendChild(li);
        });
    }
    
    saveNoteBtn.addEventListener('click', saveCurrentNote);
    saveAndCloseNoteBtn.addEventListener('click', () => {
        saveCurrentNote();
        hideModal(notesModal);
    });
    cancelNoteBtn.addEventListener('click', () => hideModal(notesModal));

    unmarkNoteBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmation("¿Estás seguro de que quieres borrar todo el contenido de esta nota?");
        if (confirmed) {
            notesEditor.innerHTML = '<p><br></p>';
            saveCurrentNote();
        }
    });

    // AI Q&A Modal Listeners
    askAiBtn.addEventListener('click', () => {
        if (!API_KEY) {
            showAlert("La clave de API para Gemini no está configurada. No se puede realizar la pregunta.", "Error de Configuración");
            return;
        }

        // Pre-fill with context if possible
        if(activeNoteIcon) {
            const parentEl = activeNoteIcon.closest('tr[data-topic-id]');
            const topicTitle = parentEl ? parentEl.querySelector('.topic-text')?.textContent.trim() : '';
            const notes = parentEl ? JSON.parse(parentEl.dataset.notes || '[]').map(n => `Title: ${n.title}\nContent:\n${n.content.replace(/<[^>]+>/g, ' ')}`).join('\n\n') : '';

            if (notes.trim()) {
                 aiQuestionInput.value = `Basado en mis notas sobre "${topicTitle}", responde a la siguiente pregunta: `;
            }
        }
        showModal(aiQaModal);
        aiQuestionInput.focus();
    });

    cancelAiQaBtn.addEventListener('click', () => hideModal(aiQaModal));
    sendAiQaBtn.addEventListener('click', async () => {
        const question = aiQuestionInput.value.trim();
        if (!question) return;
        
        aiResponseArea.innerHTML = '';
        aiQaLoader.style.display = 'block';
        sendAiQaBtn.disabled = true;

        try {
            const ai = new GoogleGenAI({apiKey: API_KEY});

            // Gather context from all notes
            let allNotesContext = "CONTEXTO DE NOTAS DEL USUARIO:\n\n";
            const topicsData = await db.getAll('topics');
            for(const topic of topicsData) {
                const notes = topic.notes || [];
                const hasContent = notes.some(n => n.content && n.content.trim() !== '' && n.content.trim() !== '<p><br></p>');
                if (hasContent) {
                    const row = document.querySelector(`tr[data-topic-id="${topic.id}"]`);
                    const topicTitle = row ? row.querySelector('.topic-text')?.textContent.trim() : 'Sin Título';
                    allNotesContext += `--- TEMA: ${topicTitle} ---\n`;
                    notes.forEach(note => {
                         allNotesContext += `Título de la Nota: ${note.title}\nContenido (HTML): ${note.content}\n\n`;
                    });
                }
            }

            const fullPrompt = `${allNotesContext}\n\nPREGUNTA DEL USUARIO:\n${question}\n\nResponde a la pregunta del usuario en español, basándote únicamente en el contexto proporcionado. Si la respuesta no está en el contexto, indícalo. Formatea la respuesta en HTML simple (usa <p>, <b>, <ul>, <li>).`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            });

            aiResponseArea.innerHTML = response.text.replace(/\n/g, '<br>');

        } catch (error) {
            console.error("Gemini API Error:", error);
            aiResponseArea.innerHTML = `<p class="text-red-500">Ocurrió un error al contactar a la IA. Detalles: ${error.message}</p>`;
        } finally {
            aiQaLoader.style.display = 'none';
            sendAiQaBtn.disabled = false;
        }
    });

    // Note Import/Export
    exportNoteBtn.addEventListener('click', () => {
        if (activeNoteIndex < 0 || activeNoteIndex >= currentNotesArray.length) return;
        const note = currentNotesArray[activeNoteIndex];
        const htmlContent = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${note.title}</title></head><body><h1>${note.title}</h1>${note.content}</body></html>`;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
        a.click();
        URL.revokeObjectURL(url);
    });

    importNoteBtn.addEventListener('click', () => importNoteFileInput.click());
    importNoteFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target.result;
            const confirmed = await showConfirmation("¿Estás seguro? El contenido actual del editor será reemplazado.");
            if (confirmed) {
                if (file.type === 'text/html') {
                     const parser = new DOMParser();
                     const doc = parser.parseFromString(content, 'text/html');
                     notesEditor.innerHTML = doc.body.innerHTML;
                } else { // Plain text
                    notesEditor.innerHTML = `<p>${content.replace(/\n/g, '</p><p>')}</p>`;
                }
                saveCurrentNote();
            }
        };
        reader.readAsText(file);
    });

    // References Modal listeners
    addReferenceSlotBtn.addEventListener('click', () => {
        referencesEditor.appendChild(createReferenceSlot());
    });
    
    cancelReferencesBtn.addEventListener('click', () => hideModal(referencesModal));
    
    saveReferencesBtn.addEventListener('click', () => {
        const references = [];
        referencesEditor.querySelectorAll('.reference-slot').forEach(slot => {
            const icon = slot.querySelector('.icon-display').textContent;
            const url = slot.querySelector('input[type="url"]').value;
            if (url && icon) {
                references.push({ icon, url });
            }
        });
        
        if (activeReferencesCell) {
            const row = activeReferencesCell.closest('tr');
            row.dataset.references = JSON.stringify(references);
            renderReferencesCell(activeReferencesCell);
            updateAllTotals();
            saveState();
        }
        
        hideModal(referencesModal);
    });

    // Icon picker listeners
    cancelIconPickerBtn.addEventListener('click', () => hideModal(iconPickerModal));

    iconPickerCategories.addEventListener('click', e => {
        const btn = e.target.closest('.category-btn');
        if (!btn) return;
        iconPickerCategories.querySelector('.active').classList.remove('active');
        btn.classList.add('active');
        loadEmojisForCategory(btn.dataset.category);
    });

    emojiGrid.addEventListener('click', e => {
        const btn = e.target.closest('.emoji-btn');
        if (!btn) return;

        if (activeIconPickerButton) {
            activeIconPickerButton.textContent = btn.dataset.emoji;
        }
        hideModal(iconPickerModal);
    });
    
    // Editor Listeners for resize and others
    notesEditor.addEventListener('click', e => {
        if (e.target.tagName === 'IMG') {
            document.querySelectorAll('img.selected-for-resize').forEach(img => img.classList.remove('selected-for-resize'));
            e.target.classList.add('selected-for-resize');
            selectedImageForResize = e.target;
        } else {
            if (selectedImageForResize) {
                selectedImageForResize.classList.remove('selected-for-resize');
                selectedImageForResize = null;
            }
        }
    });

    // Multi-note panel listeners
    notesPanelToggle.addEventListener('click', () => {
        notesSidePanel.classList.toggle('open');
        notesPanelToggle.classList.toggle('open');
        
        if (notesSidePanel.classList.contains('open')) {
            notesPanelToggle.style.left = `${notesSidePanel.offsetWidth - 12}px`;
             notesMainContent.style.paddingLeft = '0';
        } else {
            notesPanelToggle.style.left = '0.75rem';
             notesMainContent.style.paddingLeft = '1rem';
        }
    });

    addNotePanelBtn.addEventListener('click', () => {
        const newNote = {
            id: `note-${Date.now()}`,
            title: 'Nueva Nota',
            content: '',
            lastEdited: new Date().toISOString()
        };
        currentNotesArray.push(newNote);
        activeNoteIndex = currentNotesArray.length - 1;
        updateNotesList();
        loadNoteIntoEditor(activeNoteIndex);
        notesModalTitle.focus();
        // Select text in contenteditable element
        const range = document.createRange();
        range.selectNodeContents(notesModalTitle);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    });

    notesList.addEventListener('click', async e => {
        const itemBtn = e.target.closest('.note-item-btn');
        const deleteBtn = e.target.closest('.delete-note-btn');

        if (deleteBtn) {
            e.stopPropagation();
            const indexToDelete = parseInt(deleteBtn.dataset.noteIndex, 10);
            if (currentNotesArray.length <= 1) {
                await showAlert("No puedes borrar la última nota.");
                return;
            }
            const confirmed = await showConfirmation("¿Estás seguro de que quieres borrar esta nota? Esta acción no se puede deshacer.");
            if (confirmed) {
                currentNotesArray.splice(indexToDelete, 1);
                if (activeNoteIndex >= indexToDelete) {
                    activeNoteIndex = Math.max(0, activeNoteIndex - 1);
                }
                updateNotesList();
                loadNoteIntoEditor(activeNoteIndex);
                saveCurrentNote(); // Persist the deletion
            }
        } else if (itemBtn) {
            saveCurrentNote(); // Save current before switching
            const newIndex = parseInt(itemBtn.dataset.noteIndex, 10);
            loadNoteIntoEditor(newIndex);
        }
    });

    // Confirmation Modal Logic
    confirmConfirmationBtn.addEventListener('click', () => {
        if (resolveConfirmation) resolveConfirmation(true);
        hideModal(confirmationModal);
    });
    cancelConfirmationBtn.addEventListener('click', () => {
        if (resolveConfirmation) resolveConfirmation(false);
        hideModal(confirmationModal);
    });
    okAlertBtn.addEventListener('click', () => hideModal(alertModal));

    // Readonly mode toggle
    toggleReadOnlyBtn.addEventListener('click', () => {
        const modalContent = notesModal.querySelector('.notes-modal-content');
        const isReadonly = modalContent.classList.toggle('readonly-mode');
        
        notesEditor.setAttribute('contenteditable', !isReadonly);
        notesModalTitle.setAttribute('contenteditable', !isReadonly);

        if (isReadonly) {
            toggleReadOnlyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off w-5 h-5"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;
            toggleReadOnlyBtn.title = "Desactivar modo lectura";
        } else {
            toggleReadOnlyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye w-5 h-5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
            toggleReadOnlyBtn.title = "Activar modo lectura";
            notesEditor.focus();
        }
    });

    // Note Info Modal Logic
    noteInfoBtn.addEventListener('click', () => {
        if (activeNoteIndex < 0 || activeNoteIndex >= currentNotesArray.length) return;
        const note = currentNotesArray[activeNoteIndex];
        
        const plainText = notesEditor.innerText || '';
        const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;
        infoWordCount.textContent = wordCount;

        const sizeInBytes = new TextEncoder().encode(note.content).length;
        infoNoteSize.textContent = formatBytes(sizeInBytes);
        
        infoLastEdited.textContent = note.lastEdited ? new Date(note.lastEdited).toLocaleString() : 'N/A';

        showModal(noteInfoModal);
    });
    closeNoteInfoBtn.addEventListener('click', () => hideModal(noteInfoModal));

    // --- Resizer Logic ---
    function initResize(e, resizeFunc) {
        isResizing = true;
        document.body.style.cursor = getComputedStyle(e.target).cursor;

        const moveHandler = (moveEvent) => {
            if (isResizing) {
                resizeFunc(moveEvent);
            }
        };

        const upHandler = () => {
            isResizing = false;
            document.body.style.cursor = 'default';
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
        };

        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    }
    
    // Resizing for the main modal
    const notesModalContent = notesModal.querySelector('.notes-modal-content');
    notesModal.querySelector('.resizer-r').addEventListener('mousedown', (e) => {
        e.preventDefault();
        initResize(e, (moveEvent) => {
            const newWidth = moveEvent.clientX - notesModalContent.getBoundingClientRect().left;
            notesModalContent.style.width = `${newWidth}px`;
        });
    });
     notesModal.querySelector('.resizer-b').addEventListener('mousedown', (e) => {
        e.preventDefault();
        initResize(e, (moveEvent) => {
            const newHeight = moveEvent.clientY - notesModalContent.getBoundingClientRect().top;
            notesModalContent.style.height = `${newHeight}px`;
        });
    });
    notesModal.querySelector('.resizer-br').addEventListener('mousedown', (e) => {
        e.preventDefault();
        initResize(e, (moveEvent) => {
            const newWidth = moveEvent.clientX - notesModalContent.getBoundingClientRect().left;
            const newHeight = moveEvent.clientY - notesModalContent.getBoundingClientRect().top;
            notesModalContent.style.width = `${newWidth}px`;
            notesModalContent.style.height = `${newHeight}px`;
        });
    });

    // Resizing for the side panel
    notesSidePanel.querySelector('.resizer-e-panel').addEventListener('mousedown', (e) => {
        e.preventDefault();
        initResize(e, (moveEvent) => {
            const newWidth = moveEvent.clientX - notesSidePanel.getBoundingClientRect().left;
            if (newWidth > 150 && newWidth < 500) { // Min/Max width
                notesSidePanel.style.width = `${newWidth}px`;
                notesPanelToggle.style.left = `${newWidth - 12}px`;
            }
        });
    });

    // --- Init App ---
    initializeCells();
    setupEditorToolbar();
    populateIconPicker();
    loadState();
});