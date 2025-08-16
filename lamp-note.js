export function insertLampNote(text = '') {
  const sup = document.createElement('sup');
  sup.className = 'lamp-note';
  sup.innerHTML = `💡<span class="lamp-note-content" contenteditable="true">${text}</span>`;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.insertNode(sup);
  range.setStartAfter(sup);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  const note = sup.querySelector('.lamp-note-content');
  note.focus();
}
window.insertLampNote = insertLampNote;
