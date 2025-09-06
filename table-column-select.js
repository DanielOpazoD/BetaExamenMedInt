export function enableTableColumnSelection(table) {
  let hoverCol = -1;
  const btn = document.createElement('button');
  btn.className = 'table-col-select-btn';
  btn.textContent = '\u25BC';
  btn.style.position = 'absolute';
  btn.style.top = '-14px';
  btn.style.left = '50%';
  btn.style.transform = 'translateX(-50%)';
  btn.style.display = 'none';
  btn.type = 'button';

  table.addEventListener('mousemove', onMove);
  table.addEventListener('mouseleave', hideButton);
  btn.addEventListener('mousedown', e => e.stopPropagation());
  btn.addEventListener('click', onClick);

  function onMove(e) {
    const rect = table.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y > 5) {
      hideButton();
      return;
    }
    const x = e.clientX - rect.left;
    const col = findCol(x);
    if (col === -1) {
      hideButton();
      return;
    }
    if (hoverCol !== col) {
      hoverCol = col;
      const cell = table.rows[0].cells[col];
      cell.appendChild(btn);
    }
    btn.style.display = 'block';
  }

  function hideButton() {
    hoverCol = -1;
    btn.style.display = 'none';
  }

  function onClick(e) {
    e.preventDefault();
    const col = hoverCol;
    if (col === -1) return;
    selectColumn(col);
  }

  function findCol(x) {
    let left = 0;
    const row = table.rows[0];
    if (!row) return -1;
    for (let i = 0; i < row.cells.length; i++) {
      const width = row.cells[i].offsetWidth;
      if (x >= left && x <= left + width) return i;
      left += width;
    }
    return -1;
  }

  function selectColumn(index) {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    for (const row of table.rows) {
      const cell = row.cells[index];
      if (cell) {
        const range = document.createRange();
        range.selectNodeContents(cell);
        sel.addRange(range);
      }
    }
  }
}
