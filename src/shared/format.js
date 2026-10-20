export function rub(value, locale) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n).toLocaleString(locale)} ₽` : '—';
}

export function count(value, locale) {
  return Math.round(Number(value) || 0).toLocaleString(locale);
}

export function timeAgo(timestamp, now = Date.now()) {
  const then = new Date(timestamp).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const minutes = Math.round(Math.max(0, now - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function shortDate(timestamp, locale) {
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime())
    ? 'unknown date'
    : d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}
