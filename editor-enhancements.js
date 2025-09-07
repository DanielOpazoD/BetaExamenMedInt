export function setupAdvancedEditing(editor) {
  const extraCursors = [];
  function clearExtraCursors() {
    extraCursors.forEach(c => c.marker.remove());
    extraCursors.length = 0;
  }

  editor.addEventListener('click', e => {
    if (e.altKey) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0).cloneRange();
      const marker = document.createElement('span');
      marker.className = 'extra-cursor';
      marker.innerHTML = '\u200b';
      range.insertNode(marker);
      range.setStartAfter(marker);
      range.collapse(true);
      extraCursors.push({ range, marker });
    } else {
      clearExtraCursors();
    }
  });

  editor.addEventListener('keydown', e => {
    if (!extraCursors.length) return;
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      const char = e.key;
      extraCursors.forEach(cur => {
        const text = document.createTextNode(char);
        cur.range.insertNode(text);
        cur.range.setStartAfter(text);
        cur.range.collapse(true);
      });
    } else if (e.key === 'Backspace') {
      extraCursors.forEach(cur => {
        const r = cur.range;
        r.setStart(r.startContainer, Math.max(r.startOffset - 1, 0));
        r.deleteContents();
      });
    }
  });

  let blockStart = null;
  editor.addEventListener('mousedown', e => {
    if (e.altKey) {
      e.preventDefault();
      blockStart = { x: e.clientX, y: e.clientY };
      const sel = window.getSelection();
      sel.removeAllRanges();
      editor.addEventListener('mousemove', onBlockMove);
      document.addEventListener('mouseup', onBlockEnd);
    }
  });
  function onBlockMove(e) {
    if (!blockStart) return;
    const sel = window.getSelection();
    const start = caretFromPoint(blockStart.x, blockStart.y);
    const end = caretFromPoint(e.clientX, e.clientY);
    if (start && end) {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  function onBlockEnd() {
    editor.removeEventListener('mousemove', onBlockMove);
    document.removeEventListener('mouseup', onBlockEnd);
    blockStart = null;
  }
  function caretFromPoint(x, y) {
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      return { node: pos.offsetNode, offset: pos.offset };
    }
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      return { node: range.startContainer, offset: range.startOffset };
    }
    return null;
  }

  // Previously, the editor enabled dragging of paragraphs by default to allow
  // reordering lines. This interfered with the "hand" tool in the main
  // application because elements kept the `draggable` attribute even when block
  // dragging was disabled. By removing the automatic draggable behavior and the
  // related observers, the editor respects the default state where text can be
  // selected normally unless block dragging is explicitly enabled elsewhere.
}
