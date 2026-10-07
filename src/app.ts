import { Doc, ItemId, ROOT, ViewFilter, ancestors } from "./model";
import { Caret, History } from "./store";
import { discardPendingSave, flushSave, loadDoc, loadPrefs, onDocChangedInAnotherTab, onSaveFailed, saveDocSoon } from "./storage";
import { SearchResult } from "./search";
import { welcomeDoc } from "./welcome";
import { enableBulletHandles } from "./bullets";
import { bindEditorEvents, caretNow } from "./editing";
import { zoomFromHash, zoomTo } from "./navigation";
import { render } from "./render";
import { applyAppearance, bindChrome, bindGlobalKeys, bindItemMenu, openItemMenu, toast } from "./chrome";

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const ui = {
  crumbs: $("crumbs"),
  title: $("title"),
  titleNote: $("title-note"),
  tree: $<HTMLUListElement>("tree"),
  addItem: $<HTMLButtonElement>("add-item"),
  search: $<HTMLInputElement>("search"),
  searchSummary: $("search-summary"),
  menu: $("menu"),
  completedSwitch: $("completed-switch"),
  importFile: $<HTMLInputElement>("import-file"),
  toolbar: $("toolbar"),
  help: $<HTMLDialogElement>("help"),
  helpGrid: $("help-grid"),
  toast: $("toast"),
};

export const state = {
  history: new History(loadDoc() ?? welcomeDoc()),
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
  bindGlobalKeys();
  bindItemMenu();
  enableBulletHandles(ui.tree, {
    doc,
    zoomInto: (id) => zoomTo(id),
    move: (next, id) => commitAndRender(next, { id, offset: 0, selectNone: true }),
    openMenu: openItemMenu,
  });
  onDocChangedInAnotherTab((incoming) => {
    const caret = caretNow();
    discardPendingSave();
    state.history.replaceFromElsewhere(incoming);
    if (!incoming.items[state.zoom]) zoomTo(ROOT);
    else render(caret && incoming.items[caret.id] ? caret : null);
  });
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushSave());
  onSaveFailed(() => toast("Could not save: browser storage is full. Export a backup from the menu."));
  render(null);
  saveDocSoon(doc());
  navigator.storage?.persist?.().catch(() => undefined);
}

// ---- changing the document ------------------------------------------------

export interface Focus extends Caret {
  selectNone?: boolean;
}

export function commit(next: Doc, typingKey: string | null = null, caretBefore = caretNow()): void {
  state.history.commit(next, caretBefore, typingKey);
  saveDocSoon(next);
}

export function commitAndRender(next: Doc, focus: Focus | null): void {
  if (next === doc()) return;
  commit(next);
  render(focus);
}

export function undo(): void {
  const caret = state.history.undo(caretNow());
  if (caret === undefined) return;
  afterHistoryJump(caret);
}

export function redo(): void {
  const caret = state.history.redo(caretNow());
  if (caret === undefined) return;
  afterHistoryJump(caret);
}

function afterHistoryJump(caret: Caret | null): void {
  saveDocSoon(doc());
  if (caret && !doc().items[caret.id]) caret = null;
  if (!doc().items[state.zoom]) zoomTo(ROOT, caret && isUnder(caret.id, ROOT) ? caret : null);
  else if (caret && !isOnPage(caret.id)) zoomTo(doc().items[caret.id].parent ?? ROOT, caret);
  else render(caret);
}

export function isUnder(id: ItemId, top: ItemId): boolean {
  return id === top || ancestors(doc(), id).includes(top);
}

function isOnPage(id: ItemId): boolean {
  return isUnder(id, state.zoom);
}

