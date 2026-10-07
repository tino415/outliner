import { Doc, ItemId, ROOT, ViewFilter, isDescendant } from "./model";
import { Caret, History } from "./store";
import { flushSave, loadDoc, loadPrefs, onDocChangedInAnotherTab, onSaveFailed, saveDocSoon } from "./storage";
import { SearchResult } from "./search";
import { welcomeDoc } from "./welcome";
import { enableBulletHandles } from "./bullets";
import { bindEditorEvents, caretNow } from "./editing";
import { zoomFromHash, zoomTo } from "./navigation";
import { FocusRequest, flashRow, render, rowShowsTypedText } from "./render";
import { applyAppearance, bindChrome, openItemMenu, toast } from "./chrome";
import { startSync, syncedDoc } from "./syncing";
import { enableRowSwipes } from "./gestures";

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const ui = {
  crumbs: $("crumbs"),
  title: $("title"),
  titleNote: $("title-note"),
  tree: $<HTMLUListElement>("tree"),
  addItem: $<HTMLButtonElement>("add-item"),
  search: $<HTMLInputElement>("search"),
  searchSummary: $("search-summary"),
  columnsHead: $("columns-head"),
  menu: $("menu"),
  completedSwitch: $("completed-switch"),
  importFile: $<HTMLInputElement>("import-file"),
  toolbar: $("toolbar"),
  help: $<HTMLDialogElement>("help"),
  helpGrid: $("help-grid"),
  toast: $("toast"),
};

export const state = {
  history: new History(syncedDoc() ?? loadDoc() ?? welcomeDoc()),
  prefs: loadPrefs(),
  zoom: ROOT as ItemId,
  query: "",
  results: null as SearchResult | null,
  openNotes: new Set<ItemId>(),
  selection: null as { anchor: ItemId; head: ItemId } | null,
  recent: [] as ItemId[],
  keptInResults: new Set<ItemId>(),
};

export const doc = (): Doc => state.history.doc;
export const filter = (): ViewFilter => ({ showCompleted: state.prefs.showCompleted });

export function start(): void {
  state.zoom = zoomFromHash();
  applyAppearance();
  bindEditorEvents();
  bindChrome();
  enableBulletHandles(ui.tree, {
    doc,
    zoomInto: (id) => zoomTo(id),
    move: (next, id) => {
      commitAndRender(next, null);
      flashRow(id);
    },
    openMenu: openItemMenu,
  });
  enableRowSwipes(ui.tree);
  onDocChangedInAnotherTab((incoming) => {
    const caret = caretNow();
    state.history.replaceFromElsewhere(incoming);
    if (!incoming.items[state.zoom]) zoomTo(ROOT);
    else render(caret);
  });
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushSave());
  onSaveFailed(() => toast("Could not save: browser storage is full. Export a backup from the menu."));
  render(null);
  saveDocSoon(doc());
  navigator.storage?.persist?.().catch(() => undefined);
  startSync();
}

// ---- changing the document ------------------------------------------------

export type Focus = Caret;

export function commitAndRender(next: Doc, focus: FocusRequest): void {
  if (next === doc()) return;
  commit(next);
  render(focus);
}

/**
 * For edits the DOM already shows (typing, wrapping a selection in markers):
 * no render, but the row and the search results have to know.
 */
export function commitShownEdit(next: Doc, id: ItemId, caretBefore: Caret | null, typingKey: string | null = null): void {
  commit(next, typingKey, caretBefore);
  rowShowsTypedText(id);
  if (state.query) state.keptInResults.add(id);
}

function commit(next: Doc, typingKey: string | null = null, caretBefore = caretNow()): void {
  const before = doc();
  state.history.commit(next, caretBefore, typingKey);
  saveDocSoon(next);
  changedHere(before, next);
}

type ChangeListener = (before: Doc, after: Doc) => void;
const listeners: ChangeListener[] = [];

/** Every change made in this tab, typing, undo and redo included; not changes that came from elsewhere. */
export function onChangeHere(listener: ChangeListener): void {
  listeners.push(listener);
}

function changedHere(before: Doc, after: Doc): void {
  for (const listener of listeners) listener(before, after);
}

export function undo(): void {
  const before = doc();
  afterHistoryJump(before, state.history.undo(caretNow()));
}

export function redo(): void {
  const before = doc();
  afterHistoryJump(before, state.history.redo(caretNow()));
}

function afterHistoryJump(before: Doc, caret: Caret | null | undefined): void {
  if (caret === undefined) return;
  saveDocSoon(doc());
  changedHere(before, doc());
  if (caret && !doc().items[caret.id]) caret = null;
  if (!doc().items[state.zoom]) zoomTo(ROOT, caret);
  else if (caret && !isUnder(caret.id, state.zoom)) zoomTo(doc().items[caret.id].parent ?? ROOT, caret);
  else render(caret);
}

export function isUnder(id: ItemId, top: ItemId): boolean {
  return id === top || isDescendant(doc(), id, top);
}
