/**
 * Utilities for advanced image handling within the notes editor.
 * Provides insertion (button, drag&drop, paste), resizing via handles
 * with aspect ratio preservation, layout modes and a floating control panel.
 */
export function setupImageTools(editor) {
  // --- Insertion helpers --------------------------------------------------
  editor.addEventListener('dragover', e => {
    if (Array.from(e.dataTransfer.items || []).some(i => i.type.startsWith('image/'))) {
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
      insertFiles(files);
    }
  });

  editor.addEventListener('paste', e => {
    const items = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith('image/'));
    if (items.length) {
      e.preventDefault();
      const file = items[0].getAsFile();
      if (file) insertFiles([file]);
    }
  });

  function insertFiles(files) {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => insertImageAtCaret(ev.target.result);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Insert an image element at the current caret position within the editor.
   * @param {string} src Data URL of the image to insert.
   */
  function insertImageAtCaret(src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    const range = getCurrentRange();
    if (range) {
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editor.appendChild(img);
    }
    selectImage(img);
  }

  function getCurrentRange() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) return sel.getRangeAt(0);
    return null;
  }

  function caretRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    }
    return null;
  }

  // --- Floating panel and resizing ---------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'image-overlay hidden';
  const handles = ['nw','ne','sw','se','e','s'].map(dir => {
    const h = document.createElement('div');
    h.className = 'image-handle ' + dir;
    overlay.appendChild(h);
    return {dir, el:h};
  });
  document.body.appendChild(overlay);

  const menu = document.createElement('div');
  menu.className = 'image-menu hidden';
  menu.innerHTML = `
    <div class="size-group"></div>
    <div class="layout-group">
      <button data-layout="inline">Inline</button>
      <button data-layout="wrap-left">Wrap L</button>
      <button data-layout="wrap-right">Wrap R</button>
      <button data-layout="block">Bloque</button>
    </div>
    <div class="align-group">
      <button data-align="left">◧</button>
      <button data-align="center">◎</button>
      <button data-align="right">◨</button>
    </div>
    <button class="title-btn">Título</button>
  `;
  document.body.appendChild(menu);

  const sizeGroup = menu.querySelector('.size-group');
  const minusBtn = document.createElement('button');
  minusBtn.textContent = '-';
  minusBtn.addEventListener('click', () => resizeByFactor(0.9));
  const plusBtn = document.createElement('button');
  plusBtn.textContent = '+';
  plusBtn.addEventListener('click', () => resizeByFactor(1.1));
  const upBtn = document.createElement('button');
  upBtn.textContent = '↑';
  upBtn.addEventListener('click', () => moveImage(-1));
  const downBtn = document.createElement('button');
  downBtn.textContent = '↓';
  downBtn.addEventListener('click', () => moveImage(1));
  const delBtn = document.createElement('button');
  delBtn.textContent = '🗑️';
  delBtn.addEventListener('click', deleteImage);
  sizeGroup.append(minusBtn, plusBtn, upBtn, downBtn, delBtn);

  menu.addEventListener('click', e => {
    const layoutBtn = e.target.closest('[data-layout]');
    const alignBtn = e.target.closest('[data-align]');
    if (layoutBtn && activeImg) {
      applyLayout(layoutBtn.dataset.layout);
    } else if (alignBtn && activeImg) {
      applyAlignment(alignBtn.dataset.align);
    } else if (e.target.classList.contains('title-btn') && activeImg) {
      openTitleEditor();
    }
  });

  /**
   * Resize the active image by a factor, keeping aspect ratio.
   * @param {number} factor Multiplicative factor (>1 enlarges, <1 shrinks)
   */
  function resizeByFactor(factor) {
    if (!activeImg) return;
    const newW = activeImg.offsetWidth * factor;
    if (newW > 20) {
      activeImg.style.width = newW + 'px';
      activeImg.style.height = 'auto';
      syncCaptionWidth();
      positionUI();
    }
  }

  /**
   * Move the active image up or down in the document flow.
   * @param {number} dir -1 to move up, 1 to move down
   */
  function moveImage(dir) {
    if (!activeImg) return;
    const caption = activeImg.nextElementSibling;
    const nodes = [activeImg];
    if (caption && caption.classList.contains('image-caption')) nodes.push(caption);
    const parent = activeImg.parentNode;
    if (dir < 0) {
      const ref = activeImg.previousSibling;
      if (ref) nodes.forEach(n => parent.insertBefore(n, ref));
    } else {
      const ref = nodes[nodes.length - 1].nextSibling;
      if (ref) nodes.slice().reverse().forEach(n => parent.insertBefore(n, ref.nextSibling));
    }
    positionUI();
  }

  function deleteImage() {
    if (!activeImg) return;
    const caption = activeImg.nextElementSibling;
    if (caption && caption.classList.contains('image-caption')) caption.remove();
    activeImg.remove();
    clearSelection();
  }

  /**
   * Ensure the caption matches the image width.
   */
  function syncCaptionWidth() {
    if (!activeImg) return;
    const caption = activeImg.nextElementSibling;
    if (caption && caption.classList.contains('image-caption')) {
      caption.style.width = activeImg.offsetWidth + 'px';
    }
  }

  let activeImg = null;
  editor.addEventListener('click', e => {
    if (e.target.tagName === 'IMG') {
      selectImage(e.target);
    } else if (!menu.contains(e.target)) {
      clearSelection();
    }
  });

  document.addEventListener('scroll', () => activeImg && positionUI(), true);
  window.addEventListener('resize', () => activeImg && positionUI());

  function selectImage(img) {
    activeImg = img;
    syncCaptionWidth();
    positionUI();
    overlay.classList.remove('hidden');
    menu.classList.remove('hidden');
  }

  function clearSelection() {
    activeImg = null;
    overlay.classList.add('hidden');
    menu.classList.add('hidden');
  }

  function positionUI() {
    if (!activeImg) return;
    const rect = activeImg.getBoundingClientRect();
    overlay.style.top = window.scrollY + rect.top + 'px';
    overlay.style.left = window.scrollX + rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    menu.style.top = window.scrollY + rect.top - menu.offsetHeight - 8 + 'px';
    menu.style.left = window.scrollX + rect.left + 'px';
  }

  handles.forEach(h => {
    h.el.addEventListener('mousedown', e => startResize(e, h.dir));
  });

  function startResize(e, dir) {
    e.preventDefault();
    if (!activeImg) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = activeImg.offsetWidth;
    const origH = activeImg.offsetHeight;
    const aspect = origW / origH;
    function onMove(ev) {
      let dx = ev.clientX - startX;
      let dy = ev.clientY - startY;
      if (!ev.shiftKey && ['nw','ne','sw','se'].includes(dir)) {
        if (Math.abs(dx) > Math.abs(dy)) dy = dx / aspect; else dx = dy * aspect;
      }
      let newW = origW;
      let newH = origH;
      if (dir.includes('e')) newW = origW + dx;
      if (dir.includes('w')) newW = origW - dx;
      if (dir.includes('s')) newH = origH + dy;
      if (dir.includes('n')) newH = origH - dy;
      if (dir === 'e' || dir === 'w') newH = origH;
      if (dir === 's' || dir === 'n') newW = origW;
      if (newW > 20 && newH > 20) {
        activeImg.style.width = newW + 'px';
        activeImg.style.height = newH + 'px';
        syncCaptionWidth();
        positionUI();
      }
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /**
   * Apply layout mode to the active image.
   * @param {string} mode One of inline, wrap-left, wrap-right, block
   */
  function applyLayout(mode) {
    if (!activeImg) return;
    activeImg.style.float = '';
    activeImg.style.display = '';
    activeImg.style.margin = '';
    activeImg.dataset.layout = mode;
    if (mode === 'wrap-left') {
      activeImg.style.float = 'left';
      activeImg.style.margin = '0 1rem 1rem 0';
    } else if (mode === 'wrap-right') {
      activeImg.style.float = 'right';
      activeImg.style.margin = '0 0 1rem 1rem';
    } else if (mode === 'block') {
      activeImg.style.display = 'block';
      activeImg.style.margin = '0 auto';
    }
  }

  /**
   * Apply alignment for block layout images.
   * @param {string} align left|center|right
   */
  function applyAlignment(align) {
    if (!activeImg) return;
    if (activeImg.dataset.layout === 'block') {
      if (align === 'left') {
        activeImg.style.margin = '0 auto 0 0';
      } else if (align === 'right') {
        activeImg.style.margin = '0 0 0 auto';
      } else {
        activeImg.style.margin = '0 auto';
      }
    }
  }

  // --- Title editor -------------------------------------------------------
  function openTitleEditor() {
    const popup = document.createElement('div');
    popup.className = 'image-title-popup';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = activeImg.dataset.caption || '';
    const ok = document.createElement('button');
    ok.textContent = 'OK';
    const cancel = document.createElement('button');
    cancel.textContent = '✕';
    popup.append(input, ok, cancel);
    document.body.appendChild(popup);
    const rect = activeImg.getBoundingClientRect();
    popup.style.top = window.scrollY + rect.bottom + 8 + 'px';
    popup.style.left = window.scrollX + rect.left + 'px';
    popup.style.zIndex = 10002;
    input.focus();
    ok.addEventListener('click', () => { applyTitle(input.value); popup.remove(); });
    cancel.addEventListener('click', () => popup.remove());
  }

  function applyTitle(text) {
    if (!activeImg) return;
    activeImg.dataset.caption = text;
    let caption = activeImg.nextElementSibling;
    if (!caption || !caption.classList.contains('image-caption')) {
      caption = document.createElement('div');
      caption.className = 'image-caption';
      activeImg.insertAdjacentElement('afterend', caption);
    }
    caption.textContent = text;
    syncCaptionWidth();
    positionUI();
  }

  document.addEventListener('click', e => {
    if (activeImg && !menu.contains(e.target) && e.target !== activeImg && !overlay.contains(e.target)) {
      clearSelection();
    }
  });
}
