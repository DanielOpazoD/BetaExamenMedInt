export function enableInlineImageDrag(editor) {
  if (!editor) return;
  let draggingImg = null;
  let caret = null;
  let started = false;

  function rangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }
    const pos = document.caretPositionFromPoint && document.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const r = document.createRange();
    r.setStart(pos.offsetNode, pos.offset);
    r.collapse(true);
    return r;
  }

  function clearCaret() {
    if (caret && caret.parentNode) {
      caret.parentNode.removeChild(caret);
    }
    caret = null;
  }

  function cancelDrag() {
    clearCaret();
    if (draggingImg) {
      draggingImg.classList.remove('img-dragging');
      draggingImg = null;
    }
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('keydown', onKey);
    started = false;
  }

  function onMove(e) {
    if (!draggingImg) return;
    started = true;
    e.preventDefault();
    const r = rangeFromPoint(e.clientX, e.clientY);
    if (!r) return;
    if (!caret) {
      caret = document.createElement('span');
      caret.id = 'drop-caret';
      caret.textContent = '\u200b';
    }
    r.insertNode(caret);
  }

  function onUp(e) {
    if (!draggingImg) return;
    if (started && caret && caret.parentNode) {
      caret.parentNode.insertBefore(draggingImg, caret);
    }
    cancelDrag();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      cancelDrag();
    }
  }

  editor.addEventListener('mousedown', (e) => {
    if (e.target.tagName !== 'IMG') return;
    draggingImg = e.target;
    draggingImg.classList.add('img-dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey);
  });

  // Disable native drag behaviour
  editor.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
    }
  });
}
