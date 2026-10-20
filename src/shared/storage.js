// Failure-proof localStorage helpers. Private browsing, full quotas and
// blocked storage all degrade to "nothing saved" instead of breaking the page.

export function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function storageKeys() {
  try {
    return Object.keys(localStorage);
  } catch {
    return [];
  }
}
