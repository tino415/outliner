import { bindAttachments } from "./attachments";
import { pluginsMayHaveChanged } from "./pluginHost";
import { Doc, ItemId, ROOT, ViewFilter, isDescendant, liftNoteProperties, withPrivateIds } from "./model";
import { Caret, History } from "./store";
import { flushSave, loadDoc, loadPrefs, onDocChangedInAnotherTab, onSaveFailed, saveDocSoon } from "./storage";
import { SearchResult } from "./search";
import { welcomeDoc } from "./welcome";
import { enableBulletHandles } from "./bullets";
import { bindEditorEvents, caretNow } from "./editing";
import { zoomFromHash, zoomTo } from "./navigation";
import { FocusRequest, flashRow, isMirroredOnScreen, render, rowShowsTypedText } from "./render";
import { applyAppearance, bindChrome, openItemMenu, toast } from "./chrome";
import { afterFirstSync, isSyncing, startSync, syncEndpoint, syncedDoc } from "./syncing";
import { enableRowSwipes } from "./gestures";
import { bindCompletion } from "./completion";
import { bindCapture, captureFromAddress } from "./capturing";
import { today } from "./dates";
import { liveMirrorTarget } from "./mirrors";

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const ui = {
  page: $("page"),
  crumbs: $("crumbs"),
  title: $("title"),
  titleProps: $("title-props"),
  titleNote: $("title-note"),
  tree: $<HTMLUListElement>("tree"),
  board: $("board"),
  agenda: $("agenda"),
  addItem: $<HTMLButtonElement>("add-item"),
  search: $<HTMLInputElement>("search"),
  searchSummary: $("search-summary"),
  columnsHead: $("columns-head"),
  backlinks: $("backlinks"),
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
  bindCompletion(doc);
  bindChrome();
  enableBulletHandles(ui.tree, {
    doc,
    zoomInto: (id) => zoomTo(liveMirrorTarget(doc(), id) ?? id),
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
  }, isSyncing);
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushSave());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && renderIfTheDayChanged());
  window.addEventListener("focus", renderIfTheDayChanged);
  onSaveFailed(() => toast("Could not save: browser storage is full. Export a backup from the menu."));
  render(null);
  saveDocSoon(doc());
  navigator.storage?.persist?.().catch(() => undefined);
  startSync();
  afterFirstSync(liftPropertiesWrittenInNotes);
  bindAttachments(syncEndpoint);
  onChangeHere(pluginsMayHaveChanged);
  bindCapture();
  captureFromAddress();
}

let dayShown = today();

/** Date chips say "today" and "tomorrow"; a page left open overnight says them of the new day once it is looked at again. */
function renderIfTheDayChanged(): void {
  if (today() === dayShown) return;
  dayShown = today();
  render(caretNow());
}

/** Properties written as `:key: value` note lines, before they had a field of their own or by an older build, become properties (doc/adr/0032). */
function liftPropertiesWrittenInNotes(): void {
  const focused = document.activeElement;
  const typingIn = focused instanceof HTMLElement && focused.classList.contains("note") ? focused.dataset.id : undefined;
  const lifted = liftNoteProperties(doc(), Object.keys(doc().items).filter((id) => id !== typingIn));
  if (lifted !== doc()) commitAndRender(lifted, null);
}

// ---- changing the document ------------------------------------------------

export type Focus = Caret;

export function commitAndRender(next: Doc, focus: FocusRequest): void {
  if (next === doc()) return;
  const renamed = commit(next);
  render(renamed.size === 0 ? focus : focusAfterRenaming(focus, renamed));
}

function focusAfterRenaming(focus: FocusRequest, renamed: Map<ItemId, ItemId>): FocusRequest {
  if (focus === null) return null;
  return [focus].flat().map((each) => ({ ...each, id: renamed.get(each.id) ?? each.id }));
}

/**
 * For edits the DOM already shows (typing, wrapping a selection in markers):
 * no render, but the row and the search results have to know.
 */
export function commitShownEdit(next: Doc, id: ItemId, caretBefore: Caret | null, typingKey: string | null = null): void {
  const renamed = commit(next, typingKey, caretBefore);
  rowShowsTypedText(id);
  if (renamed.size > 0 || isMirroredOnScreen(id)) render(caretNow());
  if (state.query) state.keptInResults.add(id);
}

function commit(next: Doc, typingKey: string | null = null, caretBefore = caretNow()): Map<ItemId, ItemId> {
  return commitAs("edit", next, (named) => state.history.commit(named, caretBefore, typingKey));
}

/** A plugin's answer to an event joins the undo step of the change that fired it, if nothing came in between; returns the history's version after it. */
export function commitFromEventHandler(next: Doc, joining: number): number {
  if (next === doc()) return state.history.version;
  commitAs("event handler", next, (named) => state.history.commitJoining(named, joining));
  render(caretNow());
  return state.history.version;
}

/** Commits `next` with the ids private items need (doc/adr/0029); returns the items that were renamed. */
function commitAs(origin: ChangeOrigin, next: Doc, record: (named: Doc) => void): Map<ItemId, ItemId> {
  const before = doc();
  const { doc: named, renamed } = withPrivateIds(next);
  record(named);
  saveDocSoon(named);
  changedHere(before, named, origin);
  if (renamed.has(state.zoom)) state.zoom = renamed.get(state.zoom)!;
  return renamed;
}

export type ChangeOrigin = "edit" | "history" | "event handler";
type ChangeListener = (before: Doc, after: Doc, origin: ChangeOrigin) => void;
const listeners: ChangeListener[] = [];

/** Every change made in this tab, typing, undo and redo included; not changes that came from elsewhere. */
export function onChangeHere(listener: ChangeListener): void {
  listeners.push(listener);
}

function changedHere(before: Doc, after: Doc, origin: ChangeOrigin): void {
  for (const listener of listeners) listener(before, after, origin);
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
  changedHere(before, doc(), "history");
  if (caret && !doc().items[caret.id]) caret = null;
  if (!doc().items[state.zoom]) zoomTo(ROOT, caret);
  else if (caret && !isUnder(caret.id, state.zoom)) zoomTo(doc().items[caret.id].parent ?? ROOT, caret);
  else render(caret);
}

export function isUnder(id: ItemId, top: ItemId): boolean {
  return id === top || isDescendant(doc(), id, top);
}
