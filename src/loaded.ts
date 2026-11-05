import { readStored, updateStored, StoredKey } from "./stateStore";

/*
 * What was stored when the page opened, read before the first render. An
 * outline and sync state kept in localStorage by an earlier build move to
 * IndexedDB first (doc/adr/0048): the old key is removed only once the
 * IndexedDB write has committed, and never replaces a value already there.
 */

interface Loaded {
  doc: unknown;
  sync: unknown;
}

const OLD_KEYS: Record<StoredKey, string> = { doc: "outliner-lab:doc:v1", sync: "outliner-lab:sync:v1" };

export const loaded: Loaded = await loadAtStartup();

async function loadAtStartup(): Promise<Loaded> {
  try {
    for (const key of Object.keys(OLD_KEYS) as StoredKey[]) await moveFromLocalStorage(key);
    return { doc: await readStored("doc"), sync: await readStored("sync") };
  } catch (error) {
    console.error("IndexedDB is unavailable; showing what localStorage holds", error);
    return { doc: parsedOldValue("doc"), sync: parsedOldValue("sync") };
  }
}

async function moveFromLocalStorage(key: StoredKey): Promise<void> {
  const value = parsedOldValue(key);
  if (value === null) return;
  await updateStored(key, (current) => current ?? value);
  localStorage.removeItem(OLD_KEYS[key]);
}

function parsedOldValue(key: StoredKey): unknown {
  try {
    return JSON.parse(localStorage.getItem(OLD_KEYS[key]) ?? "null");
  } catch {
    return null;
  }
}
