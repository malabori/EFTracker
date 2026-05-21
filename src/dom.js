export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') {
      n.className = v || '';
      continue;
    }
    if (k === 'html') {
      n.innerHTML = v ?? '';
      continue;
    }
    if (k.startsWith('on') && typeof v === 'function') {
      n.addEventListener(k.slice(2), v);
      continue;
    }
    if (k in n && (typeof v === 'boolean' || typeof v === 'number' || v == null)) {
      if (v != null) n[k] = v;
      continue;
    }
    if (v != null && v !== false) n.setAttribute(k, String(v));
  }
  for (const kid of kids) {
    if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}
