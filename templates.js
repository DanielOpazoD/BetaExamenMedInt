// Template Manager for HTML snippets
const TEMPLATE_KEY = 'htmlTemplates';
let templates = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]');
const state = { page: 1, pageSize: 12, search: '', filter: null, sort: 'recent', editMode: false };
let lastDeleted = null;
let undoTimer = null;

function saveTemplates() {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
}

function getSelectionHtml() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    const div = document.createElement('div');
    for (let i = 0; i < sel.rangeCount; i++) {
        div.appendChild(sel.getRangeAt(i).cloneContents());
    }
    return div.innerHTML;
}

function insertTemplate(html) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frag = range.createContextualFragment(html);
    range.insertNode(frag);
}

function addTemplate() {
    const contentDefault = getSelectionHtml();
    const content = contentDefault || prompt('Contenido HTML de la plantilla:');
    if (!content) return;
    const title = prompt('Título de la plantilla:', 'Nueva plantilla');
    if (!title) return;
    const tagsInput = prompt('Etiquetas separadas por coma:', '');
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];
    templates.push({ id: Date.now().toString(), title, content, tags, favorite: false, uses: 0, created: Date.now() });
    saveTemplates();
    renderTemplates();
}

function editTemplate(id) {
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    const title = prompt('Título de la plantilla:', tpl.title);
    if (!title) return;
    const content = prompt('Contenido HTML:', tpl.content);
    if (content == null) return;
    const tagsInput = prompt('Etiquetas separadas por coma:', (tpl.tags || []).join(','));
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];
    Object.assign(tpl, { title, content, tags });
    saveTemplates();
    renderTemplates();
}

function deleteTemplate(id) {
    const idx = templates.findIndex(t => t.id === id);
    if (idx === -1) return;
    lastDeleted = { template: templates[idx], index: idx };
    templates.splice(idx, 1);
    renderTemplates();
    showToast('Eliminada ✓', true);
    undoTimer = setTimeout(() => { lastDeleted = null; saveTemplates(); hideToast(); }, 5000);
}

function undoDelete() {
    if (lastDeleted) {
        templates.splice(lastDeleted.index, 0, lastDeleted.template);
        lastDeleted = null;
        renderTemplates();
        saveTemplates();
        clearTimeout(undoTimer);
        hideToast();
    }
}

function exportTemplates() {
    const data = JSON.stringify(templates);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'templates.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importTemplates(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const imported = JSON.parse(ev.target.result);
            if (Array.isArray(imported)) {
                templates = imported;
                saveTemplates();
                renderTemplates();
            }
        } catch (err) {
            console.error('Import error', err);
        }
    };
    reader.readAsText(file);
}

function renderTags() {
    const tagsDiv = document.getElementById('template-tags');
    if (!tagsDiv) return;
    tagsDiv.innerHTML = '';
    const tags = Array.from(new Set(templates.flatMap(t => t.tags || [])));
    tags.forEach(tag => {
        const btn = document.createElement('button');
        btn.textContent = tag;
        btn.className = `px-2 py-0.5 border rounded text-sm ${state.filter === tag ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`;
        btn.addEventListener('click', () => { state.filter = state.filter === tag ? null : tag; state.page = 1; renderTemplates(); });
        tagsDiv.appendChild(btn);
    });
}

function getSorter() {
    switch (state.sort) {
        case 'az': return (a, b) => a.title.localeCompare(b.title);
        case 'uses': return (a, b) => (b.uses || 0) - (a.uses || 0);
        default: return (a, b) => (b.created || 0) - (a.created || 0);
    }
}

function renderTemplates() {
    renderTags();
    const container = document.getElementById('templates-container');
    if (!container) return;
    let list = templates.slice();
    if (state.search) {
        list = list.filter(t => t.title.toLowerCase().includes(state.search));
    }
    if (state.filter) {
        list = list.filter(t => (t.tags || []).includes(state.filter));
    }
    const favorites = list.filter(t => t.favorite);
    const others = list.filter(t => !t.favorite);
    const sorter = getSorter();
    favorites.sort(sorter);
    others.sort(sorter);
    list = favorites.concat(others);
    const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageItems = list.slice(start, start + state.pageSize);
    container.innerHTML = '';
    pageItems.forEach(t => container.appendChild(createCard(t)));
    document.getElementById('template-page-info').textContent = `${state.page} / ${totalPages}`;
    document.getElementById('template-prev').disabled = state.page === 1;
    document.getElementById('template-next').disabled = state.page === totalPages;
}

