export function makeImageResizable(fig) {
  if (!fig || fig.dataset.resizable === 'true') return;
  fig.dataset.resizable = 'true';
  fig.style.position = fig.style.position || 'relative';
  const img = fig.querySelector('img');
  const dirs = ['n','e','s','w','nw','ne','sw','se'];
  let activeDir = null;
  let startX = 0, startY = 0, startW = 0, startH = 0;

  function startResize(e, dir) {
    e.preventDefault();
    e.stopPropagation();
    activeDir = dir;
    startX = e.clientX;
    startY = e.clientY;
    startW = fig.offsetWidth;
    startH = fig.offsetHeight;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', stopResize);
  }

  function onMove(e) {
    if (!activeDir) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newW = startW;
    let newH = startH;
    if (activeDir.includes('e')) newW = startW + dx;
    if (activeDir.includes('w')) newW = startW - dx;
    if (activeDir.includes('s')) newH = startH + dy;
    if (activeDir.includes('n')) newH = startH - dy;
    newW = Math.max(30, newW);
    newH = Math.max(30, newH);
    fig.style.width = newW + 'px';
    fig.style.height = newH + 'px';
    if (img) {
      img.style.width = '100%';
      img.style.height = '100%';
    }
  }

  function stopResize() {
    activeDir = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', stopResize);
  }

  dirs.forEach(dir => {
    const handle = document.createElement('div');
    handle.className = `img-resize-handle ${dir}`;
    handle.addEventListener('mousedown', e => startResize(e, dir));
    fig.appendChild(handle);
  });
}
