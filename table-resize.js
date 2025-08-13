export function makeTableResizable(table, { minSize = 30 } = {}) {
  let hoverEdge = null;
  let activeResize = null;
  let startX = 0;
  let startY = 0;
  let startSize = 0;
  let startWidth = 0;
  let startHeight = 0;

  table.style.position = 'relative';
  const handle = document.createElement('div');
  handle.className = 'table-resize-handle';
  table.appendChild(handle);
  handle.addEventListener('mousemove', e => {
    e.stopPropagation();
    table.style.cursor = 'se-resize';
  });

  table.addEventListener('mousemove', onHover);
  table.addEventListener('mousedown', startResize);
  handle.addEventListener('mousedown', startTableResize);
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopResize);
  document.addEventListener('keydown', cancelOnEsc);

  function onHover(e) {
    if (activeResize) return;
    const rect = table.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = findColEdge(x);
    const row = findRowEdge(y);
    if (col > -1) {
      table.style.cursor = 'col-resize';
      hoverEdge = { type: 'col', index: col };
    } else if (row > -1) {
      table.style.cursor = 'row-resize';
      hoverEdge = { type: 'row', index: row };
    } else {
      table.style.cursor = '';
      hoverEdge = null;
    }
  }

  function startResize(e) {
    if (!hoverEdge) return;
    e.preventDefault();
    activeResize = hoverEdge;
    startX = e.clientX;
    startY = e.clientY;
    startSize = activeResize.type === 'col'
      ? getColWidth(activeResize.index)
      : getRowHeight(activeResize.index);
  }

  function startTableResize(e) {
    e.stopPropagation();
    e.preventDefault();
    activeResize = { type: 'table' };
    startX = e.clientX;
    startY = e.clientY;
    startWidth = table.offsetWidth;
    startHeight = table.offsetHeight;
    table.style.cursor = 'se-resize';
  }

  function onDrag(e) {
    if (!activeResize) return;
    if (activeResize.type === 'col') {
      const dx = e.clientX - startX;
      const newWidth = Math.max(minSize, startSize + dx);
      setColWidth(activeResize.index, newWidth);
    } else if (activeResize.type === 'row') {
      const dy = e.clientY - startY;
      const newHeight = Math.max(minSize, startSize + dy);
      setRowHeight(activeResize.index, newHeight);
    } else {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newWidth = Math.max(minSize, startWidth + dx);
      const newHeight = Math.max(minSize, startHeight + dy);
      table.style.width = newWidth + 'px';
      table.style.height = newHeight + 'px';
    }
  }

  function stopResize() {
    if (!activeResize) return;
    activeResize = null;
    table.style.cursor = '';
  }

  function cancelOnEsc(e) {
    if (e.key !== 'Escape' || !activeResize) return;
    if (activeResize.type === 'col') {
      setColWidth(activeResize.index, startSize);
    } else if (activeResize.type === 'row') {
      setRowHeight(activeResize.index, startSize);
    } else {
      table.style.width = startWidth + 'px';
      table.style.height = startHeight + 'px';
    }
    activeResize = null;
    table.style.cursor = '';
  }

  function findColEdge(x) {
    let left = 0;
    const row = table.rows[0];
    if (!row) return -1;
    for (let i = 0; i < row.cells.length; i++) {
      left += row.cells[i].offsetWidth;
      if (Math.abs(x - left) <= 4) return i;
    }
    return -1;
  }

  function findRowEdge(y) {
    let top = 0;
    for (let i = 0; i < table.rows.length; i++) {
      top += table.rows[i].offsetHeight;
      if (Math.abs(y - top) <= 4) return i;
    }
    return -1;
  }

  function getColWidth(index) {
    const cell = table.rows[0]?.cells[index];
    return cell ? cell.offsetWidth : 0;
  }

  function setColWidth(index, width) {
    for (const row of table.rows) {
      const cell = row.cells[index];
      if (cell) cell.style.width = width + 'px';
    }
  }

  function getRowHeight(index) {
    const row = table.rows[index];
    return row ? row.offsetHeight : 0;
  }

  function setRowHeight(index, height) {
    const row = table.rows[index];
    if (row) row.style.height = height + 'px';
  }
}