function createCard(tpl) {
    const card = document.createElement('div');
    card.className = 'relative border rounded p-2 bg-secondary text-primary shadow';
    card.innerHTML = `
        <div class="flex justify-between items-start">
            <h4 class="font-semibold text-sm truncate">${tpl.title}</h4>
            <button class="favorite-btn ${tpl.favorite ? 'text-yellow-400' : 'text-gray-400'}">⭐</button>
        </div>
        <div class="text-xs mt-1 overflow-hidden h-16">${tpl.content}</div>
        <div class="absolute top-1 right-1 flex gap-1 ${state.editMode ? '' : 'hidden'}">
            <button class="edit-btn" title="Editar">✏️</button>
            <button class="delete-btn" title="Eliminar">🗑️</button>
        </div>`;
    card.querySelector('.favorite-btn').addEventListener('click', e => {
        e.stopPropagation();
        tpl.favorite = !tpl.favorite;
        saveTemplates();
        renderTemplates();
    });
    if (state.editMode) {
        card.querySelector('.edit-btn').addEventListener('click', e => { e.stopPropagation(); editTemplate(tpl.id); });
        card.querySelector('.delete-btn').addEventListener('click', e => { e.stopPropagation(); deleteTemplate(tpl.id); });
    }
    card.addEventListener('click', () => {
        if (state.editMode) return;
        insertTemplate(tpl.content);
        tpl.uses = (tpl.uses || 0) + 1;
        saveTemplates();
        renderTemplates();
    });
    return card;
}

function showToast(msg, undo) {
    const toast = document.getElementById('template-toast');
    toast.innerHTML = undo ? `${msg} <button id="undo-template-delete" class="underline ml-2">Deshacer</button>` : msg;
    toast.classList.remove('hidden');
    if (undo) {
        document.getElementById('undo-template-delete').addEventListener('click', undoDelete);
    }
}

function hideToast() {
    const toast = document.getElementById('template-toast');
    toast.classList.add('hidden');
}

// Event listeners
const openBtn = document.getElementById('open-templates-btn');
const modal = document.getElementById('templates-modal');
if (openBtn && modal) {
    openBtn.addEventListener('click', () => { modal.classList.remove('hidden'); state.page = 1; renderTemplates(); });
}
const closeBtn = document.getElementById('close-templates-btn');
if (closeBtn) {
    closeBtn.addEventListener('click', () => { modal.classList.add('hidden'); });
}
const editToggle = document.getElementById('templates-edit-toggle');
if (editToggle) {
    editToggle.addEventListener('click', () => { state.editMode = !state.editMode; renderTemplates(); });
}
const searchInput = document.getElementById('template-search');
if (searchInput) {
    searchInput.addEventListener('input', e => { state.search = e.target.value.toLowerCase(); state.page = 1; renderTemplates(); });
}
const sortSelect = document.getElementById('template-sort');
if (sortSelect) {
    sortSelect.addEventListener('change', e => { state.sort = e.target.value; renderTemplates(); });
}
const prevBtn = document.getElementById('template-prev');
if (prevBtn) {
    prevBtn.addEventListener('click', () => { if (state.page > 1) { state.page--; renderTemplates(); } });
}
const nextBtn = document.getElementById('template-next');
if (nextBtn) {
    nextBtn.addEventListener('click', () => { state.page++; renderTemplates(); });
}
const addBtn = document.getElementById('add-template-btn');
if (addBtn) {
    addBtn.addEventListener('click', addTemplate);
}
const exportBtn = document.getElementById('template-export-btn');
if (exportBtn) {
    exportBtn.addEventListener('click', exportTemplates);
}
const importBtn = document.getElementById('template-import-btn');
const importFile = document.getElementById('template-import-file');
if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', importTemplates);
}
const tagsLeft = document.getElementById('tags-left');
const tagsRight = document.getElementById('tags-right');
const tagsDiv = document.getElementById('template-tags');
if (tagsLeft && tagsRight && tagsDiv) {
    tagsLeft.addEventListener('click', () => tagsDiv.scrollBy({ left: -100, behavior: 'smooth' }));
    tagsRight.addEventListener('click', () => tagsDiv.scrollBy({ left: 100, behavior: 'smooth' }));
}

// Initial render on load if modal already visible
if (modal && !modal.classList.contains('hidden')) {
    renderTemplates();
}

