import { Doc, ROOT } from "./model";

const DOC_KEY = "outliner-lab:doc:v1";
const PREFS_KEY = "outliner-lab:prefs:v1";

export type Theme = "system" | "light" | "dark";

export interface Prefs {
  theme: Theme;
  showCompleted: boolean;
}

const defaultPrefs: Prefs = { theme: "system", showCompleted: true };

export function loadDoc(): Doc | null {
  const raw = localStorage.getItem(DOC_KEY);
  if (!raw) return null;
  try {
    return parseDoc(raw);
  } catch (error) {
    console.error("stored outline is unreadable", error);
    return null;
  }
}

export function parseDoc(raw: string): Doc {
  const parsed = JSON.parse(raw) as Doc;
  if (!parsed?.items?.[ROOT]) throw new Error("not an outline: no root item");
  return parsed;
}

export function serializeDoc(doc: Doc): string {
  return JSON.stringify(doc);
}

let pendingSave: number | undefined;
let unsavedDoc: Doc | null = null;
let saveFailed: () => void = () => undefined;

export function onSaveFailed(handler: () => void): void {
  saveFailed = handler;
}

export function saveDocSoon(doc: Doc): void {
  unsavedDoc = doc;
  window.clearTimeout(pendingSave);
  pendingSave = window.setTimeout(flushSave, 250);
}

export function flushSave(): void {
  window.clearTimeout(pendingSave);
  if (!unsavedDoc) return;
  try {
    localStorage.setItem(DOC_KEY, serializeDoc(unsavedDoc));
    unsavedDoc = null;
  } catch (error) {
    console.error("could not save outline", error);
    saveFailed();
  }
}

export function onDocChangedInAnotherTab(apply: (doc: Doc) => void): void {
  window.addEventListener("storage", (event) => {
    if (event.key !== DOC_KEY || !event.newValue) return;
    try {
      apply(parseDoc(event.newValue));
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
