// Drop-in replacement for the claude.ai-only window.storage, backed by IndexedDB
// (survives app restarts, much larger than localStorage — fine for progress photos).
// Same API the app already uses: get / set / delete / list, each returning a Promise.
const DB = "macro-console", STORE = "kv";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
let dbp;
const db = () => (dbp ||= open());

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const storage = {
  async get(key) {
    const v = await tx("readonly", (s) => s.get(key));
    return v === undefined ? null : { key, value: v };
  },
  async set(key, value) {
    await tx("readwrite", (s) => s.put(String(value), key));
    return { key, value };
  },
  async delete(key) {
    await tx("readwrite", (s) => s.delete(key));
    return { key, deleted: true };
  },
  async list(prefix = "") {
    const keys = await tx("readonly", (s) => s.getAllKeys());
    return { keys: keys.filter((k) => String(k).startsWith(prefix)) };
  },
};

export function installStorage() {
  window.storage = storage;
  // Ask the browser not to evict our data when space is tight.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
