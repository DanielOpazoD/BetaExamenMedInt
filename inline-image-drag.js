export function initInlineImageDrag(editor) {
  let draggingImg = null;
  let ghost = null;
  let dropCaret = null;
  let offsetX = 0;
  let offsetY = 0;
  let originParent = null;
  let originNext = null;

  function preventNative(e) {
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
    }
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    const img = e.target.closest('img');
    if (!img || !editor.contains(img)) return;
    e.preventDefault();

    draggingImg = img;
    originParent = img.parentNode;
    originNext = img.nextSibling;

    dropCaret = document.createElement('span');
    dropCaret.id = 'drop-caret';
    originParent.insertBefore(dropCaret, originNext);

    img.classList.add('img-dragging');

    ghost = img.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.style.pointerEvents = 'none';
    ghost.style.position = 'fixed';
    ghost.style.zIndex = '1000';
    document.body.appendChild(ghost);

    const rect = img.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    moveGhost(e);

    img.style.display = 'none';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }

  function moveGhost(e) {
    if (!ghost) return;
    ghost.style.left = e.clientX - offsetX + 'px';
    ghost.style.top = e.clientY - offsetY + 'px';
  }

  function caretRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }
    const pos = document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : null;
    if (!pos) return null;
    const r = document.createRange();
    r.setStart(pos.offsetNode, pos.offset);
    return r;
  }

  function onMouseMove(e) {
    if (!draggingImg) return;
    moveGhost(e);
    const range = caretRangeFromPoint(e.clientX, e.clientY);
    if (!range) return;
    const container = range.startContainer;
    if (!editor.contains(container)) return;
    range.collapse(true);
    if (dropCaret.parentNode) dropCaret.parentNode.removeChild(dropCaret);
    range.insertNode(dropCaret);
  }

  function onMouseUp() {
    if (!draggingImg) return;
    if (dropCaret && dropCaret.parentNode) {
      dropCaret.parentNode.insertBefore(draggingImg, dropCaret);
      dropCaret.parentNode.removeChild(dropCaret);
    } else {
      originParent.insertBefore(draggingImg, originNext);
    }
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      originParent.insertBefore(draggingImg, originNext);
      cleanup();
    }
  }

  function cleanup() {
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    if (draggingImg) {
      draggingImg.style.display = '';
      draggingImg.classList.remove('img-dragging');
    }
    draggingImg = null;
    ghost = null;
    dropCaret = null;
    originParent = null;
    originNext = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
  }

  editor.addEventListener('mousedown', onMouseDown);
  editor.addEventListener('dragstart', preventNative);

  return () => {
    editor.removeEventListener('mousedown', onMouseDown);
    editor.removeEventListener('dragstart', preventNative);
  };
}
