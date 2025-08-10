import { marked } from 'https://cdn.jsdelivr.net/npm/marked/marked.esm.js';

export function renderMarkdown(content) {
  return marked.parse(content);
}
