

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

document.addEventListener('DOMContentLoaded', function () {
    // --- DOM Element Cache ---
    const getElem = (id) => document.getElementById(id);
    const tableBody = getElem('table-body');
    const linkModal = getElem('link-modal');
    const notesModal = getElem('notes-modal');
    const notesModalTitle = getElem('notes-modal-title');
    const notesEditor = getElem('notes-editor');
    const editorToolbar = notesModal.querySelector('.editor-toolbar');
    const linkInput = getElem('link-input');
    const saveLinkBtn = getElem('save-link-btn');
    const cancelLinkBtn = getElem('cancel-link-btn');
    const openLinkPreviewBtn = getElem('open-link-preview');
    const saveNoteBtn = getElem('save-note-btn');
    const saveAndCloseNoteBtn = getElem('save-and-close-note-btn');
    const cancelNoteBtn = getElem('cancel-note-btn');
    const unmarkNoteBtn = getElem('unmark-note-btn');
    const copyNoteTextBtn = getElem('copy-note-text-btn');
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

    // --- State Variables ---
    let activeConfidenceFilter = 'all';
    let activeLinkCell = null;
    let activeNoteIcon = null;
    let selectedImageForResize = null;
    let saveTimeout;

    const grandTotalSpans = {
        fuse: getElem('total-fuse'),
        notion: getElem('total-notion'),
        gemini: getElem('total-gemini'),
        lectura: getElem('total-lectura')
    };
    const grandPercentSpans = {
        fuse: getElem('percent-fuse'),
        notion: getElem('percent-notion'),
        gemini: getElem('percent-gemini'),
        lectura: getElem('percent-lectura')
    };
    const progressRings = {
        fuse: document.getElementById('progress-ring-fuse'),
        notion: document.getElementById('progress-ring-notion'),
        gemini: document.getElementById('progress-ring-gemini'),
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

    // --- Core Logic Functions ---
    
    function createLinkCellContent() {
        const fragment = document.createDocumentFragment();
        const container = document.createElement('div');
        container.className = 'flex items-center justify-center space-x-2 h-full';

        const linkAnchor = document.createElement('a');
        linkAnchor.href = '#';
        linkAnchor.target = '_blank';
        linkAnchor.className = 'link-anchor';
        linkAnchor.style.display = 'none'; // Hidden by default
        linkAnchor.title = "Abrir enlace";
        linkAnchor.innerHTML = `<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.665l3-3z" /><path d="M8.603 3.799a.75.75 0 00-1.17 1.044A4 4 0 009.25 9.75l.165-.01a.75.75 0 00.722-.843l-.105-.844a2.5 2.5 0 011.99-2.221.75.75 0 00.522-1.03l-1.106-2.212a.75.75 0 00-1.17-1.044z" /></svg>`;
        
        const editIcon = document.createElement('span');
        editIcon.className = 'edit-link-icon opacity-50 hover:opacity-100';
        editIcon.title = "Agregar/editar enlace";
        editIcon.innerHTML = `<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>`;
        
        container.appendChild(linkAnchor);
        container.appendChild(editIcon);
        fragment.appendChild(container);
        return fragment;
    }
    
    function createLecturaCellContent() {
        const fragment = document.createDocumentFragment();
        const container = document.createElement('div');
        container.className = 'flex items-center justify-center space-x-2';
        
        const counterSpan = document.createElement('span');
        counterSpan.className = 'lectura-counter';
        counterSpan.textContent = '0';

        const noteIconSvg = `<svg class="solid-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 15.25z" clip-rule="evenodd" /></svg><svg class="outline-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>`;

        const greyIcon = document.createElement('span');
        greyIcon.className = 'note-icon grey-icon';
        greyIcon.dataset.noteType = 'grey';
        greyIcon.title = 'Esquema';
        greyIcon.innerHTML = noteIconSvg;

        const blueIcon = document.createElement('span');
        blueIcon.className = 'note-icon blue-icon';
        blueIcon.dataset.noteType = 'blue';
        blueIcon.title = 'Desarrollo';
        blueIcon.innerHTML = noteIconSvg;

        container.appendChild(counterSpan);
        container.appendChild(greyIcon);
        container.appendChild(blueIcon);
        fragment.appendChild(container);
        return fragment;
    }
    
    function initializeCells() {
        document.querySelectorAll('td.fillable-cell[data-col]').forEach(cellEl => {
            const cell = cellEl;
            cell.innerHTML = ''; // Clear existing content
            cell.appendChild(createLinkCellContent());
            cell.dataset.status = 'default'; // Initial state
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
    
    function setupEditorToolbar() {
        editorToolbar.innerHTML = ''; // Clear existing toolbar

        const createButton = (title, content, command, value = null) => {
            const btn = document.createElement('button');
            btn.className = 'toolbar-btn';
            btn.title = title;
            btn.innerHTML = content;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (command) {
                    document.execCommand(command, false, value);
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

        const createColorPalette = (command, mainColors, extraColors) => {
            const group = document.createElement('div');
            group.className = 'color-palette-group';
            
            mainColors.forEach(color => {
                const swatch = document.createElement('button');
                swatch.className = 'color-swatch toolbar-btn';
                swatch.style.backgroundColor = color;
                swatch.title = color;
                swatch.addEventListener('click', (e) => {
                    e.preventDefault();
                    document.execCommand(command, false, color);
                });
                group.appendChild(swatch);
            });
            
            const otherBtn = document.createElement('button');
            otherBtn.className = 'other-colors-btn toolbar-btn';
            otherBtn.textContent = '...';
            otherBtn.title = 'Más colores';
            group.appendChild(otherBtn);

            const submenu = document.createElement('div');
            submenu.className = 'color-submenu';
            extraColors.forEach(color => {
                const swatch = document.createElement('button');
                swatch.className = 'color-swatch';
                swatch.style.backgroundColor = color;
                swatch.title = color;
                swatch.addEventListener('click', (e) => {
                    e.preventDefault();
                    document.execCommand(command, false, color);
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
                document.execCommand(command, false, e.target.value);
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
        const sizes = { 'Muy Pequeño': '1', 'Pequeño': '2', 'Normal': '3', 'Grande': '5', 'Muy Grande': '6' };
        for (const [name, value] of Object.entries(sizes)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = name;
            if (value === '3') option.selected = true;
            selectSize.appendChild(option);
        }
        selectSize.addEventListener('change', () => {
            document.execCommand('fontSize', false, selectSize.value);
        });
        editorToolbar.appendChild(selectSize);

        // Line height selector
        const selectLineHeight = document.createElement('select');
        selectLineHeight.className = 'toolbar-select';
        selectLineHeight.title = 'Interlineado';
        const lineHeights = { 'Sencillo': '1.2', 'Normal': '1.6', 'Medio': '2.0', 'Doble': '2.4' };
        for (const [name, value] of Object.entries(lineHeights)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = name;
            if (value === '1.6') option.selected = true;
            selectLineHeight.appendChild(option);
        }
        selectLineHeight.addEventListener('change', () => {
            notesEditor.style.lineHeight = selectLineHeight.value;
            notesEditor.focus();
        });
        editorToolbar.appendChild(selectLineHeight);

        editorToolbar.appendChild(createSeparator());

        // Basic formatting
        editorToolbar.appendChild(createButton('Negrita', '<b>B</b>', 'bold'));
        editorToolbar.appendChild(createButton('Cursiva', '<i>I</i>', 'italic'));
        editorToolbar.appendChild(createButton('Subrayado', '<u>U</u>', 'underline'));
        editorToolbar.appendChild(createButton('Tachado', '<s>S</s>', 'strikeThrough'));
        editorToolbar.appendChild(createSeparator());

        // Color Palettes
        const textColors = ['#000000', '#0000FF', '#008000'];
        const extraTextColors = ['#FF0000', '#FFA500', '#FFFF00', '#800080', '#FFC0CB', '#00FFFF', '#00008B', '#8B0000', '#FF8C00', '#FFD700', '#ADFF2F', '#4B0082', '#48D1CC', '#191970', '#A52A2A', '#F0E68C', '#ADD8E6', '#DDA0DD', '#90EE90', '#FA8072'];
        const highlightColors = ['#FFFF00', '#ADD8E6', '#FFC0CB'];
        const extraHighlightColors = ['#F0FFF0', '#FFF0F5', '#F5FFFA', '#F0F8FF', '#FAFAD2', '#E6E6FA', '#FFF5EE', '#FAEBD7', '#FFE4E1', '#FFFFE0', '#D3FFD3', '#B0E0E6', '#FFB6C1', '#F5DEB3', '#C8A2C8', '#FFDEAD', '#E0FFFF', '#FDF5E6', '#FFFACD', '#F8F8FF'];
        
        editorToolbar.appendChild(createColorPalette('foreColor', textColors, extraTextColors));
        editorToolbar.appendChild(createColorPalette('hiliteColor', highlightColors, extraHighlightColors));
        editorToolbar.appendChild(createSeparator());

        // Indentation
        const outdentSVG = `<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zM7 8v8l-4-4 4-4zm4-4h10V3H11v1zm0 4h10V7H11v2zm0 4h10v-2H11v2zm0 4h10v-2H11v2z"></path></svg>`;
        const indentSVG = `<svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21h18v-2H3v2zM3 3v2h18V3H3zm8 4h10V5H11v2zm0 4h10V9H11v2zm0 4h10v-2H11v2zM3 8v8l4-4-4-4z"/></svg>`;
        editorToolbar.appendChild(createButton('Disminuir Sangría', outdentSVG, 'outdent'));
        editorToolbar.appendChild(createButton('Aumentar Sangría', indentSVG, 'indent'));
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
             printArea.innerHTML = `<div style="line-height: ${notesEditor.style.lineHeight || 1.6}">${notesEditor.innerHTML}</div>`;
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
        const grandTotals = { fuse: 0, notion: 0, gemini: 0, lectura: 0 };
        const grandApplicable = { fuse: 0, notion: 0, gemini: 0, lectura: 0 };
        
        const allRows = document.querySelectorAll('tr[data-topic-id]');
        const totalTopics = allRows.length;
        
        allRows.forEach(row => {
            ['fuse', 'notion', 'gemini'].forEach(col => {
                 const cell = row.querySelector(`td[data-col="${col}"]`);
                 if (!cell) return;
                 const status = cell.dataset.status;
                 if (status === 'filled') {
                     grandTotals[col]++;
                 }
                 grandApplicable[col]++;
            });
            const counter = row.querySelector(`td[data-col="lectura"] .lectura-counter`);
            const count = parseInt(counter?.textContent || '0', 10);
            if(count > 0) {
                grandTotals.lectura++;
            }
            grandApplicable.lectura++; 
        });

        Object.keys(sections).forEach(sectionName => {
            const sectionRows = document.querySelectorAll(`tr[data-section="${sectionName}"]`);
            const totalRowTds = sections[sectionName].totalRow.querySelectorAll('td');
            let colIndex = 1;
            ['fuse', 'notion', 'gemini', 'lectura'].forEach(col => {
                let sectionCompletedCount = 0;
                sectionRows.forEach(row => {
                     if (col === 'lectura') {
                        const counter = row.querySelector(`td[data-col="lectura"] .lectura-counter`);
                        const count = parseInt(counter?.textContent || '0', 10);
                        if (count > 0) {
                           sectionCompletedCount++;
                        }
                    } else {
                        if (row.querySelector(`td[data-col="${col}"]`).dataset.status === 'filled') {
                            sectionCompletedCount++;
                        }
                    }
                });
                totalRowTds[colIndex].textContent = String(sectionCompletedCount);
                colIndex++;
            });
        });
        
        ['fuse', 'notion', 'gemini', 'lectura'].forEach(colKey => {
            const completedCount = grandTotals[colKey];
            const applicableCount = totalTopics;
            
            const percentage = applicableCount > 0 ? Math.round((completedCount / applicableCount) * 100) : 0;
            grandTotalSpans[colKey].textContent = String(completedCount);
            grandPercentSpans[colKey].textContent = `${percentage}%`;
            
            const ring = progressRings[colKey];
            if (ring) {
                const radius = ring.r.baseVal.value;
                const circumference = radius * 2 * Math.PI;
                ring.style.strokeDasharray = `${circumference} ${circumference}`;
                const offset = circumference - (percentage / 100) * circumference;
                ring.style.strokeDashoffset = String(offset);
            }
        });
        
        const overallCompleted = grandTotals.fuse + grandTotals.notion + grandTotals.gemini + grandTotals.lectura;
        const overallApplicable = totalTopics * 4;
        const overallPercentage = overallApplicable > 0 ? (overallCompleted / overallApplicable) * 100 : 0;
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
            version: '2.5', // Updated version for compression
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
            const notesData = {};

            ['grey', 'blue'].forEach(noteType => {
                 if (row.dataset[`${noteType}Note`]) {
                    notesData[noteType] = {
                        content: row.dataset[`${noteType}Note`],
                        lineHeight: row.dataset[`${noteType}LineHeight`] || '1.6'
                    };
                }
            });

            const topicData = {
                cells: {},
                notes: notesData,
                confidence: row.querySelector('.confidence-dot')?.dataset.confidenceLevel || '0',
                noteTitle: row.dataset.noteTitle || row.querySelector('.topic-text').textContent
            };

            row.querySelectorAll('td[data-col]').forEach(cell => {
                const col = cell.dataset.col;
                if (col === 'lectura') {
                    topicData.cells[col] = cell.querySelector('.lectura-counter')?.textContent || '0';
                } else {
                    topicData.cells[col] = {
                        status: cell.dataset.status || 'default',
                        link: cell.querySelector('.link-anchor')?.getAttribute('href') || '#'
                    };
                }
            });

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
        
        // Load Topic Data
        if (state.topics) {
            for (const topicId in state.topics) {
                const row = document.querySelector(`tr[data-topic-id="${topicId}"]`);
                if (!row) continue;
                
                const topicData = state.topics[topicId];
                
                // Load cell statuses and links
                if (topicData.cells) {
                    for (const col in topicData.cells) {
                        const cell = row.querySelector(`td[data-col="${col}"]`);
                        if (!cell) continue;

                        if (col === 'lectura') {
                            const counter = cell.querySelector('.lectura-counter');
                            const count = parseInt(topicData.cells[col] || '0', 10);
                            if (counter) counter.textContent = count;
                            cell.classList.toggle('lectura-filled', count > 0);
                        } else {
                            const cellData = topicData.cells[col];
                            cell.dataset.status = cellData.status || 'default';
                            cell.classList.toggle('filled', cellData.status === 'filled');
                            cell.classList.toggle('not-done', cellData.status === 'not-done');
                            
                            const linkAnchor = cell.querySelector('.link-anchor');
                            if (linkAnchor) {
                                const link = cellData.link;
                                if (link && link !== '#') {
                                    linkAnchor.setAttribute('href', link);
                                    linkAnchor.style.display = 'inline-flex';
                                } else {
                                    linkAnchor.setAttribute('href', '#');
                                    linkAnchor.style.display = 'none';
                                }
                            }
                        }
                    }
                }
                
                // Load notes
                if (topicData.notes) {
                     ['grey', 'blue'].forEach(noteType => {
                        const noteData = topicData.notes[noteType];
                        const noteIcon = row.querySelector(`.note-icon[data-note-type="${noteType}"]`);
                        if(noteIcon && noteData && noteData.content) {
                            row.dataset[`${noteType}Note`] = noteData.content;
                            row.dataset[`${noteType}LineHeight`] = noteData.lineHeight || '1.6';
                            noteIcon.classList.add('has-note');
                        }
                    });
                }

                // Load confidence level
                const confidenceDot = row.querySelector('.confidence-dot');
                if (confidenceDot && topicData.confidence) {
                    confidenceDot.dataset.confidenceLevel = topicData.confidence;
                }

                // Load note title
                if (topicData.noteTitle) {
                    row.dataset.noteTitle = topicData.noteTitle;
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
                        document.querySelectorAll(`tr[data-section="${sectionId}"]`).forEach(r => r.style.display = 'none');
                        const totalRow = getElem(`total-row-${sectionId}`);
                        if (totalRow) totalRow.style.display = 'none';
                    }
                }
            }
        }

        updateAllTotals();
        filterTable();
    }
    
    function saveState() {
        try {
            if (!window.pako) {
                console.error("pako library not loaded!");
                alert("Error: La librería de compresión no está disponible.");
                return;
            }
            const state = getStateObject();
            const stateString = JSON.stringify(state);
            const compressed = window.pako.deflate(stateString);
            
            // Convert Uint8Array to a Base64 string to safely store in localStorage
            let binaryString = '';
            for (let i = 0; i < compressed.length; i++) {
                binaryString += String.fromCharCode(compressed[i]);
            }
            const base64String = btoa(binaryString);
            
            localStorage.setItem('temarioProgresoV2_compressed', base64String);
            localStorage.removeItem('temarioProgresoV2'); // Clean up old uncompressed data
            showSaveConfirmation();

        } catch (error) {
            console.error("Error al guardar el estado:", error);
            if (error.name === 'QuotaExceededError') {
                alert("Error: El almacenamiento local está lleno, incluso después de la compresión. Por favor, exporta y borra algunas notas grandes.");
            } else {
                alert("Hubo un error desconocido al guardar tu progreso.");
            }
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

        // --- Confidence Dot Click ---
        if(target.classList.contains('confidence-dot')) {
            event.stopPropagation();
            const currentLevel = parseInt(target.dataset.confidenceLevel || '0');
            const nextLevel = (currentLevel % 3) + 1;
            target.dataset.confidenceLevel = String(nextLevel);
            saveState();
            // After changing a color, we might need to re-apply the filter
            filterTable();
            return;
        }

        // --- Link Cell Click ---
        if (target.closest('.edit-link-icon')) {
            event.preventDefault();
            event.stopPropagation();
            activeLinkCell = cell;
            const link = cell.querySelector('.link-anchor').getAttribute('href');
            linkInput.value = (link && link !== '#') ? link : '';
            openLinkPreviewBtn.href = linkInput.value;
            openLinkPreviewBtn.classList.toggle('hidden', !linkInput.value);
            showModal(linkModal);
        }

        // --- Note Icon Click ---
        if (target.closest('.note-icon')) {
            event.preventDefault();
            event.stopPropagation(); // Stop propagation to prevent overlay click
            activeNoteIcon = target.closest('.note-icon');
            const topicRow = activeNoteIcon.closest('tr');
            const noteType = activeNoteIcon.dataset.noteType;
            let topicTitle;
            let noteTitlePrefix;

            if (activeNoteIcon.classList.contains('section-note-icon')) {
                 topicTitle = topicRow.querySelector('.section-title').textContent;
                 noteTitlePrefix = "Notas para: ";
            } else {
                 topicTitle = topicRow.querySelector('.topic-text').textContent;
                 noteTitlePrefix = (noteType === 'grey' ? 'Esquema para: ' : 'Desarrollo para: ');
            }
            
            notesModalTitle.textContent = topicRow.dataset.noteTitle || `${noteTitlePrefix}${topicTitle}`;
            
            const savedContent = topicRow.dataset[`${noteType}Note`] || '';
            const savedLineHeight = topicRow.dataset[`${noteType}LineHeight`] || '1.6';
            
            notesEditor.innerHTML = savedContent;
            notesEditor.style.lineHeight = savedLineHeight;
            editorToolbar.querySelector('.toolbar-select[title="Interlineado"]').value = savedLineHeight;

            showModal(notesModal);
        }

        // --- Lectura Cell Click ---
        if (cell.classList.contains('lectura-cell') && !target.closest('.note-icon')) {
             const counter = cell.querySelector('.lectura-counter');
             let count = parseInt(counter.textContent, 10);

             if (event.ctrlKey || event.metaKey) { // Decrement with Ctrl/Cmd key
                count = Math.max(0, count - 1);
            } else {
                count = (count + 1) % 6; // Cycle 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 0
            }
             counter.textContent = String(count);
             cell.classList.toggle('lectura-filled', count > 0);
             updateAllTotals();
             saveState();
        }

        // --- Fillable Cell Click ---
        if (cell.classList.contains('fillable-cell') && !target.closest('.edit-link-icon') && !target.closest('.link-anchor')) {
            const currentStatus = cell.dataset.status || 'default';
            let newStatus;
            
            if (currentStatus === 'default') {
                newStatus = 'filled';
            } else if (currentStatus === 'filled') {
                newStatus = 'not-done';
            } else {
                newStatus = 'default';
            }
            
            cell.dataset.status = newStatus;
            cell.classList.toggle('filled', newStatus === 'filled');
            cell.classList.toggle('not-done', newStatus === 'not-done');
            
            updateAllTotals();
            saveState();
        }

        // --- Section Header Click ---
        if (row.classList.contains('section-header-row') && !target.closest('.note-icon') && !target.closest('.print-section-btn')) {
            const sectionName = row.dataset.sectionHeader;
            row.classList.toggle('collapsed');
            const isCollapsed = row.classList.contains('collapsed');
            const displayStyle = isCollapsed ? 'none' : 'table-row';
            
            document.querySelectorAll(`tr[data-section="${sectionName}"]`).forEach(r => {
                r.style.display = displayStyle;
            });
            
            const totalRow = getElem(`total-row-${sectionName}`);
            if (totalRow) {
                totalRow.style.display = displayStyle;
            }
            
            saveState();
        }

        // --- Print Section Notes Click ---
        if (target.closest('.print-section-btn')) {
            event.stopPropagation();
            const sectionHeaderRow = target.closest('.section-header-row');
            const sectionName = sectionHeaderRow.dataset.sectionHeader;
            const topicRows = document.querySelectorAll(`tr[data-section="${sectionName}"]`);
            
            const notesToPrint = [];
            topicRows.forEach(topicRow => {
                const greyNote = topicRow.dataset.greyNote;
                if (greyNote) {
                    notesToPrint.push(`<div>${greyNote}</div>`);
                }
                const blueNote = topicRow.dataset.blueNote;
                if (blueNote) {
                    notesToPrint.push(`<div>${blueNote}</div>`);
                }
            });

            if (notesToPrint.length > 0) {
                const printArea = getElem('print-area');
                printArea.innerHTML = notesToPrint.join('<div style="page-break-before: always;"></div>');
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
        const isConfidenceFilterActive = activeConfidenceFilter !== 'all';

        // 1. Filter topic rows based on search and confidence
        document.querySelectorAll('tr[data-topic-id]').forEach(row => {
            const topicText = (row.querySelector('.topic-text')?.textContent || '').toLowerCase();
            const matchesSearch = topicText.includes(searchTerm);
            
            const confidenceDot = row.querySelector('.confidence-dot');
            const confidenceLevel = confidenceDot ? confidenceDot.dataset.confidenceLevel : '0';
            const matchesConfidence = (activeConfidenceFilter === 'all' || confidenceLevel === activeConfidenceFilter);

            row.style.display = (matchesSearch && matchesConfidence) ? 'table-row' : 'none';
        });
        
        // 2. Handle visibility of section headers and totals
        if (isConfidenceFilterActive) {
            // When a color filter is active, hide all section-related rows
            document.querySelectorAll('.section-header-row, .section-total-row').forEach(row => {
                row.style.display = 'none';
            });
        } else {
            // When no color filter is active (i.e., 'all' is selected),
            // show/hide section rows based on the visibility of their topic rows (e.g., due to search)
            Object.keys(sections).forEach(sectionName => {
                 const headerRow = sections[sectionName].headerRow;
                 // Don't touch collapsed sections
                 if (headerRow.classList.contains('collapsed')) return;

                 const topicRowsInSection = document.querySelectorAll(`tr[data-section="${sectionName}"]`);
                 const isAnyTopicRowVisible = Array.from(topicRowsInSection).some(r => r.style.display !== 'none');
                 
                 const displayStyle = isAnyTopicRowVisible ? 'table-row' : 'none';
                 headerRow.style.display = displayStyle;
                 sections[sectionName].totalRow.style.display = displayStyle;
            });
        }
    }


    // --- Init & Event Listeners ---
    function init() {
        initializeCells();
        setupEditorToolbar();
        updateSectionHeaderCounts();

        try {
            const compressedState = localStorage.getItem('temarioProgresoV2_compressed');
            const legacyState = localStorage.getItem('temarioProgresoV2');

            if (compressedState && window.pako) {
                const binaryString = atob(compressedState);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const decompressedString = window.pako.inflate(bytes, { to: 'string' });
                loadState(JSON.parse(decompressedString));
            } else if (legacyState) {
                loadState(JSON.parse(legacyState));
            } else {
                updateAllTotals();
            }
        } catch (e) {
            console.error("Error al cargar el estado:", e);
            alert("Error al cargar el progreso guardado. Puede estar corrupto. Se recomienda limpiar los datos del sitio o importar un respaldo.");
            localStorage.removeItem('temarioProgresoV2');
            localStorage.removeItem('temarioProgresoV2_compressed');
            updateAllTotals();
        }


        // Table event delegation
        tableBody.addEventListener('click', handleTableClick);

        // Search and Filter Listeners
        searchBar.addEventListener('input', handleSearch);
        confidenceFiltersContainer.addEventListener('click', e => {
            const btn = e.target.closest('.filter-btn');
            if (!btn) return;

            confidenceFiltersContainer.querySelector('.active')?.classList.remove('active');
            btn.classList.add('active');
            activeConfidenceFilter = btn.dataset.filter;
            filterTable();
        });

        // Link Modal
        saveLinkBtn.addEventListener('click', () => {
            if (activeLinkCell) {
                const linkAnchor = activeLinkCell.querySelector('.link-anchor');
                const newLink = linkInput.value.trim();
                if (newLink) {
                    linkAnchor.setAttribute('href', newLink);
                    linkAnchor.style.display = 'inline-flex';
                } else {
                    linkAnchor.setAttribute('href', '#');
                    linkAnchor.style.display = 'none';
                }
                saveState();
            }
            hideModal(linkModal);
        });

        cancelLinkBtn.addEventListener('click', () => hideModal(linkModal));
        
        linkInput.addEventListener('input', () => {
            openLinkPreviewBtn.href = linkInput.value;
            openLinkPreviewBtn.classList.toggle('hidden', !linkInput.value);
        });

        // Notes Modal
        const closeNoteModal = () => {
             if (!notesModal.classList.contains('visible')) return;
            activeNoteIcon = null;
            notesEditor.innerHTML = '';
            notesModalTitle.textContent = '';
            notesModal.classList.remove('readonly-mode');
            toggleReadOnlyBtn.innerHTML = '👁️';
            hideModal(notesModal);
        };

        const saveNoteContent = () => {
             if (activeNoteIcon) {
                const row = activeNoteIcon.closest('tr');
                const noteType = activeNoteIcon.dataset.noteType;
                const content = notesEditor.innerHTML;
                row.dataset[`${noteType}Note`] = content;
                row.dataset[`${noteType}LineHeight`] = notesEditor.style.lineHeight || '1.6';
                row.dataset.noteTitle = notesModalTitle.textContent;
                activeNoteIcon.classList.toggle('has-note', !!content.trim());
                saveState();
            }
        };

        saveNoteBtn.addEventListener('click', saveNoteContent);
        saveAndCloseNoteBtn.addEventListener('click', () => {
            saveNoteContent();
            closeNoteModal();
        });
        
        cancelNoteBtn.addEventListener('click', closeNoteModal);
        
        unmarkNoteBtn.addEventListener('click', () => {
            if (confirm("¿Estás seguro de que quieres borrar el contenido de esta nota?")) {
                notesEditor.innerHTML = '';
            }
        });
        
        copyNoteTextBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(notesEditor.innerText || notesEditor.textContent)
                .then(() => alert("Texto copiado al portapapeles."))
                .catch(err => console.error("Error al copiar texto:", err));
        });

        notesEditor.addEventListener('click', (e) => {
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

        document.addEventListener('click', (e) => {
             // Hide any open dropdowns if clicking outside
            if (!e.target.closest('.symbol-dropdown') && !e.target.closest('.color-palette-group')) {
                document.querySelectorAll('.symbol-dropdown-content.visible, .color-submenu.visible').forEach(d => {
                    d.classList.remove('visible');
                });
            }
        });
        
        // Readonly mode toggle
        toggleReadOnlyBtn.addEventListener('click', () => {
            const container = notesModal.querySelector('.modal-content');
            container.classList.toggle('readonly-mode');
            const isReadonly = container.classList.contains('readonly-mode');
            notesEditor.contentEditable = !isReadonly;
            toggleReadOnlyBtn.innerHTML = isReadonly ? '✏️' : '👁️';
            toggleReadOnlyBtn.title = isReadonly ? 'Modo Edición' : 'Modo Solo Lectura';
        });

        // Main Import/Export
        exportBtn.addEventListener('click', () => {
            const stateString = JSON.stringify(getStateObject(), null, 2);
            const blob = new Blob([stateString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'temario_progreso.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        importBtn.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const state = JSON.parse(e.target.result);
                        if (confirm("¿Estás seguro de que quieres importar este archivo? Se sobrescribirá tu progreso actual.")) {
                           loadState(state);
                        }
                    } catch (err) {
                        alert('Error al leer el archivo. Asegúrate de que es un archivo de exportación válido.');
                        console.error("Error al parsear el archivo JSON importado:", err);
                    }
                };
                reader.readAsText(file);
                importFileInput.value = ''; // Reset for next import
            }
        });

        // Note-specific Import/Export
        exportNoteBtn.addEventListener('click', () => {
            const content = notesEditor.innerHTML;
            const title = notesModalTitle.textContent;
            const blob = new Blob([`<h1>${title}</h1>\n${content}`], {type: 'text/html'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
            a.click();
            URL.revokeObjectURL(url);
        });

        importNoteBtn.addEventListener('click', () => importNoteFileInput.click());
        importNoteFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = (readEvent) => {
                    if(confirm("¿Estás seguro? Esto reemplazará el contenido actual de la nota.")) {
                        notesEditor.innerHTML = readEvent.target.result;
                    }
                };
                reader.readAsText(file);
                importNoteFileInput.value = '';
            }
        });
        
        // Settings Dropdown
        settingsBtn.addEventListener('click', () => {
            settingsDropdown.classList.toggle('hidden');
        });
        
        document.addEventListener('click', e => {
            if (!settingsBtn.contains(e.target) && !settingsDropdown.contains(e.target)) {
                settingsDropdown.classList.add('hidden');
            }
        });

        settingsDropdown.addEventListener('click', e => {
            e.preventDefault();
            const target = e.target;
            if (target.classList.contains('theme-option')) {
                applyTheme(target.dataset.theme);
                settingsDropdown.classList.add('hidden');
                saveState();
            }
            if (target.classList.contains('icon-style-option')) {
                applyIconStyle(target.dataset.style);
                settingsDropdown.classList.add('hidden');
                saveState();
            }
        });

        // AI Modal
        askAiBtn.addEventListener('click', async () => {
            aiResponseArea.innerHTML = "Escribe tu pregunta a continuación...";
            aiQuestionInput.value = '';
            showModal(aiQaModal);
        });
        
        cancelAiQaBtn.addEventListener('click', () => hideModal(aiQaModal));
        
        sendAiQaBtn.addEventListener('click', async () => {
            const question = aiQuestionInput.value.trim();
            if (!question) {
                alert("Por favor, escribe una pregunta.");
                return;
            }

            aiQaLoader.classList.remove('hidden');
            sendAiQaBtn.disabled = true;
            aiResponseArea.innerHTML = 'Pensando...'; // Provide feedback

            try {
                let context = "Contexto de las notas del usuario:\n\n";
                document.querySelectorAll('tr[data-topic-id]').forEach(row => {
                    const title = row.querySelector('.topic-text')?.textContent || 'Sin Título';
                    const greyNote = row.dataset.greyNote;
                    const blueNote = row.dataset.blueNote;
                    if (greyNote || blueNote) {
                        context += `--- TEMA: ${title} ---\n`;
                        if (greyNote) {
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = greyNote;
                            context += `Esquema:\n${tempDiv.textContent || tempDiv.innerText || ''}\n\n`;
                        }
                        if (blueNote) {
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = blueNote;
                            context += `Desarrollo:\n${tempDiv.textContent || tempDiv.innerText || ''}\n\n`;
                        }
                    }
                });
                
                // Using a relative path for the Netlify function
                const response = await fetch('/.netlify/functions/ask-ai', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ question, context }),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: `El servidor respondió con un error ${response.status}, pero el cuerpo de la respuesta no pudo ser leído.` }));
                    throw new Error(`Error del servidor: ${response.status}. ${errorData.error || ''}`);
                }
                
                const data = await response.json();
                let responseText = data.response.replace(/\n/g, '<br>'); // Simple markdown to HTML
                aiResponseArea.innerHTML = responseText;

            } catch (error) {
                console.error("Error llamando a la función de IA:", error);
                aiResponseArea.innerHTML = `Hubo un error al contactar a la IA: ${error.message}`;
            } finally {
                aiQaLoader.classList.add('hidden');
                sendAiQaBtn.disabled = false;
            }
        });


        // Global listener for closing popups on outside click
        window.addEventListener('click', e => {
            const overlay = e.target;
            if (overlay.classList.contains('modal-overlay')) {
                 if (overlay.id === 'notes-modal') {
                    // Prevent closing notes modal by clicking overlay
                    return;
                }
                hideModal(overlay);
            }
        });
        
        // Autosave on header edit
        document.querySelectorAll('thead th[contenteditable="true"]').forEach(th => {
            th.addEventListener('blur', saveState);
        });
        
        document.querySelectorAll('.section-title').forEach(el => {
            el.setAttribute('contenteditable', 'true');
            el.addEventListener('blur', saveState);
        });

    } // end of init()

    // --- Start Application ---
    init();
});
