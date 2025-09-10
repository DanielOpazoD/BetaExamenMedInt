export function setupImageTools(editor, toolbar) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  const insertBtn = document.createElement('button');
  insertBtn.className = 'toolbar-btn';
  insertBtn.title = 'Insertar imagen desde archivo';
  insertBtn.textContent = '🖼️';
  insertBtn.addEventListener('click', () => fileInput.click());
  toolbar.appendChild(insertBtn);

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => insertFileImage(f));
    fileInput.value = '';
  });

  function insertFileImage(file) {
    const reader = new FileReader();
    reader.onload = ev => insertImage(ev.target.result);
    reader.readAsDataURL(file);
  }

  function insertImage(src) {
    const img = document.createElement('img');
    img.src = src;
    img.style.maxWidth = '100%';
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editor.appendChild(img);
    }
    selectImage(img);
  }

  editor.addEventListener('dragover', e => {
    const items = e.dataTransfer?.items;
    if (items && Array.from(items).some(i => i.kind === 'file' && i.type.startsWith('image/'))) {
      e.preventDefault();
    }
  });

  editor.addEventListener('drop', e => {
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      const range = caretRangeFromPoint(e.clientX, e.clientY);
      if (range) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      files.forEach(f => insertFileImage(f));
    }
  });

  function caretRangeFromPoint(x, y) {
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      return range;
    }
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }
    return null;
  }

  editor.addEventListener('paste', e => {
    const items = e.clipboardData?.items;
    const images = items ? Array.from(items).filter(i => i.type.startsWith('image/')) : [];
    if (images.length) {
      e.preventDefault();
      e.stopPropagation();
      images.forEach(it => {
        const file = it.getAsFile();
        if (file) insertFileImage(file);
      });
    }
  }, true);

  let currentImage = null;
  let selectionBox = null;
  const menu = buildMenu();
  document.body.appendChild(menu);

  function buildMenu() {
    const m = document.createElement('div');
    m.id = 'image-menu';
    m.className = 'image-menu';

    const titleBtn = createMenuButton('Título', openTitleModal);
    m.appendChild(titleBtn);

    m.appendChild(createMenuButton('⬅️', () => applyAlignment('left')));
    m.appendChild(createMenuButton('↔️', () => applyAlignment('center')));
    m.appendChild(createMenuButton('➡️', () => applyAlignment('right')));

    m.appendChild(createMenuButton('Inline', () => applyLayout('inline')));
    m.appendChild(createMenuButton('WrapL', () => applyLayout('wrap-left')));
    m.appendChild(createMenuButton('WrapR', () => applyLayout('wrap-right')));
    m.appendChild(createMenuButton('Break', () => applyLayout('break')));

    [25,50,75,100].forEach(p => {
      m.appendChild(createMenuButton(p + '%', () => applyPreset(p)));
    });

    return m;
  }

  function createMenuButton(text, handler) {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', handler);
    return b;
  }

  function showMenu() {
    if (!currentImage) return;
    const rect = currentImage.getBoundingClientRect();
    menu.style.top = window.scrollY + rect.bottom + 8 + 'px';
    menu.style.left = window.scrollX + rect.left + 'px';
    menu.style.display = 'block';
    positionSelectionBox();
  }

  function hideMenu() {
    menu.style.display = 'none';
    if (selectionBox) selectionBox.remove();
    selectionBox = null;
    currentImage = null;
  }

  function selectImage(img) {
    currentImage = img;
    addSelectionBox();
    showMenu();
  }

  function addSelectionBox() {
    if (selectionBox) selectionBox.remove();
    const rect = currentImage.getBoundingClientRect();
    selectionBox = document.createElement('div');
    selectionBox.className = 'image-selection';
    selectionBox.style.left = window.scrollX + rect.left + 'px';
    selectionBox.style.top = window.scrollY + rect.top + 'px';
    selectionBox.style.width = rect.width + 'px';
    selectionBox.style.height = rect.height + 'px';
    document.body.appendChild(selectionBox);
    ['nw','ne','sw','se'].forEach(pos => {
      const h = document.createElement('div');
      h.className = 'image-handle ' + pos;
      h.addEventListener('mousedown', startResize);
      selectionBox.appendChild(h);
    });
  }

  function positionSelectionBox() {
    if (!selectionBox || !currentImage) return;
    const rect = currentImage.getBoundingClientRect();
    selectionBox.style.left = window.scrollX + rect.left + 'px';
    selectionBox.style.top = window.scrollY + rect.top + 'px';
    selectionBox.style.width = rect.width + 'px';
    selectionBox.style.height = rect.height + 'px';
  }

  function startResize(e) {
    e.preventDefault();
    const handle = e.target;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = currentImage.offsetWidth;
    const startH = currentImage.offsetHeight;
    const ratio = startW / startH;

    function onMove(ev) {
      let dx = ev.clientX - startX;
      let dy = ev.clientY - startY;
      let newW = startW;
      let newH = startH;
      if (handle.classList.contains('nw')) {
        newW = startW - dx;
        newH = startH - dy;
      } else if (handle.classList.contains('ne')) {
        newW = startW + dx;
        newH = startH - dy;
      } else if (handle.classList.contains('sw')) {
        newW = startW - dx;
        newH = startH + dy;
      } else if (handle.classList.contains('se')) {
        newW = startW + dx;
        newH = startH + dy;
      }
      if (!ev.shiftKey) {
        if (newW / newH > ratio) {
          newW = newH * ratio;
        } else {
          newH = newW / ratio;
        }
      }
      currentImage.style.width = newW + 'px';
      currentImage.style.height = newH + 'px';
      positionSelectionBox();
      showMenu();
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function applyPreset(p) {
    if (!currentImage) return;
    const cw = editor.clientWidth;
    currentImage.style.width = (cw * p / 100) + 'px';
    currentImage.style.height = 'auto';
    positionSelectionBox();
    showMenu();
  }

  function applyAlignment(al) {
    if (!currentImage) return;
    currentImage.style.display = 'block';
    currentImage.style.float = '';
    if (al === 'left') {
      currentImage.style.margin = '0 auto 0 0';
    } else if (al === 'center') {
      currentImage.style.margin = '0 auto';
    } else {
      currentImage.style.margin = '0 0 0 auto';
    }
    positionSelectionBox();
    showMenu();
  }

  function applyLayout(l) {
    if (!currentImage) return;
    currentImage.style.display = '';
    currentImage.style.float = '';
    currentImage.style.margin = '';
    if (l === 'inline') {
      currentImage.style.display = 'inline';
    } else if (l === 'wrap-left') {
      currentImage.style.float = 'left';
      currentImage.style.margin = '0 1em 1em 0';
    } else if (l === 'wrap-right') {
      currentImage.style.float = 'right';
      currentImage.style.margin = '0 0 1em 1em';
    } else if (l === 'break') {
      currentImage.style.display = 'block';
      currentImage.style.margin = '1em auto';
    }
    positionSelectionBox();
    showMenu();
  }

  const titleModal = document.getElementById('image-title-modal');
  const titleInput = document.getElementById('image-title-input');
  const titleOk = document.getElementById('image-title-ok');
  const titleCancel = document.getElementById('image-title-cancel');

  function openTitleModal() {
    if (!currentImage) return;
    titleInput.value = getTitle();
    titleModal.classList.add('visible');
    titleInput.focus();
  }

  function closeTitleModal() {
    titleModal.classList.remove('visible');
  }

  function getTitle() {
    const fig = currentImage.closest('figure');
    if (fig) {
      const cap = fig.querySelector('figcaption');
      return cap ? cap.textContent : '';
    }
    return '';
  }

  titleOk.addEventListener('click', () => {
    const text = titleInput.value.trim();
    let fig = currentImage.closest('figure');
    if (text) {
      if (!fig) {
        fig = document.createElement('figure');
        currentImage.parentNode.insertBefore(fig, currentImage);
        fig.appendChild(currentImage);
      }
      let cap = fig.querySelector('figcaption');
      if (!cap) {
        cap = document.createElement('figcaption');
        cap.className = 'image-title';
        fig.appendChild(cap);
      }
      cap.textContent = text;
    } else if (fig) {
      const cap = fig.querySelector('figcaption');
      if (cap) cap.remove();
    }
    closeTitleModal();
  });

  titleCancel.addEventListener('click', closeTitleModal);

  document.addEventListener('click', e => {
    if (currentImage && !menu.contains(e.target) && e.target !== currentImage && !titleModal.contains(e.target)) {
      hideMenu();
    }
  });

  window.addEventListener('scroll', positionSelectionBox);
  window.addEventListener('resize', positionSelectionBox);

  editor.addEventListener('click', e => {
    const img = e.target.closest('img');
    if (img) {
      selectImage(img);
    }
  });
}
