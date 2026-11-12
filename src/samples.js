// Your own drum samples, kept in this browser only (IndexedDB). Nothing is
// uploaded: the files never leave the machine they were loaded on.

const DB_NAME = 'arp-seq-samples';
const STORE = 'samples';

function openDb(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn, name = DB_NAME) {
  const db = await openDb(name);
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

// ---- The breakbeat slicer's break, in its own database: {name, data, bars}.
const BREAK_DB = 'arp-seq-breaks';

export function saveBreak(entry) {
  return run('readwrite', (store) => store.put(entry, 'break'), BREAK_DB);
}

export function clearBreak() {
  return run('readwrite', (store) => store.delete('break'), BREAK_DB);
}

export async function loadBreak() {
  try {
    const db = await openDb(BREAK_DB);
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get('break');
      tx.oncomplete = () => { db.close(); resolve(req.result || null); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    return null;
  }
}

// ---- Score player: MIDI files you've loaded, {id: {name, data}}, in their own database.
const SCORE_DB = 'arp-seq-scores';

export function saveScore(id, entry) {
  return run('readwrite', (store) => store.put(entry, id), SCORE_DB);
}

export function deleteScore(id) {
  return run('readwrite', (store) => store.delete(id), SCORE_DB);
}

export async function loadScores() {
  try {
    const db = await openDb(SCORE_DB);
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
