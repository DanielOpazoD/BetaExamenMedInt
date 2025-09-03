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

  let dragLine = null;

  // Allow dragging lines only when holding Alt to avoid interfering with text selection.
  editor.addEventListener('dragstart', e => {
    if (!e.altKey) {
      e.preventDefault();
      return;
    }
    const line = e.target.closest('p');
    if (!line) return;
    dragLine = line;
    e.dataTransfer.setData('text/plain', '');
  });
  editor.addEventListener('dragover', e => {
    const line = e.target.closest('p');
    if (!line || !dragLine || line === dragLine) return;
    e.preventDefault();
  });
  editor.addEventListener('drop', e => {
    const line = e.target.closest('p');
    if (!line || !dragLine || line === dragLine) return;
    e.preventDefault();
    editor.insertBefore(dragLine, line);
    dragLine = null;
  });

  // Toggle draggable attribute based on Alt key usage
  editor.addEventListener('mousedown', e => {
    const p = e.target.closest('p');
    if (!p) return;
    p.setAttribute('draggable', e.altKey ? 'true' : 'false');
  });
  document.addEventListener('mouseup', () => {
    editor.querySelectorAll('p').forEach(p => p.setAttribute('draggable', 'false'));
  });

  editor.querySelectorAll('p').forEach(p => p.setAttribute('draggable', 'false'));
  const observer = new MutationObserver(() => {
    editor.querySelectorAll('p').forEach(p => {
      p.setAttribute('draggable', 'false');
    });
  });
  observer.observe(editor, { childList: true, subtree: true });
}
