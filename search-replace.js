export function setupAdvancedSearchReplace() {
  const searchInput = document.getElementById('search-term');
  const replaceInput = document.getElementById('replace-term');
  const regexCheck = document.getElementById('search-regex');
  const caseCheck = document.getElementById('search-case');
  const btn = document.getElementById('search-replace-btn');
  if (!searchInput || !replaceInput || !regexCheck || !caseCheck || !btn) return;

  const replaceText = (node, regex, replacement) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = node.textContent.replace(regex, replacement);
    } else {
      node.childNodes.forEach(child => replaceText(child, regex, replacement));
    }
  };

  btn.addEventListener('click', () => {
    const pattern = searchInput.value;
    if (!pattern) return;
    const replacement = replaceInput.value;
    let flags = 'g';
    if (!caseCheck.checked) flags += 'i';
    const regex = regexCheck.checked
      ? new RegExp(pattern, flags)
      : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    replaceText(document.body, regex, replacement);
  });
}
