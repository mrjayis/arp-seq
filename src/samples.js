// Your own drum samples, kept in this browser only (IndexedDB). Nothing is
// uploaded: the files never leave the machine they were loaded on.

const DB_NAME = 'arp-seq-samples';
const STORE = 'samples';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(result?.result ?? result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Store one row's sample: {name, data: ArrayBuffer}. */
export function saveSample(slot, sample) {
  return run('readwrite', (store) => store.put(sample, slot));
}

export function deleteSample(slot) {
  return run('readwrite', (store) => store.delete(slot));
}

export function clearSamples() {
  return run('readwrite', (store) => store.clear());
}

/** All stored samples as {slot: {name, data}}; empty if storage is unavailable. */
export async function loadSamples() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const out = {};
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) { out[cursor.key] = cursor.value; cursor.continue(); }
      };
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    return {};
  }
}
