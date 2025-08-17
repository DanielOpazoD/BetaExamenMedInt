export function makeCalloutResizable(callout, { minWidth = 100 } = {}) {
  let startX = 0;
  let startWidth = 0;
  let isResizing = false;

  callout.style.position = callout.style.position || 'relative';
  const handle = document.createElement('div');
  handle.className = 'callout-resize-handle';
  callout.appendChild(handle);

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    startX = e.clientX;
    startWidth = callout.offsetWidth;
  });

  document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const newWidth = Math.max(minWidth, startWidth + dx);
    callout.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
  });
}
