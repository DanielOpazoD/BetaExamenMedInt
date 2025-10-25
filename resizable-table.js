// Vanilla JS resizable table component
(function(){
  const STEP = 4; // snap step
  function snap(v){ return Math.round(v/STEP)*STEP; }

  function initResizableTables(root=document){
    const tables = root.querySelectorAll('table.resizable-table:not([data-resizable-initialized])');
    tables.forEach(setupTable);
  }

  function setupTable(table){
    table.dataset.resizableInitialized = 'true';
    table.style.position = 'relative';
    const handle = document.createElement('div');
    handle.className = 'table-handle';
    table.appendChild(handle);

    let drag = null;
    let guide = null;

    table.addEventListener('mousemove', e => {
      if(drag) return;
      const rect = table.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = getColEdge(table, x);
      const row = getRowEdge(table, y);
      if(col > -1) table.style.cursor = 'col-resize';
      else if(row > -1) table.style.cursor = 'row-resize';
      else table.style.cursor = '';
    });

    table.addEventListener('mousedown', e => {
      if(e.target === handle) return;
      const rect = table.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = getColEdge(table, x);
      const row = getRowEdge(table, y);
      if(col > -1){
        e.preventDefault();
        startDrag('col', col, e);
      } else if(row > -1){
        e.preventDefault();
        startDrag('row', row, e);
      }
    });

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      startDrag('table', null, e);
    });

    table.addEventListener('dblclick', e => {
      const rect = table.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = getColEdge(table, x);
      const row = getRowEdge(table, y);
      if(col > -1) autoFitCol(table, col);
      else if(row > -1) autoFitRow(table, row);
    });

    function startDrag(type, index, e){
      drag = { type, index, startX: e.clientX, startY: e.clientY };
      if(type === 'table'){
        drag.startWidth = table.offsetWidth;
        drag.startHeight = table.offsetHeight;
      } else if(type === 'col'){
        drag.startSize = getColWidth(table, index);
      } else {
        drag.startSize = getRowHeight(table, index);
      }
      guide = document.createElement('div');
      guide.className = 'resize-guide ' + (type==='col'?'vertical':'horizontal');
      table.appendChild(guide);
      document.body.style.userSelect = 'none';
    }

    document.addEventListener('mousemove', e => {
      if(!drag) return;
      if(drag.type === 'col'){
        const dx = e.clientX - drag.startX;
        if(e.altKey){
          const i = drag.index;
          const leftW = getColWidth(table, i);
          const rightW = getColWidth(table, i+1);
          setColWidth(table, i, snap(Math.max(30, leftW + dx/2)));
          setColWidth(table, i+1, snap(Math.max(30, rightW - dx/2)));
        } else if(e.shiftKey){
          const ratio = (drag.startSize + dx) / drag.startSize;
          const cols = table.rows[0].cells.length;
          for(let c=0;c<cols;c++){
            let w = getColWidth(table,c);
            if(c===drag.index) w = drag.startSize + dx;
            else w = w * ratio;
            setColWidth(table,c,snap(Math.max(30,w)));
          }
        } else {
          const newW = snap(Math.max(30, drag.startSize + dx));
          setColWidth(table, drag.index, newW);
        }
        guide.style.left = getColRight(table, drag.index) + 'px';
      } else if(drag.type === 'row'){
        const dy = e.clientY - drag.startY;
        if(e.altKey){
          const i = drag.index;
          const topH = getRowHeight(table,i);
          const botH = getRowHeight(table,i+1);
          setRowHeight(table,i,snap(Math.max(24, topH + dy/2)));
          setRowHeight(table,i+1,snap(Math.max(24, botH - dy/2)));
        } else if(e.shiftKey){
          const ratio = (drag.startSize + dy) / drag.startSize;
          const rows = table.rows.length;
          for(let r=0;r<rows;r++){
            let h = getRowHeight(table,r);
            if(r===drag.index) h = drag.startSize + dy;
            else h = h * ratio;
            setRowHeight(table,r,snap(Math.max(24,h)));
          }
        } else {
          const newH = snap(Math.max(24, drag.startSize + dy));
          setRowHeight(table, drag.index, newH);
        }
        guide.style.top = getRowBottom(table, drag.index) + 'px';
      } else {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        table.style.width = snap(Math.max(60, drag.startWidth + dx)) + 'px';
        table.style.height = snap(Math.max(40, drag.startHeight + dy)) + 'px';
      }
    });

    document.addEventListener('mouseup', () => {
      if(!drag) return;
      drag = null;
      document.body.style.userSelect = '';
      if(guide){ guide.remove(); guide = null; }
      table.style.cursor = '';
    });
  }

  function getColEdge(table, x){
    const row = table.rows[0];
    if(!row) return -1;
    let left = 0;
    for(let i=0;i<row.cells.length;i++){
      left += row.cells[i].offsetWidth;
      if(Math.abs(x-left)<=4) return i;
    }
    return -1;
  }
  function getRowEdge(table, y){
    let top=0;
    for(let i=0;i<table.rows.length;i++){
      top += table.rows[i].offsetHeight;
      if(Math.abs(y-top)<=4) return i;
    }
    return -1;
  }
  function getColWidth(table,i){
    const cell = table.rows[0].cells[i];
    return cell ? cell.offsetWidth : 0;
  }
  function setColWidth(table,i,w){
    for(const row of table.rows){
      const cell = row.cells[i];
      if(cell) cell.style.width = w + 'px';
    }
  }
  function getColRight(table,i){
    const row = table.rows[0];
    let right = 0;
    for(let c=0;c<=i;c++) right += row.cells[c].offsetWidth;
    return right;
  }
  function getRowHeight(table,i){
    const row = table.rows[i];
    return row ? row.offsetHeight : 0;
  }
  function setRowHeight(table,i,h){
    const row = table.rows[i];
    if(row) row.style.height = h + 'px';
  }
  function getRowBottom(table,i){
    let bottom = 0;
    for(let r=0;r<=i;r++) bottom += table.rows[r].offsetHeight;
    return bottom;
  }
  function autoFitCol(table,i){
    let max = 0;
    for(const row of table.rows){
      const cell = row.cells[i];
      if(cell){
        const prev = cell.style.width;
        cell.style.width = 'auto';
        const w = cell.offsetWidth;
        if(w>max) max=w;
        cell.style.width = prev;
      }
    }
    setColWidth(table,i,snap(max));
  }
  function autoFitRow(table,i){
    const row = table.rows[i];
    if(row){
      const prev = row.style.height;
      row.style.height = 'auto';
      const h = row.offsetHeight;
      row.style.height = prev;
      setRowHeight(table,i,snap(h));
    }
  }

  window.initResizableTables = initResizableTables;
})();
