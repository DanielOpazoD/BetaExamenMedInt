// Image handling enhancements: insertion, drag-and-drop, resizing, presets and layout

document.addEventListener('DOMContentLoaded', () => {
  const notesEditor = document.getElementById('notes-editor');
  const subNoteEditor = document.getElementById('subnote-editor');
  const fileInput = document.getElementById('insert-image-input');
  let currentEditor = notesEditor;
  let selectedImage = null;

  // Overlay and handles
  const overlay = document.createElement('div');
  overlay.id = 'img-resize-overlay';
  const dirs = ['nw', 'ne', 'se', 'sw'];
  const handles = {};
  dirs.forEach(d => {
    const h = document.createElement('div');
    h.className = `img-handle handle-${d}`;
    overlay.appendChild(h);
    handles[d] = h;
    h.addEventListener('mousedown', ev => startResize(ev, d));
  });
  document.body.appendChild(overlay);
  let startX = 0, startY = 0, startW = 0, startH = 0, aspect = 1, activeDir = null;

  function startResize(e, dir) {
    if (!selectedImage) return;
    e.preventDefault();
    activeDir = dir;
    startX = e.clientX;
    startY = e.clientY;
    startW = selectedImage.offsetWidth;
    startH = selectedImage.offsetHeight;
    aspect = startW / startH;
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', stopResize);
  }
  function onResizeMove(e) {
    if (!activeDir || !selectedImage) return;
    let dx = e.clientX - startX;
    let dy = e.clientY - startY;
    let w = startW;
    let h = startH;
    if (activeDir.includes('e')) w = startW + dx;
    if (activeDir.includes('w')) w = startW - dx;
    if (activeDir.includes('s')) h = startH + dy;
    if (activeDir.includes('n')) h = startH - dy;
    if (!e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) h = w / aspect; else w = h * aspect;
    }
    selectedImage.style.width = Math.max(10, w) + 'px';
    selectedImage.style.height = Math.max(10, h) + 'px';
    updateOverlay();
  }
  function stopResize() {
    activeDir = null;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', stopResize);
  }

  function updateOverlay() {
    if (!selectedImage) { overlay.style.display = 'none'; return; }
    const rect = selectedImage.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = rect.left + window.scrollX + 'px';
    overlay.style.top = rect.top + window.scrollY + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }
  function hideOverlay() { overlay.style.display = 'none'; }
  window.addEventListener('resize', updateOverlay);
  document.addEventListener('scroll', updateOverlay, true);

  function insertImageAtCursor(src, editor, x, y) {
    editor.focus();
    const sel = window.getSelection();
    let range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    if (typeof x === 'number' && typeof y === 'number') {
      const pos = document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : document.caretRangeFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        const node = pos.offsetNode || pos.startContainer;
        const offset = pos.offset || pos.startOffset;
        range.setStart(node, offset);
      }
    }
    if (range) {
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand('insertImage', false, src);
  }

  function setWidthPercent(pct) {
    if (!selectedImage) return;
    const container = selectedImage.closest('#notes-editor, #subnote-editor');
    const width = container ? container.clientWidth * pct : selectedImage.offsetWidth;
    selectedImage.style.width = width + 'px';
    selectedImage.style.height = 'auto';
    updateOverlay();
  }

  function setLayout(type) {
    if (!selectedImage) return;
    selectedImage.style.float = '';
    selectedImage.style.display = '';
    selectedImage.style.margin = '';
    if (type === 'wrap') {
      selectedImage.style.float = 'left';
      selectedImage.style.margin = '0 1em 1em 0';
    } else if (type === 'break') {
      selectedImage.style.display = 'block';
      selectedImage.style.margin = '1em auto';
    }
    updateOverlay();
  }

  function attachEditor(editor) {
    if (!editor) return;
    editor.addEventListener('click', e => {
      if (e.target.tagName === 'IMG') {
        editor.querySelectorAll('img').forEach(img => img.classList.remove('selected-for-resize'));
        e.target.classList.add('selected-for-resize');
        selectedImage = e.target;
        updateOverlay();
      } else {
        editor.querySelectorAll('img').forEach(img => img.classList.remove('selected-for-resize'));
        selectedImage = null;
        hideOverlay();
      }
    });
    editor.addEventListener('dragover', e => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
    });
    editor.addEventListener('drop', e => {
      const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
      const imgs = files.filter(f => f.type.startsWith('image/'));
      if (imgs.length) {
        e.preventDefault();
        imgs.forEach(f => {
          const reader = new FileReader();
          reader.onload = ev => insertImageAtCursor(ev.target.result, editor, e.clientX, e.clientY);
          reader.readAsDataURL(f);
        });
      }
    });
  }
  attachEditor(notesEditor);
  attachEditor(subNoteEditor);

  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = ev => {
          const targetId = fileInput.dataset.target;
          const editor = targetId === 'subnote-editor' ? subNoteEditor : notesEditor;
          insertImageAtCursor(ev.target.result, editor);
        };
        reader.readAsDataURL(file);
      }
      fileInput.value = '';
    });
  }

  function addButtons(toolbar, editor) {
    if (!toolbar || toolbar.dataset.enhanced) return;
    toolbar.dataset.enhanced = 'true';
    const insertBtn = document.createElement('button');
    insertBtn.className = 'toolbar-btn';
    insertBtn.title = 'Insertar imagen';
    insertBtn.textContent = '📷';
    insertBtn.addEventListener('click', () => {
      currentEditor = editor;
      fileInput.dataset.target = editor.id;
      fileInput.click();
    });
    toolbar.appendChild(insertBtn);
    [0.25,0.5,0.75,1].forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'toolbar-btn';
      btn.textContent = Math.round(p*100)+'%';
      btn.title = `Ancho ${Math.round(p*100)}%`;
      btn.addEventListener('click', ()=>setWidthPercent(p));
      toolbar.appendChild(btn);
    });
    const inlineBtn = document.createElement('button');
    inlineBtn.className = 'toolbar-btn';
    inlineBtn.title = 'Imagen en línea';
    inlineBtn.textContent = '↔️';
    inlineBtn.addEventListener('click', ()=>setLayout('inline'));
    const wrapBtn = document.createElement('button');
    wrapBtn.className = 'toolbar-btn';
    wrapBtn.title = 'Ajuste de texto';
    wrapBtn.textContent = '🔳';
    wrapBtn.addEventListener('click', ()=>setLayout('wrap'));
    const breakBtn = document.createElement('button');
    breakBtn.className = 'toolbar-btn';
    breakBtn.title = 'Imagen separada';
    breakBtn.textContent = '⏎';
    breakBtn.addEventListener('click', ()=>setLayout('break'));
    toolbar.appendChild(inlineBtn);
    toolbar.appendChild(wrapBtn);
    toolbar.appendChild(breakBtn);
  }

  function initToolbars() {
    addButtons(document.querySelector('.editor-toolbar'), notesEditor);
    addButtons(document.getElementById('subnote-toolbar'), subNoteEditor);
  }
  initToolbars();
  const obs = new MutationObserver(initToolbars);
  obs.observe(document.body, { childList:true, subtree:true });
});

