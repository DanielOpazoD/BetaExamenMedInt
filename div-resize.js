export function makeResizable(el) {
  if (!el) return;
  el.classList.add('resizable');
  if (getComputedStyle(el).position === 'static') {
    el.style.position = 'relative';
  }
  const handle = document.createElement('div');
  handle.className = 'resizable-handle';
  el.appendChild(handle);

  let startX = 0;
  let startWidth = 0;

  function startResize(e) {
    e.preventDefault();
    startX = e.clientX;
    startWidth = el.getBoundingClientRect().width;
    document.addEventListener('pointermove', onResize);
    document.addEventListener('pointerup', stopResize);
  }

  function onResize(e) {
    const dx = e.clientX - startX;
    const parentWidth = el.parentElement ? el.parentElement.getBoundingClientRect().width : Infinity;
    let newWidth = startWidth + dx;
    newWidth = Math.max(200, Math.min(newWidth, parentWidth));
    el.style.width = Math.round(newWidth) + 'px';
  }

  function stopResize() {
    document.removeEventListener('pointermove', onResize);
    document.removeEventListener('pointerup', stopResize);
  }

  handle.addEventListener('pointerdown', startResize);
}

export function wrapSelectionAsResizable() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  const wrapper = document.createElement('div');
  const contents = range.extractContents();
  wrapper.appendChild(contents);
  range.insertNode(wrapper);
  makeResizable(wrapper);
  const width = wrapper.getBoundingClientRect().width;
  wrapper.style.width = Math.max(200, width) + 'px';
  sel.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(wrapper);
  sel.addRange(newRange);
  return wrapper;
}
