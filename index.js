/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from "@google/genai";

const API_KEY = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';

document.addEventListener('DOMContentLoaded', function () {
    // --- DOM Element Cache ---
    const getElem = (id) => document.getElementById(id);
    const tableBody = getElem('table-body');
    const notesModal = getElem('notes-modal');
    const notesModalTitle = getElem('notes-modal-title');
    const notesModalCounter = getElem('notes-modal-counter');
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
        const startNode = range.startContainer;
        const endNode = range.endContainer;

        const findBlock = (node) => {
            while (node && node.nodeName !== 'BODY') {
                if (node.nodeType === 1 && getComputedStyle(node).display !== 'inline') {
                     // Check if it's inside the editor
                    if (notesEditor.contains(node)) return node;
                }
                node = node.parentNode;
            }
            return notesEditor; // Fallback to editor itself
        };

        let startBlock = findBlock(startNode);
        let endBlock = findBlock(endNode);

        // Special handling for <summary> inside <details>
        if (startNode.parentNode.nodeName === 'SUMMARY') startBlock = startNode.parentNode.closest('details');
        if (endNode.parentNode.nodeName === 'SUMMARY') endBlock = endNode.parentNode.closest('details');
        
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
             getSelectedBlockElements().forEach(block => {
                if (block === notesEditor) {
                    // This can happen if the editor is empty or focus is weird.
                    // Let's try to get the first child block element.
                    block = notesEditor.querySelector('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, details');
                }
                
                const targetBlock = block ? (block.nodeName === 'DETAILS' ? block : block.closest('p, h1, h2, h3, h4, h5, h6, div, li, blockquote, pre, details')) : null;

                if (targetBlock && targetBlock !== notesEditor) {
                    targetBlock.style.backgroundColor = color === 'transparent' ? '' : color;
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

        // --- Indentation & Accordion ---
        const outdentSVG = `<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zM7 8v8l-4-4 4-4zm4-4h10V3H11v1zm0 4h10V7H11v2zm0 4h10v-2H11v2zm0 4h10v-2H11v2z"></path></svg>`;
        const indentSVG = `<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zM3 3v2h18V3H3zm8 4h10V5H11v2zm0 4h10V9H11v2zm0 4h10v-2H11v2zM3 8v8l4-4-4-4z"/></svg>`;
        const accordionSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-square w-5 h-5"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`;
        const accordionHTML = `<details><summary></summary><div><br></div></details><p><br></p>`;
        
        editorToolbar.appendChild(createButton('Disminuir Sangría', outdentSVG, 'outdent'));
        editorToolbar.appendChild(createButton('Aumentar Sangría', indentSVG, 'indent'));
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
            alert("Por favor, selecciona una imagen primero para cambiar su tamaño.");
        }
    }

    // --- Totals and Progress Calculation ---
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

            if (totalRowTds[1]) totalRowTds[1].textContent = '-';
            if (totalRowTds[2]) totalRowTds[2].textContent = String(sectionLecturaCount);
        });
        
        // Grand Totals
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
            version: '3.0',
            topics: {},
            sections: {},
            settings: {
                theme: document.documentElement.dataset.theme,
                iconStyle: document.documentElement.dataset.iconStyle,
            },
            headers: {}
        };

        // Get editable header text
        document.querySelectorAll('thead th[contenteditable="true"]').forEach((th, i) => {
            state.headers[`h${i}`] = th.innerText;
        });

        // Get topic data using permanent IDs
        document.querySelectorAll('tr[data-topic-id]').forEach(row => {
            const topicId = row.dataset.topicId;
            const notes = JSON.parse(row.dataset.notes || '[]');

            const topicData = {
                cells: {},
                notes: notes,
                confidence: row.querySelector('.confidence-dot')?.dataset.confidenceLevel || '0'
            };

            const references = JSON.parse(row.dataset.references || '[]');
            topicData.cells.references = references;
            
            const lecturaCounter = row.querySelector(`td[data-col="lectura"] .lectura-counter`);
            topicData.cells.lectura = lecturaCounter?.textContent || '0';

            state.topics[topicId] = topicData;
        });
        
        // Get section data
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

    function loadState(state) {
        if (!state) return;

        // Apply settings
        if(state.settings) {
            applyTheme(state.settings.theme || 'default');
            applyIconStyle(state.settings.iconStyle || 'solid');
        }

        // Load headers
        if(state.headers) {
            document.querySelectorAll('thead th[contenteditable="true"]').forEach((th, i) => {
                if(state.headers[`h${i}`]) {
                    th.innerText = state.headers[`h${i}`];
                }
            });
        }

        const isOldVersion = !state.version || parseFloat(state.version) < 3.0;
        
        // Load Topic Data
        if (state.topics) {
            for (const topicId in state.topics) {
                const row = document.querySelector(`tr[data-topic-id="${topicId}"]`);
                if (!row) continue;
                
                const topicData = state.topics[topicId];
                
                // Load cell statuses and links
                if (topicData.cells) {
                    const refCell = row.querySelector('td[data-col="references"]');
                    if(refCell && topicData.cells.references) {
                        row.dataset.references = JSON.stringify(topicData.cells.references);
                        renderReferencesCell(refCell);
                    }
                    const lectCell = row.querySelector('td[data-col="lectura"]');
                    if(lectCell && topicData.cells.lectura) {
                        const counter = lectCell.querySelector('.lectura-counter');
                        const count = parseInt(topicData.cells.lectura || '0', 10);
                        if (counter) counter.textContent = count;
                        lectCell.classList.toggle('lectura-filled', count > 0);
                    }
                }
                
                // Load notes (with backward compatibility)
                let notes = [];
                if (isOldVersion) { // Convert old format to new
                    const topicTitle = row.querySelector('.topic-text').textContent;
                    // Handle very old format with grey/blue notes
                    if (topicData.notes && (topicData.notes.grey || topicData.notes.blue)) {
                         if (topicData.notes?.grey?.content) {
                            const content = topicData.notes.grey.content;
                            const newContent = `<div>${content}</div>`;
                            notes.push({ 
                                title: `Esquema: ${topicTitle}`, 
                                content: newContent
                            });
                        }
                        if (topicData.notes?.blue?.content) {
                            const content = topicData.notes.blue.content;
                            const newContent = `<div>${content}</div>`;
                            notes.push({
                                title: `Desarrollo: ${topicTitle}`,
                                content: newContent
                            });
                        }
                    } else if (topicData.note) { // Handle single note format
                        const content = topicData.note.content || '';
                        const newContent = `<div>${content}</div>`;
                        notes.push({ title: topicTitle, content: newContent });
                    }
                } else { // Load new format
                    notes = topicData.notes || [];
                }

                row.dataset.notes = JSON.stringify(notes);
                const noteIcon = row.querySelector(`.note-icon[data-note-type="topic"]`);
                if(noteIcon) {
                    const hasContent = notes.some(n => n.content && n.content.trim() !== '' && n.content.trim() !== '<p><br></p>');
                    noteIcon.classList.toggle('has-note', hasContent);
                }

                // Load confidence level
                const confidenceDot = row.querySelector('.confidence-dot');
                if (confidenceDot && topicData.confidence) {
                    confidenceDot.dataset.confidenceLevel = topicData.confidence;
                }
            }
        }
        
        // Load Section Data
        if (state.sections) {
            for(const sectionId in state.sections) {
                const sectionData = state.sections[sectionId];
                const headerRow = document.querySelector(`tr[data-section-header="${sectionId}"]`);
                if(headerRow) {
                    if (sectionData.title) {
                        headerRow.querySelector('.section-title').textContent = sectionData.title;
                    }
                    if (sectionData.note) {
                        headerRow.dataset.sectionNote = sectionData.note;
                        const noteIcon = headerRow.querySelector('.section-note-icon');
                        if (noteIcon) noteIcon.classList.add('has-note');
                    }
                    if (sectionData.isCollapsed) {
                        headerRow.classList.add('collapsed');
                    }
                }
            }
        }

        updateAllTotals();
        filterTable();
    }
    
    function saveState() {
        try {
            const state = getStateObject();
            localStorage.setItem('temarioProgresoV2', JSON.stringify(state));
            showSaveConfirmation();
        } catch (error) {
            console.error("Error al guardar el estado:", error);
            alert("Hubo un error al guardar tu progreso. Es posible que el almacenamiento esté lleno.");
        }
    }

    function showSaveConfirmation() {
        clearTimeout(saveTimeout);
        saveConfirmation.classList.remove('opacity-0');
        saveTimeout = setTimeout(() => {
            saveConfirmation.classList.add('opacity-0');
        }, 1500);
    }

    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (theme === 'default') {
            document.documentElement.classList.toggle('dark', isDark);
        } else {
             document.documentElement.classList.remove('dark'); // Force light for themes
        }
    }

    function applyIconStyle(style) {
        document.documentElement.dataset.iconStyle = style;
    }

    function showModal(modal) {
        modal.classList.add('visible');
    }

    function hideModal(modal) {
        modal.classList.remove('visible');
    }

    function handleTableClick(event) {
        const target = event.target;
        const cell = target.closest('td');
        const row = target.closest('tr');
        
        if (!cell || !row) return;

        if(target.classList.contains('confidence-dot')) {
            event.stopPropagation();
            const currentLevel = parseInt(target.dataset.confidenceLevel || '0');
            const nextLevel = (currentLevel % 3) + 1;
            target.dataset.confidenceLevel = String(nextLevel);
            saveState();
            return;
        }

        if (cell.classList.contains('references-cell')) {
            event.stopPropagation();
            openReferencesModal(cell);
            return;
        }

        if (target.closest('.note-icon')) {
            event.preventDefault();
            event.stopPropagation();
            activeNoteIcon = target.closest('.note-icon');
            openNotesForTopic(activeNoteIcon);
            return;
        }

        if (cell.classList.contains('lectura-cell') && !target.closest('.note-icon')) {
             const counter = cell.querySelector('.lectura-counter');
             let count = parseInt(counter.textContent, 10);

             if (event.ctrlKey || event.metaKey) {
                count = Math.max(0, count - 1);
            } else {
                count = (count + 1) % 6;
            }
             counter.textContent = String(count);
             cell.classList.toggle('lectura-filled', count > 0);
             updateAllTotals();
             saveState();
             return;
        }

        if (row.classList.contains('section-header-row') && !target.closest('.note-icon') && !target.closest('.print-section-btn')) {
            row.classList.toggle('collapsed');
            filterTable();
            saveState();
            return;
        }

        if (target.closest('.print-section-btn')) {
            event.stopPropagation();
            const sectionHeaderRow = target.closest('.section-header-row');
            const sectionName = sectionHeaderRow.dataset.sectionHeader;
            const topicRows = document.querySelectorAll(`tr[data-section="${sectionName}"]`);
            
            let notesToPrint = [];
            topicRows.forEach(topicRow => {
                const notes = JSON.parse(topicRow.dataset.notes || '[]');
                if (notes.length > 0) {
                    notes.forEach(note => {
                        notesToPrint.push(`<h2>${note.title}</h2><div>${note.content}</div>`);
                    });
                }
            });

            if (notesToPrint.length > 0) {
                const printArea = getElem('print-area');
                printArea.innerHTML = notesToPrint.join('<hr style="page-break-after: always;">');
                window.print();
            } else {
                alert('No hay notas en esta sección para imprimir.');
            }
            return;
        }
    }

    function handleSearch() {
        filterTable();
    }
    
    function filterTable() {
        const searchTerm = searchBar.value.toLowerCase();
        const isColorFilterActive = activeConfidenceFilter !== 'all';

        // Filter individual topic rows first
        document.querySelectorAll('tr[data-topic-id]').forEach(row => {
            const topicText = (row.querySelector('.topic-text')?.textContent || '').toLowerCase();
            const matchesSearch = topicText.includes(searchTerm);
            
            const confidenceDot = row.querySelector('.confidence-dot');
            const confidenceLevel = confidenceDot ? confidenceDot.dataset.confidenceLevel : '0';
            const matchesConfidence = !isColorFilterActive || confidenceLevel === activeConfidenceFilter;

            // A row is hidden by collapse only if a color filter is NOT active
            const sectionHeader = document.querySelector(`tr[data-section-header="${row.dataset.section}"]`);
            const isHiddenByCollapse = !isColorFilterActive && sectionHeader && sectionHeader.classList.contains('collapsed');

            row.style.display = (matchesSearch && matchesConfidence && !isHiddenByCollapse) ? 'table-row' : 'none';
        });
        
        // Then, show/hide section headers and totals based on the results
        Object.keys(sections).forEach(sectionName => {
             const headerRow = sections[sectionName].headerRow;
             const totalRow = sections[sectionName].totalRow;

             if (isColorFilterActive) {
                headerRow.style.display = 'none';
                if (totalRow) totalRow.style.display = 'none';
             } else {
                // Show section chrome only if it has visible children or search is empty
                const sectionRows = document.querySelectorAll(`tr[data-section="${sectionName}"]`);
                const hasVisibleRow = Array.from(sectionRows).some(r => r.style.display !== 'none');
                
                headerRow.style.display = (hasVisibleRow || searchTerm === '') ? 'table-row' : 'none';

                if (totalRow) {
                   const sectionIsCollapsed = headerRow.classList.contains('collapsed');
                   totalRow.style.display = (hasVisibleRow && !sectionIsCollapsed) ? 'table-row' : 'none';
                }
             }
        });
    }

    // --- References Modal Logic ---

    function createReferenceSlot(ref = { icon: '🔗', url: '' }) {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'flex items-center gap-2';

        const iconButton = document.createElement('button');
        iconButton.className = 'p-2 border border-border-color rounded-md hover:bg-bg-tertiary flex-shrink-0 text-xl w-12 h-12 flex items-center justify-center';
        iconButton.innerHTML = ref.icon;
        iconButton.dataset.icon = ref.icon;
        iconButton.addEventListener('click', (e) => {
            e.preventDefault();
            activeIconPickerButton = iconButton;
            showModal(iconPickerModal);
        });

        const urlInput = document.createElement('input');
        urlInput.type = 'url';
        urlInput.className = 'w-full p-2 border border-border-color rounded-lg bg-secondary focus:ring-2 focus:ring-sky-400';
        urlInput.placeholder = 'https://ejemplo.com';
        urlInput.value = ref.url;

        const deleteButton = document.createElement('button');
        deleteButton.className = 'p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 rounded-full';
        deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 4a1 1 0 100 2h2a1 1 0 100-2H8z" clip-rule="evenodd" /></svg>`;
        deleteButton.title = "Eliminar referencia";
        deleteButton.addEventListener('click', (e) => {
            e.preventDefault();
            slotDiv.remove();
        });

        slotDiv.appendChild(iconButton);
        slotDiv.appendChild(urlInput);
        slotDiv.appendChild(deleteButton);
        return slotDiv;
    }

    function openReferencesModal(cell) {
        activeReferencesCell = cell;
        const row = cell.closest('tr');
        if (!row) return;

        referencesEditor.innerHTML = '';
        const references = JSON.parse(row.dataset.references || '[]');
        
        if (references.length > 0) {
            references.forEach(ref => {
                referencesEditor.appendChild(createReferenceSlot(ref));
            });
        } else {
             referencesEditor.appendChild(createReferenceSlot());
        }

        showModal(referencesModal);
    }
    
    function saveReferences() {
        if (!activeReferencesCell) return;
        const row = activeReferencesCell.closest('tr');

        const newReferences = [];
        referencesEditor.querySelectorAll('.flex.items-center.gap-2').forEach(slotDiv => {
            const url = slotDiv.querySelector('input').value.trim();
            const icon = slotDiv.querySelector('button').dataset.icon;
            if (url) {
                newReferences.push({ icon, url });
            }
        });

        row.dataset.references = JSON.stringify(newReferences);
        renderReferencesCell(activeReferencesCell);
        
        hideModal(referencesModal);
        updateAllTotals();
        saveState();
    }
    
    function setupEmojiPicker() {
        iconPickerCategories.innerHTML = '';
        
        const renderCategory = (categoryName) => {
            emojiGrid.innerHTML = '';
            const emojis = EMOJI_CATEGORIES[categoryName];
            emojis.forEach(emoji => {
                const btn = document.createElement('button');
                btn.className = 'emoji-btn toolbar-btn';
                btn.textContent = emoji;
                btn.addEventListener('click', () => {
                    if (activeIconPickerButton) {
                        activeIconPickerButton.textContent = emoji;
                        activeIconPickerButton.dataset.icon = emoji;
                    }
                    hideModal(iconPickerModal);
                });
                emojiGrid.appendChild(btn);
            });
        };

        Object.keys(EMOJI_CATEGORIES).forEach((categoryName, index) => {
            const btn = document.createElement('button');
            btn.className = 'category-btn';
            btn.textContent = categoryName;
            if (index === 0) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                iconPickerCategories.querySelector('.active')?.classList.remove('active');
                btn.classList.add('active');
                renderCategory(categoryName);
            });
            iconPickerCategories.appendChild(btn);
        });

        renderCategory(Object.keys(EMOJI_CATEGORIES)[0]);
    }

    // --- Multi-Note Modal Logic ---

    function openNotesForTopic(icon) {
        const row = icon.closest('tr');
        if (!row) return;

        currentNotesArray = JSON.parse(row.dataset.notes || '[]');
        
        if (icon.classList.contains('section-note-icon')) {
             // Handle section notes (simplified: one note per section)
             const sectionTitle = row.querySelector('.section-title').textContent;
             if (currentNotesArray.length === 0) {
                currentNotesArray.push({ title: `Notas de: ${sectionTitle}`, content: '' });
             }
             addNotePanelBtn.style.display = 'none'; // No adding notes for sections
        } else {
             // Handle topic notes
            const topicTitle = row.querySelector('.topic-text').textContent;
            if (currentNotesArray.length === 0) {
                currentNotesArray.push({ title: topicTitle, content: '' });
            }
            addNotePanelBtn.style.display = 'flex';
        }
        
        // Ensure side panel is closed by default
        notesSidePanel.classList.remove('open');
        notesPanelToggle.classList.remove('open');

        // Reset resizable elements' dimensions
        const modalContent = notesModal.querySelector('.modal-content');
        modalContent.style.width = '';
        modalContent.style.height = '';
        notesSidePanel.style.width = '';

        activeNoteIndex = 0;
        renderNotesList();
        loadNoteIntoEditor(activeNoteIndex);
        showModal(notesModal);
    }
    
    function renderNotesList() {
        notesList.innerHTML = '';
        currentNotesArray.forEach((note, index) => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.className = 'note-item-btn';
            button.dataset.index = index;
            if (index === activeNoteIndex) {
                button.classList.add('active');
            }

            const titleSpan = document.createElement('span');
            titleSpan.className = 'note-title-text';
            titleSpan.textContent = note.title;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-note-btn toolbar-btn';
            deleteBtn.dataset.index = index;
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Eliminar esta nota';

            button.appendChild(titleSpan);
            button.appendChild(deleteBtn);
            li.appendChild(button);
            notesList.appendChild(li);
        });
    }

    function loadNoteIntoEditor(index) {
        if (index < 0 || index >= currentNotesArray.length) return;
        
        activeNoteIndex = index;
        const note = currentNotesArray[index];
        
        notesModalTitle.textContent = note.title || 'Nota sin título';
        notesEditor.innerHTML = note.content || '';

        // Update counter
        notesModalCounter.textContent = `(${index + 1}/${currentNotesArray.length})`;
        notesModalCounter.style.display = currentNotesArray.length > 1 ? 'inline' : 'none';

        // Update active state in list
        document.querySelectorAll('#notes-list .note-item-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.index) === index);
        });
    }

    function saveCurrentNote() {
        if (activeNoteIndex < 0 || activeNoteIndex >= currentNotesArray.length) return;
        currentNotesArray[activeNoteIndex].title = notesModalTitle.textContent.trim();
        currentNotesArray[activeNoteIndex].content = notesEditor.innerHTML;
    }
    
    function saveCurrentNoteAndPersist() {
        saveCurrentNote();

        if (activeNoteIcon) {
            const row = activeNoteIcon.closest('tr');
            if (row) {
                row.dataset.notes = JSON.stringify(currentNotesArray);
                const hasContent = currentNotesArray.some(n => n.content && n.content.trim() && n.content.trim() !== '<p><br></p>');
                
                // Use toggle for cleaner code. This applies/removes .has-note class.
                activeNoteIcon.classList.toggle('has-note', hasContent);
            }
        }
        renderNotesList();
        saveState();
    }

    function closeNotesModal(save = false) {
        if (save) {
            saveCurrentNoteAndPersist();
        }
        hideModal(notesModal);
        activeNoteIcon = null;
        currentNotesArray = [];
        activeNoteIndex = 0;
    }

    function setupResizableElements() {
        const modalContentForResize = notesModal.querySelector('.modal-content');
        const panelForResize = notesSidePanel;
        let currentResizer = null;
        let initialX, initialY, modalRect, panelRect;

        const handleMouseMove = (e) => {
            if (!isResizing) return;
            
            if (currentResizer.classList.contains('resizer-e-panel')) {
                const newWidth = panelRect.width + (e.clientX - initialX);
                if (newWidth > 150 && newWidth < 500) { // Min/max width for panel
                   panelForResize.style.width = newWidth + 'px';
                }
            } else {
                if (currentResizer.classList.contains('resizer-r') || currentResizer.classList.contains('resizer-br')) {
                    const newWidth = modalRect.width + (e.clientX - initialX);
                    if (newWidth > 500) { // Min width for modal
                        modalContentForResize.style.width = newWidth + 'px';
                    }
                }

                if (currentResizer.classList.contains('resizer-b') || currentResizer.classList.contains('resizer-br')) {
                    const newHeight = modalRect.height + (e.clientY - initialY);
                     if (newHeight > 400) { // Min height for modal
                        modalContentForResize.style.height = newHeight + 'px';
                    }
                }
            }
        };

        const handleMouseUp = () => {
            isResizing = false;
            currentResizer = null;
            document.body.style.cursor = 'default';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousedown', e => {
            if (e.target.classList.contains('resizer')) {
                e.preventDefault();
                currentResizer = e.target;
                isResizing = true;
                
                modalRect = modalContentForResize.getBoundingClientRect();
                panelRect = panelForResize.getBoundingClientRect();
                initialX = e.clientX;
                initialY = e.clientY;
                document.body.style.cursor = window.getComputedStyle(currentResizer).cursor;

                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener('mouseup', handleMouseUp);
            }
        });
    }
    
    function init() {
        initializeCells();
        setupEditorToolbar();
        setupEmojiPicker();
        setupResizableElements();

        // --- Event Listeners ---
        tableBody.addEventListener('click', handleTableClick);
        tableBody.addEventListener('input', (e) => {
            if (e.target.matches('thead th[contenteditable="true"]')) {
                saveState();
            }
        });
        
        searchBar.addEventListener('input', handleSearch);

        // Confidence Filters
        confidenceFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-btn');
            if (btn) {
                confidenceFiltersContainer.querySelector('.active').classList.remove('active');
                btn.classList.add('active');
                activeConfidenceFilter = btn.dataset.filter;
                filterTable();
            }
        });
        
        // Notes Modal
        saveNoteBtn.addEventListener('click', () => {
            saveCurrentNoteAndPersist();
        });
        saveAndCloseNoteBtn.addEventListener('click', () => closeNotesModal(true));
        cancelNoteBtn.addEventListener('click', () => closeNotesModal(false));
        unmarkNoteBtn.addEventListener('click', () => {
            if(confirm('¿Estás seguro de que quieres borrar todo el contenido de esta nota?')) {
                notesEditor.innerHTML = '';
            }
        });
        notesModalTitle.addEventListener('blur', () => {
            if (activeNoteIndex >= 0 && activeNoteIndex < currentNotesArray.length) {
                currentNotesArray[activeNoteIndex].title = notesModalTitle.textContent;
                renderNotesList(); // Update list display
            }
        });
        
        // --- Multi-note Panel Listeners ---
        notesPanelToggle.addEventListener('click', () => {
            notesSidePanel.classList.toggle('open');
            notesPanelToggle.classList.toggle('open');
        });

        addNotePanelBtn.addEventListener('click', () => {
            saveCurrentNote();
            const newNote = { title: 'Nueva Nota', content: '' };
            currentNotesArray.push(newNote);
            activeNoteIndex = currentNotesArray.length - 1;
            renderNotesList();
            loadNoteIntoEditor(activeNoteIndex);
            notesModalTitle.focus();
            try {
                const selection = window.getSelection();
                if (!selection) return;
                const range = document.createRange();
                range.selectNodeContents(notesModalTitle);
                selection.removeAllRanges();
                selection.addRange(range);
            } catch(e) {
                console.error("Could not select title text:", e);
            }
        });
        
        notesList.addEventListener('click', (e) => {
            const itemBtn = e.target.closest('.note-item-btn');
            const deleteBtn = e.target.closest('.delete-note-btn');
            
            if (deleteBtn) {
                e.stopPropagation();
                const indexToDelete = parseInt(deleteBtn.dataset.index, 10);
                if (currentNotesArray.length <= 1) {
                    alert('No puedes eliminar la última nota.');
                    return;
                }
                if (confirm(`¿Estás seguro de que quieres eliminar la nota "${currentNotesArray[indexToDelete].title}"?`)) {
                    saveCurrentNote();
                    currentNotesArray.splice(indexToDelete, 1);
                    if (activeNoteIndex >= indexToDelete) {
                        activeNoteIndex = Math.max(0, activeNoteIndex - 1);
                    }
                    renderNotesList();
                    loadNoteIntoEditor(activeNoteIndex);
                }
            } else if (itemBtn) {
                const indexToLoad = parseInt(itemBtn.dataset.index, 10);
                if (indexToLoad !== activeNoteIndex) {
                    saveCurrentNote();
                    loadNoteIntoEditor(indexToLoad);
                }
            }
        });


        // Global click to hide dropdowns
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

        // Settings Dropdown
        settingsBtn.addEventListener('click', () => settingsDropdown.classList.toggle('hidden'));
        document.querySelectorAll('.theme-option').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                applyTheme(el.dataset.theme);
                saveState();
            });
        });
        document.querySelectorAll('.icon-style-option').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                applyIconStyle(el.dataset.style);
                saveState();
            });
        });
        
        toggleAllSectionsBtn.addEventListener('click', () => {
            const allHeaders = document.querySelectorAll('.section-header-row');
            // If any section is currently collapsed, expand all. Otherwise, collapse all.
            const shouldCollapse = Array.from(allHeaders).some(h => !h.classList.contains('collapsed'));
            allHeaders.forEach(h => h.classList.toggle('collapsed', shouldCollapse));
            filterTable();
            saveState();
        });

        // Import/Export
        exportBtn.addEventListener('click', () => {
            const state = getStateObject();
            const dataStr = JSON.stringify(state, null, 2);
            const blob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().slice(0, 10);
            a.download = `progreso-medicina-${date}.json`;
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
                        const state = JSON.parse(event.target.result);
                        if (confirm("¿Estás seguro de que quieres importar este progreso? Se sobrescribirá tu progreso actual.")) {
                            loadState(state);
                        }
                    } catch (err) {
                        alert('Error al leer el archivo. Asegúrate de que es un archivo de progreso válido.');
                        console.error(err);
                    }
                };
                reader.readAsText(file);
                importFileInput.value = ''; // Reset for next import
            }
        });

        // Note Import/Export
        exportNoteBtn.addEventListener('click', () => {
            const title = notesModalTitle.textContent;
            const content = notesEditor.innerHTML;
            const html = `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${title}</h1>${content}</body></html>`;
            const blob = new Blob([html], {type: 'text/html'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
            a.click();
            URL.revokeObjectURL(url);
        });
        importNoteBtn.addEventListener('click', () => importNoteFileInput.click());
        importNoteFileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const content = event.target.result;
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(content, 'text/html');
                    notesEditor.innerHTML = doc.body.innerHTML;
                };
                reader.readAsText(file);
                importNoteFileInput.value = '';
            }
        });
        
        // Readonly mode toggle
        toggleReadOnlyBtn.addEventListener('click', () => {
            const modalContent = notesModal.querySelector('.modal-content');
            modalContent.classList.toggle('readonly-mode');
            notesEditor.contentEditable = !modalContent.classList.contains('readonly-mode');
            toggleReadOnlyBtn.classList.toggle('text-blue-500', modalContent.classList.contains('readonly-mode'));
        });

        // Image resizing logic
        notesEditor.addEventListener('click', e => {
            if (e.target.tagName === 'IMG') {
                if (selectedImageForResize) {
                    selectedImageForResize.classList.remove('selected-for-resize');
                }
                selectedImageForResize = e.target;
                selectedImageForResize.classList.add('selected-for-resize');
            } else {
                 if (selectedImageForResize) {
                    selectedImageForResize.classList.remove('selected-for-resize');
                    selectedImageForResize = null;
                }
            }
        });
        
        // References Modal
        addReferenceSlotBtn.addEventListener('click', (e) => {
            e.preventDefault();
            referencesEditor.appendChild(createReferenceSlot());
        });
        saveReferencesBtn.addEventListener('click', saveReferences);
        cancelReferencesBtn.addEventListener('click', () => hideModal(referencesModal));

        // Icon Picker Modal
        cancelIconPickerBtn.addEventListener('click', () => hideModal(iconPickerModal));

        // AI Modal
        askAiBtn.addEventListener('click', () => {
            if (!API_KEY) {
                aiResponseArea.textContent = 'Error: La API Key de Gemini no está configurada.';
                return;
            }
            aiResponseArea.textContent = 'Escribe tu pregunta a continuación...';
            aiQuestionInput.value = '';
            showModal(aiQaModal);
        });
        cancelAiQaBtn.addEventListener('click', () => hideModal(aiQaModal));
        sendAiQaBtn.addEventListener('click', async () => {
             if (!API_KEY) {
                aiResponseArea.textContent = 'Error: La API Key de Gemini no está configurada.';
                return;
            }
            const question = aiQuestionInput.value.trim();
            if (!question) return;

            aiQaLoader.style.display = 'block';
            sendAiQaBtn.disabled = true;
            aiResponseArea.textContent = 'Pensando...';
            
            try {
                const ai = new GoogleGenAI({apiKey: API_KEY});
                
                const allNotes = [];
                document.querySelectorAll('tr[data-topic-id]').forEach(row => {
                    const topic = row.querySelector('.topic-text').textContent;
                    const notes = JSON.parse(row.dataset.notes || '[]');
                    if (notes.some(n => n.content && n.content.trim() !== '')) {
                         notes.forEach(note => {
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = note.content;
                            allNotes.push(`## Tema: ${topic} (Sub-nota: ${note.title})\n\n${tempDiv.innerText}\n\n`);
                         });
                    }
                });

                const context = allNotes.length > 0 
                    ? `Aquí están mis notas personales sobre varios temas de medicina:\n\n${allNotes.join('---\n')}`
                    : "No tengo notas guardadas actualmente.";

                const prompt = `${context}\n\nBasado en mis notas (si existen), por favor responde la siguiente pregunta. Si mis notas no contienen la información, usa tu conocimiento general de medicina. La pregunta es: ${question}`;

                const response = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: prompt,
                });
                aiResponseArea.textContent = response.text;

            } catch (error) {
                console.error("Error with Gemini API:", error);
                aiResponseArea.textContent = 'Hubo un error al contactar a la IA. Por favor, revisa la consola para más detalles.';
            } finally {
                aiQaLoader.style.display = 'none';
                sendAiQaBtn.disabled = false;
            }
        });

        // --- Initial Load ---
        try {
            const savedState = localStorage.getItem('temarioProgresoV2');
            if (savedState) {
                loadState(JSON.parse(savedState));
            } else {
                updateSectionHeaderCounts();
                updateAllTotals();
            }
        } catch (error) {
            console.error("Error al cargar el estado guardado:", error);
            localStorage.removeItem('temarioProgresoV2');
        }
        filterTable(); // Apply initial filter (hides collapsed sections)
    }

    init(); // Run the app
});