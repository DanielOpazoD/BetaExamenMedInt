


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
    let activeGalleryRange = null;
    let lightboxImages = [];
    let currentLightboxIndex = 0;
    let currentNoteRow = null;


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
                    action();
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
        editorToolbar.appendChild(createButton('Superíndice', 'X²', 'superscript'));
        
        const eraserSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eraser w-5 h-5"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21H7Z"/><path d="M22 21H7"/><path d="m5 12 5 5"/></svg>`;
        editorToolbar.appendChild(createButton('Borrar formato', eraserSVG, 'removeFormat'));

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
        editorToolbar.appendChild(createSymbolDropdown(symbols, 'Insertar Símbolo', '📌'));

        const specialChars = ['∞','±','≈','•','‣','↑','↓','→','←','↔','⇧','⇩','⇨','⇦','↗','↘','↙','↖'];
        editorToolbar.appendChild(createSymbolDropdown(specialChars, 'Caracteres Especiales', 'Ω'));

        // Image controls
        const imageBtn = createButton('Insertar Imagen desde URL', '🖼️', null, null, () => {
            const url = prompt("Ingresa la URL de la imagen:");
            if (url) {
                notesEditor.focus();
                document.execCommand('insertImage', false, url);
            }
        });
        editorToolbar.appendChild(imageBtn);
        
        const gallerySVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-gallery-horizontal-end w-5 h-5"><path d="M2 7v10"/><path d="M6 5v14"/><rect width="12" height="18" x="10" y="3" rx="2"/></svg>`;
        editorToolbar.appendChild(createButton('Crear Galería de Imágenes', gallerySVG, null, null, openGalleryLinkEditor));

        const resizePlusBtn = createButton('Aumentar tamaño de imagen (+10%)', '➕', null, null, () => resizeSelectedImage(1.1));
        editorToolbar.appendChild(resizePlusBtn);

        const resizeMinusBtn = createButton('Disminuir tamaño de imagen (-10%)', '➖', null, null, () => resizeSelectedImage(0.9));
        editorToolbar.appendChild(resizeMinusBtn);

        editorToolbar.appendChild(createSeparator());

        // Print/Save
        const printBtn = createButton('Imprimir o Guardar como PDF', '💾', null, null, () => {
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
        const isFiltering = query !== '' || activeConfidenceFilter !== 'all';

        document.querySelectorAll('.section-header-row').forEach(headerRow => {
            const sectionName = headerRow.dataset.sectionHeader;
            const totalRow = document.getElementById(`total-row-${sectionName}`);
            const isCollapsed = headerRow.classList.contains('collapsed');
            
            let hasVisibleChildren = false;

            document.querySelectorAll(`tr[data-section="${sectionName}"]`).forEach(row => {
                const topicText = row.querySelector('.topic-text')?.textContent.toLowerCase() || '';
                const confidence = row.querySelector('.confidence-dot')?.dataset.confidenceLevel || '0';
                
                const matchesSearch = query === '' || topicText.includes(query);
                const matchesConfidence = activeConfidenceFilter === 'all' || confidence === activeConfidenceFilter;
                
                if (matchesSearch && matchesConfidence) {
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
        
        // Update the array in memory
        currentNotesArray[activeNoteIndex] = {
            title: currentTitle,
            content: currentContent,
            lastEdited: new Date().toISOString()
        };

        const noteType = activeNoteIcon.dataset.noteType;
        if (noteType === 'section') {
            currentNoteRow.dataset.sectionNote = JSON.stringify(currentNotesArray);
        } else {
            // Save back to the row's dataset for topics
            currentNoteRow.dataset.notes = JSON.stringify(currentNotesArray);
        }
        
        // Update the 'has-note' status on the icon
        const hasContent = currentNotesArray.some(n => n.content && n.content.trim() !== '' && n.content.trim() !== '<p><br></p>');
        if (activeNoteIcon) {
            activeNoteIcon.classList.toggle('has-note', hasContent);
        }

        renderNotesList(); // Re-render list to show title changes
        saveState(); // Persist changes to IndexedDB
        updateNoteInfo(); // Update stats display
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
        
        // Update counter
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
            lastEdited: new Date().toISOString()
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
        
        // This is a destructive action, save immediately
        const noteType = activeNoteIcon.dataset.noteType;
        if (currentNoteRow) {
             if (noteType === 'section') {
                currentNoteRow.dataset.sectionNote = JSON.stringify(currentNotesArray);
             } else {
                currentNoteRow.dataset.notes = JSON.stringify(currentNotesArray);
             }
        }
        saveState();
    }

    function openNotesModal(noteIconElement) {
        if (!noteIconElement) return;
        activeNoteIcon = noteIconElement;
        
        currentNoteRow = activeNoteIcon.closest('tr');
        if (!currentNoteRow) {
            console.error("Could not find parent row for note icon.");
            return;
        }
        
        const noteType = activeNoteIcon.dataset.noteType;
        let notesJson;
        let defaultTitle;
        
        if (noteType === 'section') {
            notesJson = currentNoteRow.dataset.sectionNote || '[]';
            defaultTitle = currentNoteRow.querySelector('.section-title')?.textContent;
             notesSidePanel.style.display = 'none'; // No multi-note for sections for now
        } else { // topic
            notesJson = currentNoteRow.dataset.notes || '[]';
            defaultTitle = currentNoteRow.querySelector('.topic-text')?.textContent;
            notesSidePanel.style.display = 'flex';
        }
        
        try {
            currentNotesArray = JSON.parse(notesJson);
        } catch(e) {
            console.error("Error parsing notes JSON:", e, notesJson);
            currentNotesArray = [];
        }

        if (!Array.isArray(currentNotesArray)) {
            // Handle legacy case where note was a single object, not an array
            currentNotesArray = (typeof currentNotesArray === 'object' && currentNotesArray !== null && currentNotesArray.content) ? 
                [{ title: defaultTitle || "Nota Principal", ...currentNotesArray }] 
                : [];
        }
        
        if (currentNotesArray.length === 0) {
            currentNotesArray.push({
                title: defaultTitle || 'Nota Principal',
                content: '<p><br></p>',
                lastEdited: new Date().toISOString()
            });
        }
        
        loadNoteIntoEditor(0);
        showModal(notesModal);
    }
    
    function updateNoteInfo() {
        const note = currentNotesArray[activeNoteIndex];
        if (!note) return;

        const wordCount = notesEditor.innerText.match(/\b\w+\b/g)?.length || 0;
        const size = new TextEncoder().encode(note.content).length;
        const lastEdited = note.lastEdited ? new Date(note.lastEdited).toLocaleString() : 'N/A';
        
        infoWordCount.textContent = wordCount;
        infoNoteSize.textContent = formatBytes(size);
        infoLastEdited.textContent = lastEdited;
    }

    // --- Image Gallery & Lightbox Functions ---
    function createGalleryUrlInput(url = '') {
        const inputContainer = document.createElement('div');
        inputContainer.className = 'gallery-url-input';
        
        const urlInput = document.createElement('input');
        urlInput.type = 'url';
        urlInput.placeholder = 'https://ejemplo.com/imagen.jpg';
        urlInput.className = 'w-full p-2 border border-border-color rounded-lg bg-secondary focus:ring-2 focus:ring-sky-400';
        urlInput.value = url;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'toolbar-btn text-red-500 hover:bg-red-100 dark:hover:bg-red-900';
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 4a1 1 0 100 2h2a1 1 0 100-2H8z" clip-rule="evenodd" /></svg>`;
        deleteBtn.title = "Borrar URL";
        deleteBtn.onclick = () => inputContainer.remove();

        inputContainer.appendChild(urlInput);
        inputContainer.appendChild(deleteBtn);
        return inputContainer;
    }

    function openGalleryLinkEditor() {
        const selection = window.getSelection();
        if (selection.isCollapsed || !notesEditor.contains(selection.anchorNode)) {
            showAlert("Por favor, selecciona algo de texto en el editor para crear una galería.");
            return;
        }
        activeGalleryRange = selection.getRangeAt(0).cloneRange();
        
        imageGalleryInputs.innerHTML = '';
        const existingLink = selection.getRangeAt(0).startContainer.parentElement.closest('.gallery-link');
        
        if (existingLink) {
            try {
                const images = JSON.parse(existingLink.dataset.galleryImages);
                images.forEach(url => imageGalleryInputs.appendChild(createGalleryUrlInput(url)));
            } catch (e) {
                 console.error("Could not parse existing gallery data", e);
                 imageGalleryInputs.appendChild(createGalleryUrlInput());
            }
        } else {
             imageGalleryInputs.appendChild(createGalleryUrlInput());
        }

        showModal(imageGalleryLinkModal);
    }
    
    function saveGalleryLink() {
        if (!activeGalleryRange) return;

        const urls = Array.from(imageGalleryInputs.querySelectorAll('input[type="url"]'))
            .map(input => input.value.trim())
            .filter(url => url);

        if (urls.length === 0) {
            showAlert("Debes añadir al menos una URL de imagen.");
            return;
        }
        
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(activeGalleryRange);

        const existingLink = activeGalleryRange.startContainer.parentElement.closest('.gallery-link');
        if (existingLink) {
            existingLink.dataset.galleryImages = JSON.stringify(urls);
        } else {
            const span = document.createElement('span');
            span.className = 'gallery-link';
            span.dataset.galleryImages = JSON.stringify(urls);
            
            try {
                // Use surroundContents for robustness
                activeGalleryRange.surroundContents(span);
            } catch(e) {
                console.error("Error wrapping content with surroundContents, falling back:", e);
                // Fallback for complex selections
                document.execCommand('insertHTML', false, '<span></span>');
                const tempSpan = notesEditor.querySelector('span:not([class])');
                if (tempSpan) {
                    tempSpan.className = 'gallery-link';
                    tempSpan.dataset.galleryImages = JSON.stringify(urls);
                    tempSpan.innerHTML = activeGalleryRange.toString();
                }
            }
        }

        activeGalleryRange = null;
        hideModal(imageGalleryLinkModal);
        saveCurrentNote();
    }
    
    function openLightbox(images, startIndex) {
        lightboxImages = images;
        currentLightboxIndex = startIndex;
        showLightboxImage(currentLightboxIndex);
        showModal(imageLightboxModal);
    }

    function showLightboxImage(index) {
        if (index < 0 || index >= lightboxImages.length) return;
        currentLightboxIndex = index;
        lightboxImage.src = lightboxImages[index];
        lightboxCaption.textContent = `${index + 1} / ${lightboxImages.length}`;
        prevLightboxBtn.style.display = lightboxImages.length > 1 ? 'block' : 'none';
        nextLightboxBtn.style.display = lightboxImages.length > 1 ? 'block' : 'none';
    }

    function navigateLightbox(direction) {
        const newIndex = (currentLightboxIndex + direction + lightboxImages.length) % lightboxImages.length;
        showLightboxImage(newIndex);
    }

    function exportSectionWithIndex(sectionId) {
        const sectionHeaderRow = document.querySelector(`tr[data-section-header="${sectionId}"]`);
        const sectionTitle = sectionHeaderRow.querySelector('.section-title').textContent.trim();
        const sectionRows = document.querySelectorAll(`tr[data-section="${sectionId}"]`);
        
        let contentHtml = `<h1 style="font-size: 2em; margin-bottom: 1em;">${sectionTitle}</h1>`;
        let indexHtml = '<h2>Índice</h2><ul>';
        let notesContentHtml = '';
        let hasContent = false;

        sectionRows.forEach(row => {
            const topicId = row.dataset.topicId;
            const topicTitle = row.querySelector('.topic-text')?.textContent.trim() || 'Sin Título';
            const notes = JSON.parse(row.dataset.notes || '[]');
            
            if (notes && notes.length > 0 && notes.some(n => n.content && n.content.trim() !== '' && n.content.trim() !== '<p><br></p>')) {
                hasContent = true;
                const anchorId = `topic-anchor-${topicId.replace(/\s+/g, '-')}`;
                indexHtml += `<li><a href="#${anchorId}">${topicTitle}</a></li>`;
                
                notesContentHtml += `<div style="margin-bottom: 2em; page-break-before: auto;">`;
                notesContentHtml += `<h2 id="${anchorId}" style="font-size: 1.5em; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 2em;">${topicTitle}</h2>`;
                notes.forEach(note => {
                    const noteTitle = note.title || '';
                    if (noteTitle && noteTitle.trim().toLowerCase() !== topicTitle.trim().toLowerCase()) {
                        notesContentHtml += `<h3>${noteTitle}</h3>`;
                    }
                    notesContentHtml += `<div>${note.content}</div>`;
                });
                notesContentHtml += `</div>`;
            }
        });

        if (!hasContent) {
            showAlert("Esta sección no tiene notas para exportar.");
            return;
        }

        indexHtml += '</ul><hr style="margin: 2em 0;">';
        contentHtml += indexHtml + notesContentHtml;

        const fullHtml = getStyledExportHtml(contentHtml, sectionTitle);
        
        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sectionTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function getStyledExportHtml(content, title) {
        const styles = `
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                body { font-family: 'Inter', sans-serif; line-height: 1.6; color: #1f2937; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
                h1, h2, h3 { color: #111827; }
                a { color: #2563eb; text-decoration: none; }
                a:hover { text-decoration: underline; }
                img { max-width: 100%; height: auto; border-radius: 0.5rem; }
                details { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem; margin: 1rem 0; background-color: #f9fafb; }
                summary { font-weight: 600; cursor: pointer; }
                summary::marker { color: #3b82f6; }
                hr { border: none; border-top: 1px solid #e5e7eb; }
                p, div, li, span { background-color: transparent !important; }
                
                /* By default, remove list styling to match editor */
                ul, ol {
                    list-style: none;
                    padding-left: 0;
                }
                /* Add list styling only to the main Index list */
                body > ul {
                    list-style: disc;
                    list-style-position: inside;
                }
                li { 
                    margin-bottom: 0.5rem; 
                }
            </style>
        `;
        return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${title}</title>${styles}</head><body>${content}</body></html>`;
    }

    // --- Event Listeners Setup ---
    
    // Main table interactions
    tableBody.addEventListener('click', (e) => {
        const target = e.target;
        const exportSectionBtn = target.closest('.export-section-btn');
        const printSectionBtn = target.closest('.print-section-btn');
        const noteIcon = target.closest('.note-icon');

        // Check for specific buttons within the header first
        if (exportSectionBtn) {
            e.stopPropagation(); // Stop the header from collapsing
            const sectionId = exportSectionBtn.closest('.section-header-row').dataset.sectionHeader;
            exportSectionWithIndex(sectionId);
            return; // Done
        }
        
        if (printSectionBtn) {
            e.stopPropagation(); // Stop the header from collapsing
            const sectionId = printSectionBtn.closest('.section-header-row').dataset.sectionHeader;
            const sectionHeaderRow = document.querySelector(`tr[data-section-header="${sectionId}"]`);
            const sectionTitle = sectionHeaderRow.querySelector('.section-title').textContent.trim();
            const sectionRows = document.querySelectorAll(`tr[data-section="${sectionId}"]`);
            let contentToPrint = `<h1 style="font-size: 2em;">${sectionTitle}</h1>`;
            let notesFound = false;

            sectionRows.forEach(row => {
                const notes = JSON.parse(row.dataset.notes || '[]');
                if (notes && notes.length > 0 && notes.some(n => n.content && n.content.trim() !== '' && n.content.trim() !== '<p><br></p>')) {
                    notesFound = true;
                    const topicTitle = row.cells[1].textContent;
                    contentToPrint += `<h2 style="font-size: 1.5em; margin-top: 1.5em; border-bottom: 1px solid #ccc;">${topicTitle}</h2>`;
                    notes.forEach(note => {
                         contentToPrint += `<h3>${note.title || ''}</h3><div>${note.content}</div>`;
                    });
                }
            });

            if (!notesFound) {
                showAlert("No hay notas en esta sección para imprimir.");
                return;
            }
            
            const printArea = getElem('print-area');
            printArea.innerHTML = getStyledExportHtml(contentToPrint, `Notas - ${sectionTitle}`);
            window.print();
            return; // Done
        }

        if (noteIcon) {
            // This will catch note icons in topic rows and header rows
            e.stopPropagation(); // Stop header from collapsing if it's a header icon
            openNotesModal(noteIcon);
            return; // Done
        }
        
        // Now handle other clicks.
        const cell = target.closest('.lectura-cell');
        const refCell = target.closest('.references-cell');
        const sectionHeader = target.closest('.section-header-row');
        const confidenceDot = target.closest('.confidence-dot');
        const galleryLink = target.closest('.gallery-link');

        if (cell) {
            e.preventDefault();
            const counter = cell.querySelector('.lectura-counter');
            let count = parseInt(counter.textContent, 10);
            count = (count + 1);
            if(count > 1) count = 0; // Cycle through 0, 1
            counter.textContent = String(count);
            cell.classList.toggle('lectura-filled', count > 0);
            updateAllTotals();
            saveState();
        } else if (refCell) {
            e.preventDefault();
            activeReferencesCell = refCell;
            const row = refCell.closest('tr');
            const currentReferences = JSON.parse(row.dataset.references || '[]');
            openReferencesModal(currentReferences);
        } else if (confidenceDot) {
            let level = parseInt(confidenceDot.dataset.confidenceLevel || '0');
            level = (level + 1) % 4; // Cycle 0, 1, 2, 3 -> 0
            confidenceDot.dataset.confidenceLevel = level;
            filterTable();
            saveState();
        } else if (galleryLink) {
             try {
                const images = JSON.parse(galleryLink.dataset.galleryImages);
                if (images && images.length > 0) {
                    openLightbox(images, 0);
                }
            } catch (e) {
                console.error("Failed to open gallery lightbox:", e);
            }
        } else if (sectionHeader) { // This will now only run if no button was clicked inside it
            const sectionName = sectionHeader.dataset.sectionHeader;
            sectionHeader.classList.toggle('collapsed');
            const isCollapsed = sectionHeader.classList.contains('collapsed');

            document.querySelectorAll(`tr[data-section="${sectionName}"]`).forEach(row => {
                row.style.display = isCollapsed ? 'none' : '';
            });
            const totalRow = sections[sectionName]?.totalRow;
            if (totalRow) {
                totalRow.style.display = isCollapsed ? 'none' : '';
            }
            filterTable(); // Re-apply filters with new collapsed state
            saveState();
        }
    });

    // References Modal listeners
    addReferenceSlotBtn.addEventListener('click', () => referencesEditor.appendChild(createReferenceSlot()));
    saveReferencesBtn.addEventListener('click', () => {
        if (!activeReferencesCell) return;
        const references = Array.from(referencesEditor.querySelectorAll('.reference-slot')).map(slot => ({
            icon: slot.querySelector('.icon-display').textContent,
            url: slot.querySelector('input').value,
        })).filter(ref => ref.url); // only save if URL is present

        const row = activeReferencesCell.closest('tr');
        row.dataset.references = JSON.stringify(references);
        
        renderReferencesCell(activeReferencesCell);
        hideModal(referencesModal);
        updateAllTotals();
        saveState();
    });
    cancelReferencesBtn.addEventListener('click', () => hideModal(referencesModal));

    // Icon Picker Modal listeners
    iconPickerCategories.addEventListener('click', (e) => {
        if (e.target.classList.contains('category-btn')) {
            document.querySelector('.category-btn.active').classList.remove('active');
            e.target.classList.add('active');
            loadEmojisForCategory(e.target.dataset.category);
        }
    });
    emojiGrid.addEventListener('click', (e) => {
        if (e.target.classList.contains('emoji-btn')) {
            if (activeIconPickerButton) {
                activeIconPickerButton.textContent = e.target.dataset.emoji;
            }
            hideModal(iconPickerModal);
        }
    });
    cancelIconPickerBtn.addEventListener('click', () => hideModal(iconPickerModal));

    // Note Modal listeners
    saveNoteBtn.addEventListener('click', saveCurrentNote);
    saveAndCloseNoteBtn.addEventListener('click', () => {
        saveCurrentNote();
        closeNotesModal();
    });
    cancelNoteBtn.addEventListener('click', closeNotesModal);
    unmarkNoteBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmation("¿Estás seguro de que quieres borrar todo el contenido de esta nota? Esta acción no se puede deshacer.");
        if(confirmed) {
            notesEditor.innerHTML = '<p><br></p>';
            saveCurrentNote();
        }
    });
    
    notesModalTitle.addEventListener('blur', saveCurrentNote);
    
    // Multi-note panel listeners
    notesPanelToggle.addEventListener('click', () => {
        notesSidePanel.classList.toggle('open');
        notesPanelToggle.classList.toggle('open');
        if(notesSidePanel.classList.contains('open')) {
            notesPanelToggle.style.left = '228px';
        } else {
            notesPanelToggle.style.left = '0.75rem';
        }
    });
    addNotePanelBtn.addEventListener('click', () => addNewNote());
    notesList.addEventListener('click', (e) => {
        const itemBtn = e.target.closest('.note-item-btn');
        const deleteBtn = e.target.closest('.delete-note-btn');

        if (deleteBtn) {
            e.stopPropagation();
            const indexToDelete = parseInt(deleteBtn.dataset.index, 10);
            deleteNote(indexToDelete);
        } else if (itemBtn) {
            const index = parseInt(itemBtn.dataset.index, 10);
            if (index !== activeNoteIndex) {
                 saveCurrentNote();
                 loadNoteIntoEditor(index);
            }
        }
    });

    noteInfoBtn.addEventListener('click', () => {
        updateNoteInfo();
        showModal(noteInfoModal);
    });
    closeNoteInfoBtn.addEventListener('click', () => hideModal(noteInfoModal));

    // Notes Editor listeners
    notesEditor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain');
        document.execCommand('insertHTML', false, text);
    });

    notesEditor.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG') {
            document.querySelectorAll('#notes-editor img').forEach(img => img.classList.remove('selected-for-resize'));
            e.target.classList.add('selected-for-resize');
            selectedImageForResize = e.target;
        } else {
            document.querySelectorAll('#notes-editor img').forEach(img => img.classList.remove('selected-for-resize'));
            selectedImageForResize = null;
        }
    });

    toggleReadOnlyBtn.addEventListener('click', () => {
        const contentDiv = notesModal.querySelector('.notes-modal-content');
        contentDiv.classList.toggle('readonly-mode');
        notesEditor.contentEditable = !notesEditor.isContentEditable;
    });

    // Gallery Modal Listeners
    addGalleryImageUrlBtn.addEventListener('click', () => {
        imageGalleryInputs.appendChild(createGalleryUrlInput());
    });
    saveGalleryLinkBtn.addEventListener('click', saveGalleryLink);
    cancelGalleryLinkBtn.addEventListener('click', () => {
        activeGalleryRange = null;
        hideModal(imageGalleryLinkModal);
    });
    
    // Lightbox Listeners
    closeLightboxBtn.addEventListener('click', () => hideModal(imageLightboxModal));
    prevLightboxBtn.addEventListener('click', () => navigateLightbox(-1));
    nextLightboxBtn.addEventListener('click', () => navigateLightbox(1));
    document.addEventListener('keydown', (e) => {
        if (imageLightboxModal.classList.contains('visible')) {
            if (e.key === 'ArrowLeft') navigateLightbox(-1);
            if (e.key === 'ArrowRight') navigateLightbox(1);
            if (e.key === 'Escape') hideModal(imageLightboxModal);
        }
    });

    // AI Modal Listeners
    askAiBtn.addEventListener('click', async () => {
        if (!API_KEY) {
            await showAlert("La clave de API de Gemini no está configurada. No se puede usar la función de IA.");
            return;
        }
        aiResponseArea.innerHTML = "Escribe tu pregunta a continuación...";
        aiQuestionInput.value = '';
        showModal(aiQaModal);
    });
    cancelAiQaBtn.addEventListener('click', () => hideModal(aiQaModal));
    sendAiQaBtn.addEventListener('click', async () => {
        const question = aiQuestionInput.value.trim();
        if (!question) return;

        aiQaLoader.style.display = 'block';
        sendAiQaBtn.disabled = true;
        
        try {
            const state = getStateObject();
            let context = "Información del temario:\n";
            state.topics.forEach((topicData, topicId) => {
                const row = document.querySelector(`tr[data-topic-id="${topicId}"]`);
                const topicTitle = row.cells[1].textContent;
                if (topicData.note) {
                    context += `\n---\nTEMA: ${topicTitle}\nAPUNTES: ${topicData.note}\n---\n`;
                }
            });
            
            const fullPrompt = `Contexto:\n${context}\n\nPregunta del usuario: ${question}\n\nResponde a la pregunta basándote únicamente en el contexto proporcionado. Sé conciso y directo.`;
            
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: [{ parts: [{ text: fullPrompt }] }],
            });

            aiResponseArea.innerHTML = response.text.replace(/\n/g, '<br>');

        } catch (error) {
            console.error("Gemini API error:", error);
            aiResponseArea.innerHTML = "Hubo un error al contactar a la IA. Revisa la consola para más detalles.";
        } finally {
            aiQaLoader.style.display = 'none';
            sendAiQaBtn.disabled = false;
        }
    });

    // Global listeners & settings
    searchBar.addEventListener('input', filterTable);
    confidenceFiltersContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (btn) {
            confidenceFiltersContainer.querySelector('.active').classList.remove('active');
            btn.classList.add('active');
            activeConfidenceFilter = btn.dataset.filter;
            filterTable();
        }
    });

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!settingsBtn.contains(e.target) && !settingsDropdown.contains(e.target)) {
            settingsDropdown.classList.add('hidden');
        }
        document.querySelectorAll('.color-submenu.visible, .symbol-dropdown-content.visible').forEach(d => {
            if (!d.parentElement.contains(e.target)) {
                d.classList.remove('visible');
            }
        });
    });

    settingsDropdown.addEventListener('click', (e) => {
        e.preventDefault();
        const themeOption = e.target.closest('.theme-option');
        const iconStyleOption = e.target.closest('.icon-style-option');
        if (themeOption) {
            applyTheme(themeOption.dataset.theme);
            saveState();
        }
        if (iconStyleOption) {
            applyIconStyle(iconStyleOption.dataset.style);
            saveState();
        }
    });

    toggleAllSectionsBtn.addEventListener('click', () => {
        const areAllCollapsed = Array.from(document.querySelectorAll('.section-header-row')).every(row => row.classList.contains('collapsed'));
        
        document.querySelectorAll('.section-header-row').forEach(headerRow => {
            if (areAllCollapsed) { // expand all
                headerRow.classList.remove('collapsed');
            } else { // collapse all
                headerRow.classList.add('collapsed');
            }
            const event = new MouseEvent('click', { bubbles: true, cancelable: true });
            headerRow.dispatchEvent(event); // trigger collapse/expand logic
            headerRow.dispatchEvent(event); // needs to be called twice to override individual states
        });
        saveState();
    });

    // Import/Export listeners
    exportBtn.addEventListener('click', () => {
        const state = getStateObject();
        const dataStr = JSON.stringify(state);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `temario_progreso_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const newState = JSON.parse(event.target.result);
                    _loadStateFromObject(newState);
                    updateAllTotals();
                    filterTable();
                    saveState(); // Save the newly imported state to DB
                    showAlert("Progreso importado con éxito.");
                } catch (error) {
                    console.error("Error parsing imported file:", error);
                    showAlert("El archivo importado no es válido.", "Error de Importación");
                }
            };
            reader.readAsText(file);
        }
        importFileInput.value = ''; // Reset for next import
    });

    exportNoteBtn.addEventListener('click', () => {
        const title = notesModalTitle.textContent || 'Nota';
        const content = notesEditor.innerHTML;
        const fullHtml = getStyledExportHtml(content, title);
        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/ /g, '_')}.html`;
        a.click();
        URL.revokeObjectURL(url);
    });

    importNoteBtn.addEventListener('click', () => importNoteFileInput.click());
    importNoteFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                notesEditor.focus();
                const currentContent = notesEditor.innerHTML;
                // Avoid inserting into an empty editor, just replace content
                if (currentContent === '<p><br></p>' || currentContent.trim() === '') {
                     document.execCommand('insertHTML', false, event.target.result);
                } else {
                     document.execCommand('insertHTML', false, '<hr>' + event.target.result);
                }
            };
            reader.readAsText(file);
        }
        importNoteFileInput.value = '';
    });
    
    // Dialog modal buttons
    confirmConfirmationBtn.addEventListener('click', () => {
        if(resolveConfirmation) resolveConfirmation(true);
        hideModal(confirmationModal);
    });
    cancelConfirmationBtn.addEventListener('click', () => {
        if(resolveConfirmation) resolveConfirmation(false);
        hideModal(confirmationModal);
    });
    okAlertBtn.addEventListener('click', () => hideModal(alertModal));

    // Resizer Logic
    function initResize(modalElement) {
        let startX, startY, startWidth, startHeight;

        function doDrag(e) {
            modalElement.style.width = (startWidth + e.clientX - startX) + 'px';
            modalElement.style.height = (startHeight + e.clientY - startY) + 'px';
        }

        function stopDrag() {
            document.documentElement.removeEventListener('mousemove', doDrag, false);
            document.documentElement.removeEventListener('mouseup', stopDrag, false);
        }

        modalElement.querySelector('.resizer-br').addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(document.defaultView.getComputedStyle(modalElement).width, 10);
            startHeight = parseInt(document.defaultView.getComputedStyle(modalElement).height, 10);
            document.documentElement.addEventListener('mousemove', doDrag, false);
            document.documentElement.addEventListener('mouseup', stopDrag, false);
        });
    }
    
    function initPanelResize(panelElement) {
        let startX, startWidth;
        
        function doDragPanel(e) {
            panelElement.style.width = (startWidth + e.clientX - startX) + 'px';
        }
        
        function stopDragPanel() {
            document.documentElement.removeEventListener('mousemove', doDragPanel, false);
            document.documentElement.removeEventListener('mouseup', stopDragPanel, false);
        }

        panelElement.querySelector('.resizer-e-panel').addEventListener('mousedown', (e) => {
             e.preventDefault();
             startX = e.clientX;
             startWidth = parseInt(document.defaultView.getComputedStyle(panelElement).width, 10);
             document.documentElement.addEventListener('mousemove', doDragPanel, false);
             document.documentElement.addEventListener('mouseup', stopDragPanel, false);
        });
    }


    // --- Initialization ---
    initResize(notesModal.querySelector('.modal-content'));
    initPanelResize(notesSidePanel);
    initializeCells();
    loadState();
    setupEditorToolbar();
    populateIconPicker();
    updateSectionHeaderCounts();
});