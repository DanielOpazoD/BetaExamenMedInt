/**
 * Utilities for advanced image handling within the notes editor.
 * Provides insertion (drag&drop, paste), resizing via handles
 * with aspect ratio preservation, layout modes and a floating control panel.
 */
export function setupImageTools(editor, toolbar) {
  // --- Insertion helpers --------------------------------------------------
  // botón de inserción de imagen eliminado; aún se admite arrastrar y pegar

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
    <div class="micro-group"><span>Micromov.</span></div>
    <div class="align-group">
      <button data-align="left">◧</button>
      <button data-align="center">◎</button>
      <button data-align="right">◨</button>
    </div>
    <button class="title-btn">Título</button>
  `;
  document.body.appendChild(menu);

  const editBackdrop = document.createElement('div');
  editBackdrop.className = 'image-edit-backdrop hidden';
  editBackdrop.innerHTML = `
    <div class="image-edit-dialog" role="dialog" aria-modal="true">
      <div class="image-edit-header">
        <h3>Editar imagen</h3>
        <button type="button" class="image-edit-close" aria-label="Cerrar">✕</button>
      </div>
      <div class="image-edit-body">
        <div class="image-edit-preview">
          <canvas></canvas>
          <p class="image-edit-error" role="alert"></p>
        </div>
        <div class="image-edit-controls">
          <fieldset>
            <legend>Recorte (px)</legend>
            <label>Superior
              <input type="range" min="0" value="0" data-crop="top">
            </label>
            <label>Inferior
              <input type="range" min="0" value="0" data-crop="bottom">
            </label>
            <label>Izquierda
              <input type="range" min="0" value="0" data-crop="left">
            </label>
            <label>Derecha
              <input type="range" min="0" value="0" data-crop="right">
            </label>
          </fieldset>
          <fieldset>
            <legend>Texto superpuesto</legend>
            <label>Contenido
              <textarea data-edit-text rows="3" placeholder="Texto opcional"></textarea>
            </label>
            <label>Tamaño
              <input type="number" min="8" max="200" value="24" data-edit-text-size>
            </label>
            <label>Color
              <input type="color" value="#ffffff" data-edit-text-color>
            </label>
            <label>Posición
              <select data-edit-text-position>
                <option value="top-left">Arriba izquierda</option>
                <option value="top-right">Arriba derecha</option>
                <option value="center">Centro</option>
                <option value="bottom-left">Abajo izquierda</option>
                <option value="bottom-right" selected>Abajo derecha</option>
              </select>
            </label>
            <label class="image-edit-checkbox">
              <input type="checkbox" data-edit-text-bg checked>
              Fondo semitransparente
            </label>
          </fieldset>
        </div>
      </div>
      <div class="image-edit-footer">
        <button type="button" class="image-edit-cancel">Cancelar</button>
        <button type="button" class="image-edit-apply">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(editBackdrop);

  const micromoveStep = 4;
  let activeImg = null;
  let isEditingImage = false;
  let editState = null;

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
  const editBtn = document.createElement('button');
  editBtn.textContent = 'Editar';
  editBtn.title = 'Recortar o anotar imagen';
  editBtn.addEventListener('click', () => openImageEditor());
  sizeGroup.append(minusBtn, plusBtn, upBtn, downBtn, delBtn, editBtn);

  const editCanvas = editBackdrop.querySelector('canvas');
  const editCtx = editCanvas.getContext('2d');
  const cropInputs = {
    top: editBackdrop.querySelector('[data-crop="top"]'),
    bottom: editBackdrop.querySelector('[data-crop="bottom"]'),
    left: editBackdrop.querySelector('[data-crop="left"]'),
    right: editBackdrop.querySelector('[data-crop="right"]')
  };
  const textInput = editBackdrop.querySelector('[data-edit-text]');
  const textSizeInput = editBackdrop.querySelector('[data-edit-text-size]');
  const textColorInput = editBackdrop.querySelector('[data-edit-text-color]');
  const textPositionInput = editBackdrop.querySelector('[data-edit-text-position]');
  const textBgInput = editBackdrop.querySelector('[data-edit-text-bg]');
  const editError = editBackdrop.querySelector('.image-edit-error');
  const applyBtn = editBackdrop.querySelector('.image-edit-apply');
  const cancelBtn = editBackdrop.querySelector('.image-edit-cancel');
  const closeBtn = editBackdrop.querySelector('.image-edit-close');
  const scratchCanvas = document.createElement('canvas');
  const scratchCtx = scratchCanvas.getContext('2d');
  const validPositions = new Set(['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right']);

  const normalizeColor = (value, fallback = '#ffffff') => {
    if (!value) return fallback;
    const hexPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
    const trimmed = value.trim();
    if (hexPattern.test(trimmed)) return trimmed;
    if (scratchCtx) {
      try {
        scratchCtx.fillStyle = trimmed;
        const computed = scratchCtx.fillStyle;
        if (hexPattern.test(computed)) return computed;
      } catch (err) {
        return fallback;
      }
    }
    return fallback;
  };

  const clampValue = (val, min, max) => {
    const num = Number(val);
    if (Number.isNaN(num)) return min;
    return Math.min(Math.max(num, min), max);
  };

  const ensurePosition = (value) => (validPositions.has(value) ? value : 'bottom-right');

  const cropMap = {
    top: 'cropTop',
    bottom: 'cropBottom',
    left: 'cropLeft',
    right: 'cropRight'
  };

  const resetCropInputs = () => {
    Object.values(cropInputs).forEach(input => {
      input.value = '0';
      input.max = '0';
      input.disabled = true;
    });
  };

  const renderEditPreview = () => {
    if (!editState || !editState.source) return;
    editError.textContent = '';
    const image = editState.source;
    const cropTop = clampValue(editState.cropTop, 0, Math.max(0, image.naturalHeight - 1));
    const cropBottom = clampValue(editState.cropBottom, 0, Math.max(0, image.naturalHeight - cropTop - 1));
    const cropLeft = clampValue(editState.cropLeft, 0, Math.max(0, image.naturalWidth - 1));
    const cropRight = clampValue(editState.cropRight, 0, Math.max(0, image.naturalWidth - cropLeft - 1));
    editState.cropTop = cropTop;
    editState.cropBottom = cropBottom;
    editState.cropLeft = cropLeft;
    editState.cropRight = cropRight;
    cropInputs.top.value = String(cropTop);
    cropInputs.bottom.value = String(cropBottom);
    cropInputs.left.value = String(cropLeft);
    cropInputs.right.value = String(cropRight);

    const drawWidth = Math.max(1, image.naturalWidth - cropLeft - cropRight);
    const drawHeight = Math.max(1, image.naturalHeight - cropTop - cropBottom);
    editCanvas.width = drawWidth;
    editCanvas.height = drawHeight;
    editCtx.clearRect(0, 0, drawWidth, drawHeight);
    editCtx.drawImage(
      image,
      cropLeft,
      cropTop,
      drawWidth,
      drawHeight,
      0,
      0,
      drawWidth,
      drawHeight
    );

    const overlayText = (editState.overlayText || '').trim();
    if (!overlayText) return;

    const fontSize = clampValue(editState.textSize, 8, 200);
    editState.textSize = fontSize;
    textSizeInput.value = String(fontSize);
    const fontFamily = window.getComputedStyle(editor).fontFamily || 'sans-serif';
    const lines = overlayText.split(/\r?\n/);
    const lineHeight = fontSize * 1.25;
    editCtx.save();
    editCtx.font = `${fontSize}px ${fontFamily}`;
    editCtx.textBaseline = 'top';
    editCtx.textAlign = 'left';
    const measurements = lines.map(line => editCtx.measureText(line));
    const textWidth = measurements.length ? Math.max(...measurements.map(m => m.width)) : 0;
    const textHeight = lines.length ? fontSize + (lines.length - 1) * lineHeight : fontSize;
    const padding = 8;
    const position = ensurePosition(editState.textPosition);
    let startX = padding;
    let startY = padding;
    if (position === 'top-right') {
      startX = drawWidth - textWidth - padding;
      startY = padding;
    } else if (position === 'bottom-left') {
      startX = padding;
      startY = drawHeight - textHeight - padding;
    } else if (position === 'bottom-right') {
      startX = drawWidth - textWidth - padding;
      startY = drawHeight - textHeight - padding;
    } else if (position === 'center') {
      startX = (drawWidth - textWidth) / 2;
      startY = (drawHeight - textHeight) / 2;
    }
    startX = clampValue(startX, padding, Math.max(padding, drawWidth - textWidth - padding));
    startY = clampValue(startY, padding, Math.max(padding, drawHeight - textHeight - padding));

    if (editState.textBackground) {
      editCtx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      editCtx.fillRect(
        startX - padding,
        startY - padding,
        textWidth + padding * 2,
        textHeight + padding * 2
      );
    }
    const color = normalizeColor(editState.textColor, '#ffffff');
    editState.textColor = color;
    textColorInput.value = color;
    editCtx.fillStyle = color;
    lines.forEach((line, index) => {
      editCtx.fillText(line, startX, startY + index * lineHeight);
    });
    editCtx.restore();
  };

  const closeImageEditor = (restoreSelection = true) => {
    if (!isEditingImage) return;
    editBackdrop.classList.add('hidden');
    document.body.classList.remove('image-edit-open');
    isEditingImage = false;
    const imageToSelect = activeImg;
    editState = null;
    if (restoreSelection && imageToSelect) {
      requestAnimationFrame(() => selectImage(imageToSelect));
    } else if (!restoreSelection) {
      clearSelection();
    }
  };

  const openImageEditor = () => {
    if (!activeImg || isEditingImage) return;
    const src = activeImg.getAttribute('src');
    if (!src) return;
    isEditingImage = true;
    menu.classList.add('hidden');
    overlay.classList.add('hidden');
    editBackdrop.classList.remove('hidden');
    document.body.classList.add('image-edit-open');
    editError.textContent = '';
    editState = {
      source: null,
      cropTop: 0,
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0,
      overlayText: activeImg.dataset.overlayText || '',
      textColor: normalizeColor(activeImg.dataset.overlayTextColor || textColorInput.value),
      textSize: clampValue(parseInt(activeImg.dataset.overlayTextSize || '24', 10), 8, 200),
      textPosition: ensurePosition(activeImg.dataset.overlayTextPosition),
      textBackground: activeImg.dataset.overlayTextBackground !== 'false'
    };
    textInput.value = editState.overlayText;
    textColorInput.value = editState.textColor;
    textSizeInput.value = String(editState.textSize);
    textPositionInput.value = editState.textPosition;
    textBgInput.checked = editState.textBackground;
    resetCropInputs();

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!editState) return;
      editState.source = image;
      const maxTop = Math.max(0, Math.floor(image.naturalHeight / 2));
      const maxLeft = Math.max(0, Math.floor(image.naturalWidth / 2));
      cropInputs.top.max = cropInputs.bottom.max = String(maxTop);
      cropInputs.left.max = cropInputs.right.max = String(maxLeft);
      Object.values(cropInputs).forEach(input => { input.disabled = false; });
      renderEditPreview();
    };
    image.onerror = () => {
      editError.textContent = 'No se pudo cargar la imagen para edición.';
    };
    image.src = src;
  };

  const applyImageEdits = () => {
    if (!editState || !editState.source || !activeImg) return;
    try {
      const dataUrl = editCanvas.toDataURL('image/png');
      const originalWidth = activeImg.style.width;
      const originalHeight = activeImg.style.height;
      activeImg.src = dataUrl;
      if (originalWidth) activeImg.style.width = originalWidth;
      if (originalHeight) activeImg.style.height = originalHeight;
      activeImg.dataset.edited = 'true';
      const overlayText = (editState.overlayText || '').trim();
      if (overlayText) {
        activeImg.dataset.overlayText = overlayText;
        activeImg.dataset.overlayTextColor = editState.textColor;
        activeImg.dataset.overlayTextSize = String(editState.textSize);
        activeImg.dataset.overlayTextPosition = editState.textPosition;
        activeImg.dataset.overlayTextBackground = editState.textBackground ? 'true' : 'false';
      } else {
        delete activeImg.dataset.overlayText;
        delete activeImg.dataset.overlayTextColor;
        delete activeImg.dataset.overlayTextSize;
        delete activeImg.dataset.overlayTextPosition;
        delete activeImg.dataset.overlayTextBackground;
      }
      syncCaptionWidth();
      closeImageEditor(true);
    } catch (error) {
      console.error('No se pudo guardar la imagen editada.', error);
      editError.textContent = 'No se pudo guardar la imagen editada (verifica permisos de origen).';
    }
  };

  Object.entries(cropInputs).forEach(([key, input]) => {
    input.addEventListener('input', () => {
      if (!editState) return;
      const max = Number(input.max) || 0;
      const prop = cropMap[key];
      const value = clampValue(input.value, 0, max);
      editState[prop] = value;
      input.value = String(value);
      renderEditPreview();
    });
  });

  textInput.addEventListener('input', () => {
    if (!editState) return;
    editState.overlayText = textInput.value;
    renderEditPreview();
  });

  textSizeInput.addEventListener('input', () => {
    if (!editState) return;
    const value = clampValue(textSizeInput.value, 8, 200);
    editState.textSize = value;
    textSizeInput.value = String(value);
    renderEditPreview();
  });

  textColorInput.addEventListener('input', () => {
    if (!editState) return;
    editState.textColor = normalizeColor(textColorInput.value);
    textColorInput.value = editState.textColor;
    renderEditPreview();
  });

  textPositionInput.addEventListener('change', () => {
    if (!editState) return;
    editState.textPosition = ensurePosition(textPositionInput.value);
    textPositionInput.value = editState.textPosition;
    renderEditPreview();
  });

  textBgInput.addEventListener('change', () => {
    if (!editState) return;
    editState.textBackground = !!textBgInput.checked;
    renderEditPreview();
  });

  applyBtn.addEventListener('click', () => applyImageEdits());
  cancelBtn.addEventListener('click', () => closeImageEditor(true));
  closeBtn.addEventListener('click', () => closeImageEditor(true));
  editBackdrop.addEventListener('click', (e) => {
    if (e.target === editBackdrop) closeImageEditor(true);
  });
  window.addEventListener('keydown', (e) => {
    if (isEditingImage && e.key === 'Escape') {
      e.preventDefault();
      closeImageEditor(true);
    }
  });

  const microGroup = menu.querySelector('.micro-group');
  const microButtons = [];
  const createMicroButton = (direction, label) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.direction = direction;
    btn.title = `Micromover ${direction}`;
    btn.addEventListener('click', () => nudgeImage(direction));
    microGroup.appendChild(btn);
    microButtons.push(btn);
    return btn;
  };
  createMicroButton('up', '↑');
  createMicroButton('down', '↓');
  createMicroButton('left', '←');
  createMicroButton('right', '→');
  updateMicromoveAvailability();

  menu.addEventListener('click', e => {
    if (isEditingImage) return;
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

  function nudgeImage(direction) {
    if (!activeImg) return;
    const layout = activeImg.dataset.layout;
    if (layout !== 'wrap-left' && layout !== 'wrap-right') return;
    const computed = window.getComputedStyle(activeImg);
    if (direction === 'up' || direction === 'down') {
      const currentTop = parseFloat(activeImg.style.marginTop || computed.marginTop || '0');
      const delta = direction === 'up' ? -micromoveStep : micromoveStep;
      activeImg.style.marginTop = `${currentTop + delta}px`;
    } else if (direction === 'left' || direction === 'right') {
      if (layout === 'wrap-left') {
        const currentLeft = parseFloat(activeImg.style.marginLeft || computed.marginLeft || '0');
        const delta = direction === 'left' ? -micromoveStep : micromoveStep;
        activeImg.style.marginLeft = `${currentLeft + delta}px`;
      } else {
        const currentRight = parseFloat(activeImg.style.marginRight || computed.marginRight || '0');
        const delta = direction === 'left' ? micromoveStep : -micromoveStep;
        activeImg.style.marginRight = `${currentRight + delta}px`;
      }
    }
    positionUI();
  }

  function updateMicromoveAvailability() {
    const enabled = !!activeImg && (activeImg.dataset.layout === 'wrap-left' || activeImg.dataset.layout === 'wrap-right');
    microButtons.forEach(btn => {
      btn.disabled = !enabled;
    });
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

  editor.addEventListener('click', e => {
    if (isEditingImage) return;
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
    updateMicromoveAvailability();
  }

  function clearSelection() {
    if (isEditingImage) return;
    activeImg = null;
    overlay.classList.add('hidden');
    menu.classList.add('hidden');
    updateMicromoveAvailability();
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
    updateMicromoveAvailability();
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
