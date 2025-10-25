/* Resizable table component
   initResizableTables(root) -> scan DOM and set up tables.
   destroyResizableTable(table) -> remove listeners if table removed.
*/
// Minimal vanilla JS table resizer
// Call initResizableTables() after inserting tables into the DOM.
(function(){
  function initResizableTable(table){
    if (table.dataset.resizableV2Initialized === 'true') return;
    table.dataset.resizableV2Initialized = 'true';

    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    table.appendChild(handle);

    handle.addEventListener('mousedown', startTableResize);
    table.addEventListener('mousemove', detectEdge);
    table.addEventListener('mousedown', startCellResize);
    table.addEventListener('dblclick', autoFit);
  }

  function initResizableTables(root=document){
    root.querySelectorAll('table.resizable-table').forEach(initResizableTable);
  }

  // --- Table corner resize ---
  function startTableResize(e){
    e.preventDefault();
    const table = e.target.parentElement;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = table.offsetWidth;
    const startH = table.offsetHeight;
    document.documentElement.style.userSelect = 'none';
    function onMove(ev){
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      table.style.width = startW + dx + 'px';
      table.style.height = startH + dy + 'px';
    }
    function onUp(){
      document.documentElement.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // --- Column/row resize ---
  let mode = null; // 'col' or 'row'
  let index = null;
  let startPos = 0;
  let startSize = 0;
  let guide = null;
  function detectEdge(e){
    const cell = e.target.closest('td,th');
    if(!cell || !e.currentTarget.contains(cell)) return;
    const rect = cell.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const right = rect.width - offsetX;
    const bottom = rect.height - offsetY;
    const table = e.currentTarget;
    table.style.cursor = '';
    if(right < 4){ table.style.cursor = 'col-resize'; }
    else if(bottom < 4){ table.style.cursor = 'row-resize'; }
  }

  function startCellResize(e){
    const table = e.currentTarget;
    const cell = e.target.closest('td,th');
    if(!cell) return;
    const rect = cell.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const right = rect.width - offsetX;
    const bottom = rect.height - offsetY;
    if(right >=4 && bottom >=4) return; // not on edge
    e.preventDefault();
    document.documentElement.style.userSelect = 'none';
    if(right < bottom){
      mode = 'col';
      index = cell.cellIndex;
      startPos = e.clientX;
      startSize = getColumnWidth(table, index);
      guide = makeGuide('col', e.clientX, table);
    }else{
      mode = 'row';
      index = cell.parentElement.rowIndex;
      startPos = e.clientY;
      startSize = getRowHeight(table, index);
      guide = makeGuide('row', e.clientY, table);
    }
    document.addEventListener('mousemove', doCellResize);
    document.addEventListener('mouseup', finishCellResize);
  }

  function doCellResize(ev){
    if(!mode) return;
    const delta = (mode==='col'? ev.clientX - startPos : ev.clientY - startPos);
    if(mode==='col'){
      guide.style.left = startPos + delta + 'px';
    }else{
      guide.style.top = startPos + delta + 'px';
    }
  }

  function finishCellResize(ev){
    const table = eTable(guide);
    document.documentElement.style.userSelect = '';
    document.removeEventListener('mousemove', doCellResize);
    document.removeEventListener('mouseup', finishCellResize);
    if(!mode) return;
    const delta = (mode==='col'? ev.clientX - startPos : ev.clientY - startPos);
    const newSize = startSize + delta;
    if(mode==='col'){
      if(ev.altKey && index>0){
         const prevW = getColumnWidth(table,index-1);
         setColumnWidth(table,index-1, prevW - delta, ev);
      }
      if(ev.shiftKey){
         const cells = Array.from(table.rows[0].cells).filter((c,i)=>i!==index && (!ev.altKey || i!==index-1));
         const share = delta / cells.length;
         cells.forEach(c=>{
             const w = getColumnWidth(table,c.cellIndex);
             setColumnWidth(table,c.cellIndex, w - share, ev);
         });
      }
      setColumnWidth(table, index, newSize, ev);
    }else{
      if(ev.altKey && index>0){
         const prevH = getRowHeight(table,index-1);
         setRowHeight(table,index-1, prevH - delta, ev);
      }
      if(ev.shiftKey){
         const rows = Array.from(table.rows).filter((r,i)=>i!==index && (!ev.altKey || i!==index-1));
         const share = delta / rows.length;
         rows.forEach(r=>{
             const h = getRowHeight(table,r.rowIndex);
             setRowHeight(table,r.rowIndex, h - share, ev);
         });
      }
      setRowHeight(table, index, newSize, ev);
    }
    guide.remove();
    mode = null;
  }

  function autoFit(e){
    const table = e.currentTarget;
    const cell = e.target.closest('td,th');
    if(!cell) return;
    const rect = cell.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const right = rect.width - offsetX;
    const bottom = rect.height - offsetY;
    if(right < 4){
      const idx = cell.cellIndex;
      let max = 0;
      Array.from(table.rows).forEach(r=>{
        const c = r.cells[idx];
        if(!c) return;
        c.style.width = 'auto';
        const w = c.scrollWidth + 4;
        if(w>max) max = w;
      });
      setColumnWidth(table, idx, max, e);
    }else if(bottom < 4){
      const idx = cell.parentElement.rowIndex;
      const r = table.rows[idx];
      r.style.height = 'auto';
      const h = r.scrollHeight + 4;
      setRowHeight(table, idx, h, e);
    }
  }

  function makeGuide(type, pos, table){
    const g = document.createElement('div');
    g.className = 'resize-guide';
    const rect = table.getBoundingClientRect();
    if(type==='col'){
      g.style.top = rect.top + 'px';
      g.style.bottom = (window.innerHeight - rect.bottom) + 'px';
      g.style.width = '1px';
      g.style.left = pos + 'px';
    }else{
      g.style.left = rect.left + 'px';
      g.style.right = (window.innerWidth - rect.right) + 'px';
      g.style.height = '1px';
      g.style.top = pos + 'px';
    }
    document.body.appendChild(g);
    return g;
  }

  function getColumnWidth(table, idx){
    const cell = table.rows[0].cells[idx];
    return parseInt(getComputedStyle(cell).width,10);
  }
  function setColumnWidth(table, idx, width, ev){
    Array.from(table.rows).forEach(r=>{
      const c = r.cells[idx];
      if(c) c.style.width = width + 'px';
    });
  }
  function getRowHeight(table, idx){
    const row = table.rows[idx];
    return parseInt(getComputedStyle(row).height,10);
  }
  function setRowHeight(table, idx, h, ev){
    const row = table.rows[idx];
    row.style.height = h + 'px';
  }
  function eTable(el){
    return el.closest('table');
  }

  // expose
  function destroyResizableTable(table){
    if(!table) return;
    const handle = table.querySelector('.resize-handle');
    if(handle) handle.remove();
    table.removeEventListener('mousemove', detectEdge);
    table.removeEventListener('mousedown', startCellResize);
    table.removeEventListener('dblclick', autoFit);
    table.dataset.resizableV2Initialized = 'false';
  }

  window.initResizableTables = initResizableTables;
  window.destroyResizableTable = destroyResizableTable;
})();
