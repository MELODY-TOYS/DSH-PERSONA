import { parseIdentity } from '../../core/persona.mjs';

/** Unicode-aware text fallback; no remote avatar service or tracking request. */
export function initials(name) {
  const value = String(name).trim();
  if (!value) return '?';
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)]
      .slice(0, 2).map(x => x.segment).join('').toLocaleUpperCase();
  }
  return Array.from(value).slice(0, 2).join('').toLocaleUpperCase();
}
export function createAvatar(identity, role = 'assistant', size = 'normal') {
  const parsed = parseIdentity(identity);
  const node = document.createElement('span');
  node.className = 'persona-avatar';
  node.dataset.role = role;
  node.dataset.size = size;
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', parsed.name);
  node.textContent = initials(parsed.name);
  if (parsed.avatar) {
    const image = document.createElement('img');
    image.alt = '';
    image.src = parsed.avatar;
    image.decoding = 'async';
    image.addEventListener('error', () => image.remove(), { once: true });
    node.append(image);
  }
  return node;
}
