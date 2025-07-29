
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

    // Post-it Note Modal
    const postitNoteModal = getElem('postit-note-modal');
    const postitNoteTextarea = getElem('postit-note-textarea');
    const savePostitBtn = getElem('save-postit-icon-btn');
    const deletePostitBtn = getElem('delete-postit-icon-btn');
    const closePostitBtn = getElem('close-postit-icon-btn');

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
    let activePostitLink = null;
    let savedEditorSelection = null;


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
                swatch.addEventListener('mousedown', (e) => e.preventDefault());
                swatch.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (savedEditorSelection) {
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(savedEditorSelection);
                    }
                    action(color);
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
        
        const postitSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-pen-line w-5 h-5"><path d="m18 12-4 4-1 4 4-1 4-4"/><path d="M12 22h6"/><path d="M7 12h10"/><path d="M5 17h10"/><path d="M5 7h10"/><path d="M15 2H9a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/></svg>`;
        editorToolbar.appendChild(createButton('Añadir Nota Post-it', postitSVG, null, null, createPostitLink));
        
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
             printArea.innerHTML = `<div>${notesEditor.innerHTML}</div>`;
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
        
        // Keep existing postits data
        const existingPostits = currentNotesArray[activeNoteIndex].postits || {};
        currentNotesArray[activeNoteIndex] = {
            title: currentTitle,
            content: currentContent,
            lastEdited: new Date().toISOString(),
            postits: existingPostits
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
            postits: {}
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

    function createPostitLink() {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            showAlert("Por favor, selecciona el texto que quieres convertir en una nota.");
            return;
        }

        const range = selection.getRangeAt(0);
        const uniqueId = `postit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const span = document.createElement('span');
        span.className = 'postit-link';
        span.dataset.postitId = uniqueId;
        
        // Use the selected content for the span
        const selectedContent = range.extractContents();
        span.appendChild(selectedContent);

        range.insertNode(span);

        // Move cursor after the inserted span to avoid "sticky style"
        const newRange = document.createRange();
        newRange.setStartAfter(span);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        notesEditor.focus();

        // Ensure the new note is saved to the current note object
        if (currentNotesArray[activeNoteIndex]) {
            if (!currentNotesArray[activeNoteIndex].postits) {
                currentNotesArray[activeNoteIndex].postits = {};
            }
            currentNotesArray[activeNoteIndex].postits[uniqueId] = '';
            saveCurrentNote();
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
                 document.execCommand('removeFormat');
                 const span = document.createElement('span');
                 span.className = 'gallery-link';
                 span.dataset.images = JSON.stringify(images);
                 span.appendChild(activeGalleryRange.extractContents());
                 activeGalleryRange.insertNode(span);
            }
            hideModal(imageGalleryLinkModal);
            activeGalleryRange = null;
        }
    }
    
    function openImageLightbox(imagesData, startIndex = 0) {
        try {
            lightboxImages = JSON.parse(imagesData);
            if (!Array.isArray(lightboxImages) || lightboxImages.length === 0) return;
            currentLightboxIndex = startIndex;
            updateLightboxView();
            showModal(imageLightboxModal);
        } catch(e) {
            console.error("Could not parse image gallery data:", e);
            showAlert("No se pudo abrir la galería de imágenes. Los datos pueden estar corruptos.");
        }
    }

    function updateLightboxView() {
        if (lightboxImages.length === 0) return;
        const image = lightboxImages[currentLightboxIndex];
        lightboxImage.src = image.url;
        
        const captionText = `${image.caption || ''} (${currentLightboxIndex + 1} / ${lightboxImages.length})`;
        lightboxCaption.textContent = captionText.trim();
        lightboxCaption.style.display = captionText.trim() === `(${currentLightboxIndex + 1} / ${lightboxImages.length})` ? 'none' : 'block';

        prevLightboxBtn.style.display = currentLightboxIndex > 0 ? 'block' : 'none';
        nextLightboxBtn.style.display = currentLightboxIndex < lightboxImages.length - 1 ? 'block' : 'none';
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
                    noteContent.querySelectorAll('a.postit-link, a.gallery-link').forEach(link => {
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

        // Search and filter
        searchBar.addEventListener('input', filterTable);
        confidenceFiltersContainer.addEventListener('click', e => {
            const filterBtn = e.target.closest('.filter-btn');
            if (filterBtn) {
                confidenceFiltersContainer.querySelector('.active')?.classList.remove('active', 'bg-sky-500', 'text-white', 'dark:bg-sky-500');
                filterBtn.classList.add('active', 'bg-sky-500', 'text-white', 'dark:bg-sky-500');
                activeConfidenceFilter = filterBtn.dataset.filter;
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
            const noteContent = notesEditor.innerHTML;
            const noteTitle = (notesModalTitle.textContent || 'nota').trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${notesModalTitle.textContent}</title></head><body>${noteContent}</body></html>`], { type: 'text/html' });
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
                 openImageLightbox(galleryLink.dataset.images);
                 return;
             }
             
             // Handle post-it link clicks
             const postitLink = e.target.closest('.postit-link');
             if (postitLink) {
                 e.preventDefault();
                 activePostitLink = postitLink;
                 const postitId = postitLink.dataset.postitId;
                 const noteData = currentNotesArray[activeNoteIndex];
                 const postitContent = (noteData && noteData.postits) ? noteData.postits[postitId] : '';
                 postitNoteTextarea.value = postitContent || '';
                 showModal(postitNoteModal);
                 postitNoteTextarea.focus();
                 return;
             }
        });

        // --- Post-it Modal Listeners ---
        savePostitBtn.addEventListener('click', () => {
            if (activePostitLink && currentNotesArray[activeNoteIndex]) {
                const postitId = activePostitLink.dataset.postitId;
                if (!currentNotesArray[activeNoteIndex].postits) {
                    currentNotesArray[activeNoteIndex].postits = {};
                }
                currentNotesArray[activeNoteIndex].postits[postitId] = postitNoteTextarea.value;
                hideModal(postitNoteModal);
                activePostitLink = null;
                saveCurrentNote(); // Save the main note to persist post-it changes
            }
        });

        deletePostitBtn.addEventListener('click', async () => {
            if (activePostitLink) {
                const confirmed = await showConfirmation("¿Eliminar esta nota? El texto se mantendrá pero la nota se borrará permanentemente.");
                if (confirmed) {
                    // Remove postit data from note object
                    if (currentNotesArray[activeNoteIndex] && currentNotesArray[activeNoteIndex].postits) {
                        delete currentNotesArray[activeNoteIndex].postits[activePostitLink.dataset.postitId];
                    }
                    // Unwrap the span
                    const parent = activePostitLink.parentNode;
                    while (activePostitLink.firstChild) {
                        parent.insertBefore(activePostitLink.firstChild, activePostitLink);
                    }
                    parent.removeChild(activePostitLink);
                    
                    hideModal(postitNoteModal);
                    activePostitLink = null;
                    saveCurrentNote();
                }
            }
        });
        
        closePostitBtn.addEventListener('click', () => {
            hideModal(postitNoteModal);
            activePostitLink = null;
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
                const fullPrompt = `Basado en las siguientes notas de estudio, responde la pregunta del usuario. Contenido de las notas:\n\n${notesContext}\n\nPregunta: ${question}`;

                const response = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                });
                
                aiResponseArea.innerHTML = response.text.replace(/\n/g, '<br>');

            } catch (error) {
                console.error("AI Error:", error);
                aiResponseArea.textContent = "Error al contactar a la IA: " + error.message;
            } finally {
                aiQaLoader.style.display = 'none';
                sendAiQaBtn.disabled = false;
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
        applyTheme(document.documentElement.dataset.theme || 'default');
    }

    init();
});
