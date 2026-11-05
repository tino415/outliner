import { Doc, ROOT } from "./model";
import { propertyKey } from "./notes";
import { announceStored, onStoredElsewhere, readStored, reportSaveFailure, writeStored } from "./stateStore";

const PREFS_KEY = "outliner-lab:prefs:v1";

type Theme = "system" | "light" | "dark";
type TextSize = "small" | "medium" | "large";

export interface Prefs {
  theme: Theme;
  textSize: TextSize;
  showCompleted: boolean;
  /** Pages whose column view was switched on or off by hand; others follow their `:columns:` property. */
  columnPages: Record<string, boolean>;
}

export type AppearancePref = keyof Pick<Prefs, "theme" | "textSize">;

const defaultPrefs: Prefs = { theme: "system", textSize: "medium", showCompleted: true, columnPages: {} };

export function loadDoc(stored: unknown): Doc | null {
  if (!stored) return null;
  try {
    return normalizeDoc(stored as Doc);
  } catch (error) {
    console.error("stored outline is unreadable", error);
    return null;
  }
}

export function parseDoc(raw: string): Doc {
  return normalizeDoc(JSON.parse(raw) as Doc);
}

function normalizeDoc(parsed: Doc): Doc {
  if (!parsed?.items?.[ROOT]) throw new Error("not an outline: no root item");
  return { items: Object.fromEntries(Object.entries(parsed.items).map(([id, item]) => [id, { ...item, properties: syncableProperties(item.properties ?? {}) }])) };
}

/** Keys as the sync server takes them, in lower case; one it would refuse is left out. */
function syncableProperties(properties: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(properties).flatMap(([key, value]) => (propertyKey(key) && typeof value === "string" ? [[propertyKey(key)!, value]] : [])));
}

let unsavedDoc: Doc | null = null;
let writingDoc: Doc | null = null;
let writeDone: Promise<void> = Promise.resolve();

/** Starts writing at once, since a write begun while the page unloads may be dropped; edits made during a write are written together after it. */
export function saveDocSoon(doc: Doc): void {
  unsavedDoc = doc;
  void flushSave();
}

function discardPendingSave(): void {
  unsavedDoc = null;
}

export function flushSave(): Promise<void> {
  if (unsavedDoc && !writingDoc) writeDone = saveDoc(unsavedDoc);
  return writeDone;
}

async function saveDoc(doc: Doc): Promise<void> {
  writingDoc = doc;
  let saved = false;
  try {
    await writeStored("doc", doc);
    saved = true;
    if (unsavedDoc === doc) unsavedDoc = null;
    announceStored("doc");
  } catch (error) {
    reportSaveFailure("outline", error);
  } finally {
    writingDoc = null;
  }
  if (saved && unsavedDoc) await flushSave();
}

export function onDocChangedInAnotherTab(apply: (doc: Doc) => void, unless: () => boolean): void {
  onStoredElsewhere("doc", async () => {
    if (unless()) return;
    try {
      const stored = await readStored("doc");
      if (!stored || unless()) return;
      const incoming = normalizeDoc(stored as Doc);
      discardPendingSave();
      apply(incoming);
    } catch (error) {
      console.error("ignoring unreadable outline from another tab", error);
    }
  });
}

export function loadPrefs(): Prefs {
  try {
    return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return { ...defaultPrefs };
  }
}

export function savePrefs(prefs: Prefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
