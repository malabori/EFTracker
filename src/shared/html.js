const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
}

// Escapes `text` and wraps case-insensitive matches of `query` in <mark>.
// Plain string search, so a query like "(" or "[" can never throw.
export function highlight(text, query) {
  const src = String(text ?? '');
  const needle = String(query ?? '')
    .trim()
    .toLowerCase();
  const lower = src.toLowerCase();
  // Some characters change length when lower-cased; skip highlighting then
  // rather than risk marking the wrong span.
  if (!needle || lower.length !== src.length) return esc(src);
  let out = '';
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    out +=
      esc(src.slice(from, at)) +
      '<mark>' +
      esc(src.slice(at, at + needle.length)) +
      '</mark>';
    from = at + needle.length;
  }
  return out + esc(src.slice(from));
}

export const $ = (selector, root = document) => root.querySelector(selector);
