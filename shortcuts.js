const defaultShortcuts = {
  search: 'Control+f',
  replace: 'Control+h'
};

export function setupKeyboardShortcuts() {
  const stored = JSON.parse(localStorage.getItem('shortcuts') || '{}');
  const shortcuts = { ...defaultShortcuts, ...stored };

  document.addEventListener('keydown', e => {
    const parts = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!['Control','Shift','Alt'].includes(key)) parts.push(key);
    const combo = parts.join('+');
    if (combo === shortcuts.search) {
      e.preventDefault();
      document.getElementById('search-term')?.focus();
    } else if (combo === shortcuts.replace) {
      e.preventDefault();
      document.getElementById('replace-term')?.focus();
    }
  });

  const actionSelect = document.getElementById('shortcut-action');
  const keysInput = document.getElementById('shortcut-keys');
  const saveBtn = document.getElementById('save-shortcut-btn');
  if (actionSelect && keysInput && saveBtn) {
    saveBtn.addEventListener('click', () => {
      const action = actionSelect.value;
      const combo = keysInput.value.trim();
      if (combo) {
        shortcuts[action] = combo;
        localStorage.setItem('shortcuts', JSON.stringify(shortcuts));
        alert('Atajo guardado');
      }
    });
  }
}
