import { bindAttachments } from "./attachments";
import { pluginsMayHaveChanged } from "./pluginHost";
import { Doc, ItemId, ROOT, ViewFilter, isDescendant, isKept, liftNoteProperties, liftTags, withSettingsItems, withPrivateIds } from "./model";
import { Caret, History } from "./store";
import { loaded } from "./loaded";
import { onSaveFailed, onStorageNearlyFull } from "./stateStore";
import { flushSave, loadDoc, loadPrefs, onDocChangedInAnotherTab, saveDocSoon } from "./storage";
import { SearchResult } from "./search";
import { welcomeDoc } from "./welcome";
import { DropPlaces, enableBulletHandles, treeDrops } from "./bullets";
import { sidewaysDrops, sidewaysShown } from "./sideways";
import { bindEditorEvents, caretNow } from "./editing";
import { leaveLinkToMissingItem, zoomFromHash, zoomTo } from "./navigation";
import { FocusRequest, flashRow, isMirroredOnScreen, render, rowShowsTypedText } from "./render";
import { problemWith } from "./checks";
import { applyAppearance, bindChrome, openItemMenu, toast } from "./chrome";
import { afterFirstSync, isSyncing, startSync, syncEndpoint, syncedDoc } from "./syncing";
import { enableRowSwipes } from "./gestures";
import { enableColumnScroll } from "./columnFit";
import { bindCompletion } from "./completion";
import { bindCapture, captureFromAddress } from "./capturing";
import { today } from "./dates";
import { liveMirrorTarget } from "./mirrors";
import { boardDrops } from "./board";
import { keepBookmarksItem, refusedAsKept } from "./bookmarking";

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
  history: new History(syncedDoc() ?? loadDoc(loaded.doc) ?? welcomeDoc()),
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
  const bullets = {
    doc,
    zoomInto: (id: ItemId) => zoomTo(liveMirrorTarget(doc(), id) ?? id),
    move: (next: Doc, id: ItemId) => {
      if (isKept(id) && next === doc()) return void refusedAsKept([id]);
      commitAndRender(next, null);
      flashRow(id);
    },
    openMenu: openItemMenu,
  };
  enableBulletHandles(ui.tree, bullets, dropsOfShownView(treeDrops(ui.tree)));
  enableBulletHandles(ui.board, bullets, boardDrops);
  enableRowSwipes(ui.tree);
  enableColumnScroll(ui.page, ui.columnsHead);
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
  onSaveFailed((what) => toast(`Could not save the ${what}: browser storage is full. Export a backup from the menu.`));
  onStorageNearlyFull(() => toast("Browser storage is over 80% full. Export a backup from the menu and free some space.", undefined, { stays: true }));
  render(null);
  saveDocSoon(doc());
  navigator.storage?.persist?.().catch(() => undefined);
  startSync();
  keepBookmarksItem();
  afterFirstSync(liftPropertiesWrittenInNotes);
  afterFirstSync(liftTagsWrittenInText);
  afterFirstSync(leaveLinkToMissingItem);
  bindAttachments(syncEndpoint);
  onChangeHere(pluginsMayHaveChanged);
  bindCapture();
  captureFromAddress();
}

/** The tree's rows land by the outline's rules, or by the node's when the page is drawn as a tree. */
function dropsOfShownView(outline: DropPlaces): DropPlaces {
  const shown = () => (sidewaysShown() ? sidewaysDrops : outline);
  return {
    dropAt: (x, y, dragged, doc) => shown().dropAt(x, y, dragged, doc),
    scrollToward: (x, y) => shown().scrollToward(x, y),
  };
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
  const lifted = liftNoteProperties(doc(), Object.keys(doc().items).filter((id) => id !== typingIn), (id, key, value) => problemWith(doc(), id, key, value) !== null);
  if (lifted !== doc()) commitAndRender(lifted, null);
}

/** Tags written in titles and notes, before they had a property or by an older build, become the `tags` property. */
function liftTagsWrittenInText(): void {
  const focused = document.activeElement;
  const typingIn = focused instanceof HTMLElement && focused.dataset.id ? focused.dataset.id : undefined;
  const lifted = liftTags(doc(), Object.keys(doc().items).filter((id) => id !== typingIn));
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
  state.history.keep(withSettingsItems(doc()));
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
