export function setupInlineImageDrag(editor) {
  if (!editor) return { destroy: () => {} };

  let draggingImg = null;
  let dropCaret = null;

  editor.addEventListener('mousedown', onMouseDown);
  editor.addEventListener('dragstart', disableNativeDnD);
  editor.addEventListener('drop', disableNativeDnD);
  editor.addEventListener('dragover', disableNativeDnD);

  function disableNativeDnD(e) {
    if (e.target && e.target.tagName === 'IMG') {
      e.preventDefault();
    }
  }

  function onMouseDown(e) {
    if (e.button !== 0 || e.target.tagName !== 'IMG') return;
    draggingImg = e.target;
    draggingImg.classList.add('img-dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!draggingImg) return;
    e.preventDefault();
    const range = caretRangeFromPoint(e.clientX, e.clientY);
    if (!range || !editor.contains(range.startContainer)) return;
    showDropCaret(range);
  }

  function onMouseUp(e) {
    if (!draggingImg) return;
    e.preventDefault();
    if (dropCaret && dropCaret.parentNode) {
      dropCaret.parentNode.insertBefore(draggingImg, dropCaret);
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStartAfter(draggingImg);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      dropCaret.remove();
    }
    draggingImg.classList.remove('img-dragging');
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && draggingImg) {
      if (dropCaret) dropCaret.remove();
      draggingImg.classList.remove('img-dragging');
      cleanup();
    }
  }

  function cleanup() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    draggingImg = null;
    dropCaret = null;
  }

  function showDropCaret(range) {
    if (!dropCaret) {
      dropCaret = document.createElement('span');
      dropCaret.id = 'drop-caret';
      dropCaret.textContent = '\u200b';
    }
    if (dropCaret.parentNode) dropCaret.parentNode.removeChild(dropCaret);
    range.insertNode(dropCaret);
  }

  function caretRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        const range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
        return range;
      }
    }
    return null;
  }

  return {
    destroy() {
      editor.removeEventListener('mousedown', onMouseDown);
      editor.removeEventListener('dragstart', disableNativeDnD);
      editor.removeEventListener('drop', disableNativeDnD);
      editor.removeEventListener('dragover', disableNativeDnD);
      cleanup();
    }
  };
}
