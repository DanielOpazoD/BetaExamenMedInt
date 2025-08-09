const templatePaths = {
  'Nota básica': 'templates/basic.md',
  'Recordatorio': 'templates/recordatorio.html'
};

export function getTemplates() {
  return Object.keys(templatePaths);
}

async function loadTemplate(name) {
  const path = templatePaths[name];
  const res = await fetch(path);
  if (!res.ok) throw new Error('No se pudo cargar la plantilla');
  return await res.text();
}

export async function applyTemplate(name, targetEl) {
  const content = await loadTemplate(name);
  if (templatePaths[name].endsWith('.md')) {
    targetEl.textContent = content;
  } else {
    targetEl.innerHTML = content;
  }
}
