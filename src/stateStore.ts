/*
 * The outline and the sync state in IndexedDB (doc/adr/0048). localStorage
 * caps an origin at about 5 MB, which a large outline and its replica pass.
 * Values are stored as objects under one key each; tabs of one browser tell
 * each other what changed over a BroadcastChannel, since IndexedDB fires no
 * storage event.
 */

export type StoredKey = "doc" | "sync";

export const REMOVE = Symbol("remove");
const DATABASE = "outliner-lab-state";
const STORE = "state";
const NEARLY_FULL = 0.8;
const QUOTA_CHECK_EVERY_MS = 10_000;
const FAILURE_SHOWN_EVERY_MS = 30_000;

export async function readStored(key: StoredKey): Promise<unknown> {
  const database = await opened();
  return requested(database.transaction(STORE).objectStore(STORE).get(key));
}

export async function writeStored(key: StoredKey, value: unknown): Promise<void> {
  await updateStored(key, () => value);
}

/** Reads, changes and writes one value in a single transaction, so no other tab writes in between. */
export async function updateStored(key: StoredKey, change: (current: unknown) => unknown): Promise<void> {
  const database = await opened();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const reading = store.get(key);
    reading.onsuccess = () => {
      const next = change(reading.result);
      if (next === REMOVE) store.delete(key);
      else store.put(next, key);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new DOMException("transaction aborted", "AbortError"));
  });
  void warnWhenNearlyFull();
}

let database: Promise<IDBDatabase> | null = null;

function opened(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

function requested<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---- other tabs ---------------------------------------------------------------------------

let channel: BroadcastChannel | null | undefined;

function tabs(): BroadcastChannel | null {
  channel ??= typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("outliner-lab:stored");
  return channel;
}

export function announceStored(key: StoredKey): void {
  tabs()?.postMessage(key);
}

export function onStoredElsewhere(key: StoredKey, handler: () => void): void {
  tabs()?.addEventListener("message", (event) => event.data === key && handler());
}

// ---- failures and the quota ---------------------------------------------------------------

type Stored = "outline" | "sync state";

let saveFailed: (what: Stored) => void = () => undefined;
let storageNearlyFull: (() => void) | null = null;
const failureShownAt = new Map<Stored, number>();
let quotaCheckedAt = 0;
let warnedNearlyFull = false;

export function onSaveFailed(handler: (what: Stored) => void): void {
  saveFailed = handler;
}

export function onStorageNearlyFull(handler: () => void): void {
  storageNearlyFull = handler;
}

export function reportSaveFailure(what: Stored, error: unknown): void {
  console.error(`could not save ${what}`, error);
  if (Date.now() - (failureShownAt.get(what) ?? 0) < FAILURE_SHOWN_EVERY_MS) return;
  failureShownAt.set(what, Date.now());
  saveFailed(what);
}

async function warnWhenNearlyFull(): Promise<void> {
  if (!storageNearlyFull || warnedNearlyFull || Date.now() - quotaCheckedAt < QUOTA_CHECK_EVERY_MS) return;
  quotaCheckedAt = Date.now();
  const { usage, quota } = (await navigator.storage?.estimate?.().catch(() => undefined)) ?? {};
  if (!usage || !quota || usage / quota < NEARLY_FULL) return;
  warnedNearlyFull = true;
  storageNearlyFull();
}
