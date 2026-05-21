export const safeLocalStorageGet = key => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeLocalStorageSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota / privacy mode */
  }
};

export const safeLocalStorageRemove = key => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* quota / privacy mode */
  }
};

export const readJsonLocalStorage = (key, fallback) => {
  try {
    const raw = safeLocalStorageGet(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
