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
    <div class="extras-group">
      <button class="title-btn">Título</button>
      <button class="edit-image-btn">Editar</button>
    </div>
  `;
  document.body.appendChild(menu);

  const micromoveStep = 4;
  let activeImg = null;

  const imageEditor = createImageEditor();

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
    const layoutBtn = e.target.closest('[data-layout]');
    const alignBtn = e.target.closest('[data-align]');
    if (layoutBtn && activeImg) {
      applyLayout(layoutBtn.dataset.layout);
    } else if (alignBtn && activeImg) {
      applyAlignment(alignBtn.dataset.align);
    } else if (e.target.classList.contains('title-btn') && activeImg) {
      openTitleEditor();
    } else if (e.target.classList.contains('edit-image-btn') && activeImg) {
      imageEditor.open(activeImg);
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

  function createImageEditor() {
    const modal = document.createElement('div');
    modal.className = 'image-editor-modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'image-editor-title');
    modal.innerHTML = `
      <div class="image-editor-dialog">
        <header class="image-editor-header">
          <h2 id="image-editor-title">Editar imagen</h2>
          <button type="button" class="image-editor-close" aria-label="Cerrar">×</button>
        </header>
        <div class="image-editor-body">
          <div class="image-editor-preview">
            <canvas></canvas>
            <div class="image-editor-loading" role="status">Cargando imagen…</div>
            <p class="image-editor-size">—</p>
          </div>
          <div class="image-editor-controls">
            <section class="image-editor-section">
              <h3>Recorte</h3>
              <div class="image-editor-field">
                <label>Superior
                  <input type="range" name="crop-top" min="0" value="0">
                  <output data-for="crop-top">0 px</output>
                </label>
              </div>
              <div class="image-editor-field">
                <label>Inferior
                  <input type="range" name="crop-bottom" min="0" value="0">
                  <output data-for="crop-bottom">0 px</output>
                </label>
              </div>
              <div class="image-editor-field">
                <label>Izquierda
                  <input type="range" name="crop-left" min="0" value="0">
                  <output data-for="crop-left">0 px</output>
                </label>
              </div>
              <div class="image-editor-field">
                <label>Derecha
                  <input type="range" name="crop-right" min="0" value="0">
                  <output data-for="crop-right">0 px</output>
                </label>
              </div>
            </section>
            <section class="image-editor-section">
              <h3>Texto superpuesto</h3>
              <div class="image-editor-field">
                <label>Contenido
                  <input type="text" name="overlay-text" placeholder="Añade un texto opcional">
                </label>
              </div>
              <div class="image-editor-field image-editor-field--split">
                <label>Tamaño
                  <input type="range" name="overlay-size" min="12" max="96" value="28">
                  <output data-for="overlay-size">28 px</output>
                </label>
                <label>Color
                  <input type="color" name="overlay-color" value="#111827">
                </label>
              </div>
              <div class="image-editor-field image-editor-field--split">
                <label>Fondo
                  <input type="color" name="overlay-bg" value="#ffffff">
                </label>
                <label>Opacidad del fondo
                  <input type="range" name="overlay-bg-opacity" min="0" max="0.95" step="0.05" value="0">
                  <output data-for="overlay-bg-opacity">0%</output>
                </label>
              </div>
              <div class="image-editor-field image-editor-field--split">
                <label>Posición X
                  <input type="range" name="overlay-x" min="0" max="100" value="6">
                  <output data-for="overlay-x">6%</output>
                </label>
                <label>Posición Y
                  <input type="range" name="overlay-y" min="0" max="100" value="6">
                  <output data-for="overlay-y">6%</output>
                </label>
              </div>
            </section>
          </div>
        </div>
        <footer class="image-editor-footer">
          <button type="button" class="cancel-btn">Cancelar</button>
          <button type="button" class="apply-btn">Aplicar</button>
        </footer>
      </div>
    `;
    document.body.appendChild(modal);

    const canvas = modal.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('El editor de imágenes no pudo inicializar su lienzo.');
      return {
        open() {},
        close() {}
      };
    }
    const loadingIndicator = modal.querySelector('.image-editor-loading');
    const sizeLabel = modal.querySelector('.image-editor-size');
    const closeBtn = modal.querySelector('.image-editor-close');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const applyBtn = modal.querySelector('.apply-btn');
    const textInput = modal.querySelector('input[name="overlay-text"]');
    const textSizeInput = modal.querySelector('input[name="overlay-size"]');
    const textColorInput = modal.querySelector('input[name="overlay-color"]');
    const textBgInput = modal.querySelector('input[name="overlay-bg"]');
    const textBgOpacityInput = modal.querySelector('input[name="overlay-bg-opacity"]');
    const textXInput = modal.querySelector('input[name="overlay-x"]');
    const textYInput = modal.querySelector('input[name="overlay-y"]');
    const cropInputs = {
      top: modal.querySelector('input[name="crop-top"]'),
      bottom: modal.querySelector('input[name="crop-bottom"]'),
      left: modal.querySelector('input[name="crop-left"]'),
      right: modal.querySelector('input[name="crop-right"]')
    };
    const cropOutputs = {
      top: modal.querySelector('output[data-for="crop-top"]'),
      bottom: modal.querySelector('output[data-for="crop-bottom"]'),
      left: modal.querySelector('output[data-for="crop-left"]'),
      right: modal.querySelector('output[data-for="crop-right"]')
    };
    const overlayOutputs = {
      size: modal.querySelector('output[data-for="overlay-size"]'),
      bgOpacity: modal.querySelector('output[data-for="overlay-bg-opacity"]'),
      x: modal.querySelector('output[data-for="overlay-x"]'),
      y: modal.querySelector('output[data-for="overlay-y"]')
    };

    const baseFontFamily = window.getComputedStyle(editor).fontFamily || 'sans-serif';

    const state = {
      target: null,
      image: null,
      naturalWidth: 0,
      naturalHeight: 0,
      crop: { top: 0, bottom: 0, left: 0, right: 0 },
      returningFocus: null
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeEditor();
      }
    };

    function openEditor(targetImage) {
      if (!targetImage) return;
      state.target = targetImage;
      state.returningFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modal.classList.remove('hidden');
      document.body.classList.add('image-editor-open');
      loadingIndicator.textContent = 'Cargando imagen…';
      loadingIndicator.classList.remove('hidden');
      canvas.classList.add('image-editor-canvas--hidden');
      applyBtn.disabled = true;
      textInput.value = '';
      textSizeInput.value = '28';
      textColorInput.value = '#111827';
      textBgInput.value = '#ffffff';
      textBgOpacityInput.value = '0';
      textXInput.value = '6';
      textYInput.value = '6';
      overlayOutputs.size.textContent = '28 px';
      overlayOutputs.bgOpacity.textContent = '0%';
      overlayOutputs.x.textContent = '6%';
      overlayOutputs.y.textContent = '6%';

      const loader = new Image();
      loader.decoding = 'async';
      const expectedTarget = targetImage;
      loader.onload = () => {
        if (state.target !== expectedTarget) return;
        state.image = loader;
        state.naturalWidth = loader.naturalWidth || loader.width;
        state.naturalHeight = loader.naturalHeight || loader.height;
        state.crop = { top: 0, bottom: 0, left: 0, right: 0 };
        updateCropInputs();
        renderPreview();
        loadingIndicator.classList.add('hidden');
        canvas.classList.remove('image-editor-canvas--hidden');
        applyBtn.disabled = false;
        textInput.focus();
      };
      loader.onerror = () => {
        if (state.target !== expectedTarget) return;
        loadingIndicator.textContent = 'No se pudo cargar la imagen.';
        applyBtn.disabled = true;
      };
      loader.src = targetImage.src;
      document.addEventListener('keydown', onKeyDown, true);
    }

    function closeEditor() {
      modal.classList.add('hidden');
      document.body.classList.remove('image-editor-open');
      document.removeEventListener('keydown', onKeyDown, true);
      state.target = null;
      if (state.returningFocus && state.returningFocus.focus) {
        state.returningFocus.focus();
      }
      state.returningFocus = null;
    }

    function updateCropInputs() {
      const maxVertical = Math.max(0, state.naturalHeight - 1);
      const maxHorizontal = Math.max(0, state.naturalWidth - 1);
      cropInputs.top.max = maxVertical;
      cropInputs.bottom.max = maxVertical;
      cropInputs.left.max = maxHorizontal;
      cropInputs.right.max = maxHorizontal;
      Object.keys(cropInputs).forEach(key => {
        cropInputs[key].value = state.crop[key];
        if (cropOutputs[key]) {
          cropOutputs[key].textContent = `${state.crop[key]} px`;
        }
      });
    }

    function updateCropValue(edge, value) {
      const numeric = Math.max(0, Math.round(Number(value) || 0));
      state.crop[edge] = numeric;
      if (state.crop.top + state.crop.bottom >= state.naturalHeight) {
        if (edge === 'top') {
          state.crop.top = Math.max(0, state.naturalHeight - state.crop.bottom - 1);
        } else if (edge === 'bottom') {
          state.crop.bottom = Math.max(0, state.naturalHeight - state.crop.top - 1);
        }
      }
      if (state.crop.left + state.crop.right >= state.naturalWidth) {
        if (edge === 'left') {
          state.crop.left = Math.max(0, state.naturalWidth - state.crop.right - 1);
        } else if (edge === 'right') {
          state.crop.right = Math.max(0, state.naturalWidth - state.crop.left - 1);
        }
      }
      if (cropInputs[edge]) {
        cropInputs[edge].value = state.crop[edge];
      }
      if (cropOutputs[edge]) {
        cropOutputs[edge].textContent = `${state.crop[edge]} px`;
      }
      renderPreview();
    }

    function renderPreview() {
      if (!state.image || !ctx) return;
      const width = Math.max(1, state.naturalWidth - state.crop.left - state.crop.right);
      const height = Math.max(1, state.naturalHeight - state.crop.top - state.crop.bottom);
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(
        state.image,
        state.crop.left,
        state.crop.top,
        width,
        height,
        0,
        0,
        width,
        height
      );

      const text = textInput.value.trim();
      if (text) {
        const fontSize = Math.max(8, Math.round(Number(textSizeInput.value) || 28));
        const color = textColorInput.value || '#111827';
        const bgColor = textBgInput.value || '#ffffff';
        const bgOpacity = Math.min(0.95, Math.max(0, Number(textBgOpacityInput.value) || 0));
        const xPercent = Math.min(100, Math.max(0, Number(textXInput.value) || 0));
        const yPercent = Math.min(100, Math.max(0, Number(textYInput.value) || 0));
        const textLines = text.split(/\r?\n/);
        const lineHeight = Math.round(fontSize * 1.25);
        ctx.font = `${fontSize}px ${baseFontFamily}`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = color;
        ctx.textAlign = 'left';

        let maxLineWidth = 0;
        textLines.forEach(line => {
          const metrics = ctx.measureText(line);
          maxLineWidth = Math.max(maxLineWidth, metrics.width);
        });
        const boxWidth = Math.ceil(maxLineWidth) + 16;
        const boxHeight = textLines.length * lineHeight + 16;
        const rawX = Math.round((width - 1) * (xPercent / 100));
        const rawY = Math.round((height - 1) * (yPercent / 100));
        const maxX = Math.max(0, width - boxWidth);
        const maxY = Math.max(0, height - boxHeight);
        const clampedX = Math.min(maxX, Math.max(0, rawX));
        const clampedY = Math.min(maxY, Math.max(0, rawY));

        if (bgOpacity > 0) {
          ctx.save();
          ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
          ctx.fillRect(clampedX, clampedY, Math.min(boxWidth, width), Math.min(boxHeight, height));
          ctx.restore();
        }

        ctx.fillStyle = color;
        textLines.forEach((line, index) => {
          const textX = clampedX + 8;
          const textY = clampedY + 8 + index * lineHeight;
          ctx.fillText(line, textX, textY);
        });
      }

      sizeLabel.textContent = `${width} × ${height}px`;
    }

    function applyChanges() {
      if (!state.target) return;
      const previousWidth = state.target.style.width;
      const previousHeight = state.target.style.height;
      const dataUrl = canvas.toDataURL('image/png');
      const target = state.target;
      const refreshSelection = () => {
        target.style.width = previousWidth;
        target.style.height = previousHeight;
        syncCaptionWidth();
        positionUI();
      };
      target.addEventListener('load', refreshSelection, { once: true });
      target.src = dataUrl;
      target.dataset.edited = 'true';
      closeEditor();
      if (!target.complete) {
        return;
      }
      refreshSelection();
    }

    function hexToRgba(hex, alpha) {
      let normalized = (hex || '').trim().replace('#', '');
      if (normalized.length === 3) {
        normalized = normalized.split('').map(ch => ch + ch).join('');
      }
      if (normalized.length !== 6) {
        return `rgba(255,255,255,${alpha})`;
      }
      const r = parseInt(normalized.substring(0, 2), 16);
      const g = parseInt(normalized.substring(2, 4), 16);
      const b = parseInt(normalized.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    Object.entries(cropInputs).forEach(([edge, input]) => {
      input.addEventListener('input', (event) => updateCropValue(edge, event.target.value));
    });

    textInput.addEventListener('input', renderPreview);
    textSizeInput.addEventListener('input', (event) => {
      const value = Math.max(8, Math.round(Number(event.target.value) || 28));
      overlayOutputs.size.textContent = `${value} px`;
      renderPreview();
    });
    textColorInput.addEventListener('input', renderPreview);
    textBgInput.addEventListener('input', renderPreview);
    textBgOpacityInput.addEventListener('input', (event) => {
      const value = Math.min(0.95, Math.max(0, Number(event.target.value) || 0));
      overlayOutputs.bgOpacity.textContent = `${Math.round(value * 100)}%`;
      renderPreview();
    });
    textXInput.addEventListener('input', (event) => {
      const value = Math.min(100, Math.max(0, Number(event.target.value) || 0));
      overlayOutputs.x.textContent = `${Math.round(value)}%`;
      renderPreview();
    });
    textYInput.addEventListener('input', (event) => {
      const value = Math.min(100, Math.max(0, Number(event.target.value) || 0));
      overlayOutputs.y.textContent = `${Math.round(value)}%`;
      renderPreview();
    });

    closeBtn.addEventListener('click', closeEditor);
    cancelBtn.addEventListener('click', closeEditor);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeEditor();
      }
    });
    applyBtn.addEventListener('click', applyChanges);

    return {
      open: openEditor,
      close: closeEditor
    };
  }

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
    updateMicromoveAvailability();
  }

  function clearSelection() {
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
