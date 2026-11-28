import { attachmentTitle } from "./attachmentTitle";
import { Item, ItemId, ROOT, ancestors, isDescendant, shownChildren } from "./model";
import { Cell, Column, Summary, cellsUnder, columnCells, declaredColumns, formulaIn, inferredColumns } from "./properties";
import { propertyChipsHtml } from "./propertyChips";
import { isChecksItem, problemInCheckRow, problemsOfItem } from "./checks";
import { isSettingsItem } from "./insertLists";
import { escape, itemLabel, renderItemText, renderNote, shortLabel } from "./inline";
import { isSealed } from "./notes";
import { countLabel } from "./counts";
import { pluginsMayHaveChanged } from "./pluginHost";
import { boardShown, renderBoard } from "./board";
import { select } from "./caret";
import { Focus, doc, filter, state, ui } from "./app";
import { paintSelection } from "./selection";
import { backlinks } from "./references";
import { pathOf } from "./search";
import { searchResults } from "./navigation";
import { renderMenuState } from "./chrome";
import { today } from "./dates";
import { agendaShown, renderAgenda } from "./agenda";
import { queryViewShown, renderQueryView } from "./queryView";
import { followShortcutSettings } from "./keys";
import { isMirror, liveMirrorTarget, mirrorBulletTitle, mirrorTextHtml, mirroredChildrenHtml } from "./mirrors";
import { fitColumns } from "./columnFit";
import { placeSidewaysPage, sidewaysShown } from "./sideways";

/** Caret offset meaning "the end of the text, whatever its length". */
export const END = Number.POSITIVE_INFINITY;

/** Where the caret should go after a render: the first candidate still on screen. */
export type FocusRequest = Focus | Focus[] | null;

/** Date chips say "today" and "tomorrow", so a row shows the day it was rendered on. */
let dayRendered = today();

export function render(request: FocusRequest): void {
  const candidates = request === null ? [] : [request].flat();
  pluginsMayHaveChanged();
  followShortcutSettings(doc());
  state.results = searchResults(candidates[0] ?? null);
  const started = performance.now();
  formulaCellOf = null;
  dayRendered = today();
  columns = columnView();
  renderCrumbs();
  renderHead();
  renderColumnsHead();
  const agenda = agendaShown();
  const queryView = !agenda && queryViewShown();
  const listing = agenda || queryView;
  const board = !listing && boardShown();
  const sideways = !listing && !board && sidewaysShown();
  ui.agenda.hidden = !listing;
  ui.board.hidden = !board;
  ui.page.classList.toggle("with-agenda", agenda);
  ui.page.classList.toggle("with-query", queryView);
  ui.page.classList.toggle("with-board", board);
  ui.page.classList.toggle("with-sideways", sideways);
  ui.tree.classList.toggle("sideways", sideways);
  ui.page.classList.toggle("with-searching", board && Boolean(state.results));
  ui.tree.hidden = board || listing;
  if (agenda) renderAgenda();
  else if (queryView) renderQueryView();
  else if (board) renderBoard();
  else renderTree();
  if (!listing) ui.agenda.replaceChildren();
  if (board || listing) ui.addItem.hidden = ui.columnsHead.hidden = true;
  if (agenda) document.title = "Agenda · Outliner";
  renderSearchSummary();
  renderMenuState();
  highlightMatches();
  paintSelection();
  placeSidewaysPage(sideways);
  const focus = candidates.find((candidate) => editorFor(candidate.id, candidate.inNote ? "note" : "text"));
  if (focus) focusCaret(focus);
  performance.measure("render", { start: started });
}

function renderCrumbs(): void {
  const trail = agendaShown() ? [ROOT] : ancestors(doc(), state.zoom);
  ui.crumbs.classList.toggle("at-home", trail.length === 0);
  if (trail.length === 0) {
    ui.crumbs.innerHTML = `<span class="brand"><span class="brand-dot"></span>Outliner</span>`;
    return;
  }
  const parts = trail.map((id) =>
    id === ROOT
      ? `<a class="crumb home" href="#/" aria-label="Home"><svg viewBox="0 0 20 20"><path d="M3.5 9.5L10 4l6.5 5.5M5.5 8v7.5h9V8" /></svg></a>`
      : `<a class="crumb" href="#/${encodeURIComponent(id)}">${escape(itemLabel(doc().items[id].text, 28))}</a>`,
  );
  ui.crumbs.innerHTML = parts.join(`<span class="crumb-sep" aria-hidden="true">/</span>`);
}

function renderHead(): void {
  const item = doc().items[state.zoom];
  ui.title.dataset.id = item.id;
  ui.titleNote.dataset.id = item.id;
  if (document.activeElement !== ui.title || ui.title.textContent !== item.text) ui.title.innerHTML = renderItemText(item.text);
  ui.title.classList.toggle("empty", item.text === "");
  ui.titleProps.dataset.id = item.id;
  ui.titleProps.innerHTML = propertyChipsHtml(item, undefined, ownFormulaResults(item.id), problemsOfItem(doc(), item.id));
  ui.titleNote.contentEditable = isSealed(item.note) ? "false" : "plaintext-only";
  if (document.activeElement !== ui.titleNote || ui.titleNote.textContent !== item.note) ui.titleNote.innerHTML = renderNote(item.note);
  ui.titleNote.hidden = item.note === "" && !state.openNotes.has(item.id);
  document.title = titleFor(item.id);
  renderBacklinks();
}

function renderBacklinks(): void {
  const linking = state.zoom === ROOT ? [] : backlinks(doc(), state.zoom);
  ui.backlinks.hidden = linking.length === 0;
  ui.backlinks.innerHTML =
    `<span class="backlinks-label">Linked from</span>` +
    linking.map((id) => `<a href="#/${encodeURIComponent(id)}" title="${escape(pathOf(doc(), id).join(" / "))}">${escape(itemLabel(doc().items[id].text, 40))}</a>`).join("");
}

// ---- the column view (doc/adr/0017) --------------------------------------------------------

interface ColumnView {
  columns: Column[];
  cells: Map<ItemId, Map<string, Cell>>;
}

let columns: ColumnView | null = null;

export function columnViewShown(): boolean {
  if (sidewaysShown()) return false;
  const declared = declaredColumns(doc(), state.zoom);
  return state.prefs.columnPages[state.zoom] ?? declared !== null;
}

function columnView(): ColumnView | null {
  if (!columnViewShown()) return null;
  const chosen = declaredColumns(doc(), state.zoom) ?? inferredColumns(doc(), state.zoom);
  return { columns: chosen, cells: columnCells(doc(), state.zoom, chosen, filter()) };
}

const SUMMARY_LABELS: Record<Summary, string> = { sum: "total", min: "least", max: "most", mean: "average" };

function summaryTitle(column: Column, after = ""): string {
  return column.summary ? ` title="${SUMMARY_LABELS[column.summary]}${after}"` : "";
}

function renderColumnsHead(): void {
  const head = ui.columnsHead;
  head.hidden = !columns;
  ui.tree.classList.toggle("with-columns", Boolean(columns?.columns.length));
  if (columns) head.innerHTML = columnsHeadHtml(columns);
  fitColumns(columns, state.zoom);
}

function columnsHeadHtml(view: ColumnView): string {
  if (view.columns.length === 0) return `<p class="columns-empty">No properties on this page yet. Add one with Set a property… (Ctrl-J P or the item menu).</p>`;
  const totals = view.cells.get(state.zoom)!;
  return (
    `<div class="cells">` +
    view.columns
      .map(
        (column) =>
          `<div class="cell head"><span class="column-name">${escape(column.key)}</span>` +
          `<span class="column-total"${summaryTitle(column)}>${escape(totals.get(column.key)?.text ?? "")}</span></div>`,
      )
      .join("") +
    `</div>`
  );
}

// ---- "=…" values of an item's own (doc/adr/0022) -------------------------------------------

let formulaCellOf: ((id: ItemId, key: string) => Cell | null) | null = null;

/** The results of an item's "=…" values, computed when a row asks, with only what they read; "–" when there is nothing to compute. */
export function ownFormulaResults(id: ItemId): Map<string, Cell> {
  const properties = doc().items[id].properties;
  const keys = Object.keys(properties).filter((key) => formulaIn(properties[key]) !== null);
  if (keys.length === 0) return new Map();
  formulaCellOf ??= cellsUnder(doc(), state.zoom, declaredColumns(doc(), state.zoom) ?? [], filter());
  return new Map(keys.map((key) => [key, formulaCellOf!(id, key) ?? { text: "–", rolled: false, computed: true }]));
}

function keysShownAsColumns(): Set<string> {
  return new Set(columns?.columns.map((column) => column.key) ?? []);
}

function cellsOf(id: ItemId): string {
  if (!columns?.columns.length) return "";
  const row = columns.cells.get(id);
  return (
    `<div class="cells">` +
    columns.columns
      .map((column) => {
        const cell = row?.get(column.key);
        return `<button type="button" tabindex="-1" class="${cellClasses(cell)}" data-key="${escape(column.key)}"${cellTitle(cell, column, doc().items[id].properties[column.key])}>${escape(cell?.text ?? "")}</button>`;
      })
      .join("") +
    `</div>`
  );
}

function cellClasses(cell: Cell | undefined): string {
  return ["cell", cell?.rolled && "rolled", cell?.computed && "computed", cell?.error && "error"].filter(Boolean).join(" ");
}

function cellTitle(cell: Cell | undefined, column: Column, ownValue: string | undefined): string {
  if (cell?.error) return ` title="${escape(`${cell.error}. See ⋯ → Formula help`)}"`;
  if (cell?.computed) return ` title="Computed: ${escape(formulaIn(ownValue) !== null ? ownValue!.trim() : (column.formulaSource ?? ""))}"`;
  if (cell?.rolled) return summaryTitle(column, " of the items below");
  return "";
}

export function titleFor(id: ItemId): string {
  const text = doc().items[id].text.trim();
  return text ? `${shortLabel(text, 40)} · Outliner` : "Outliner";
}

/*
 * Rows are kept between renders, keyed by item id. Items are immutable, so a
 * row whose item object and display state are unchanged is reused as is;
 * only changed rows are rebuilt and only moved rows are moved.
 */
interface RenderedRow {
  item: Item;
  state: string;
  noteOpen: boolean;
  li: HTMLLIElement;
}

const renderedRows = new Map<ItemId, RenderedRow>();
let rowsSeen = new Set<ItemId>();

/** Typing changes a row's DOM without a render; the row now shows the current item. */
export function rowShowsTypedText(id: ItemId): void {
  const rendered = renderedRows.get(id);
  if (rendered) rendered.item = doc().items[id];
}

/** Opening a note un-hides it without a render; the row now shows it open. */
export function rowShowsOpenedNote(id: ItemId): void {
  const rendered = renderedRows.get(id);
  if (rendered) rendered.noteOpen = true;
}

/** Typing skips the render, so a mirror on screen of the typed item, or of an item above it, would show the old text. */
export function isMirroredOnScreen(id: ItemId): boolean {
  return [...shownOutline().querySelectorAll<HTMLElement>(".item.mirror")].some((mirror) => {
    const target = liveMirrorTarget(doc(), mirror.dataset.id!);
    return target !== null && (target === id || isDescendant(doc(), id, target));
  });
}

function renderTree(): void {
  const top = shownChildrenOf(state.zoom);
  rowsSeen = new Set();
  placeChildren(ui.tree, top.map(renderItem));
  for (const id of renderedRows.keys()) if (!rowsSeen.has(id)) renderedRows.delete(id);
  ui.tree.classList.toggle("searching", Boolean(state.results));
  const isEmpty = top.length === 0;
  ui.addItem.hidden = Boolean(state.results) || (sidewaysShown() && !isEmpty);
  ui.addItem.classList.toggle("prominent", isEmpty);
}

function shownChildrenOf(id: ItemId): ItemId[] {
  return inResults(shownChildren(doc(), id, filter()));
}

export function inResults(children: ItemId[]): ItemId[] {
  const results = state.results;
  return results ? children.filter((child) => results.shown.has(child)) : children;
}

function renderItem(id: ItemId): HTMLLIElement {
  rowsSeen.add(id);
  const item = doc().items[id];
  const shown = shownChildren(doc(), id, filter());
  const children = inResults(shown);
  const hasChildren = shown.length > 0;
  const expanded = hasChildren && (state.results ? children.length > 0 : !item.collapsed);
  const attachment = attachmentTitle(item.text);
  const foldedPicture = attachment?.image === true && item.collapsed;
  const noteOpen = item.note !== "" || state.openNotes.has(id);
  const cells = cellsOf(id);
  const results = ownFormulaResults(id);
  const mirror = isMirror(doc(), id) ? mirrorTextHtml(doc(), id) + mirroredChildrenHtml(doc(), id, filter()) : null;
  const foldedCount = hasChildren && !expanded && mirror === null ? foldedCountLabel(item, shown) : "";
  const breaking = problemsOfItem(doc(), id);
  const rowProblem = problemInCheckRow(doc(), id);
  const displayState = `${dayRendered} ${hasChildren} ${expanded} ${foldedCount} ${cells} ${[...results].map(([key, cell]) => `${key}=${cell.text}${cell.error ?? ""}`).join(" ")} ${mirror ?? ""} ${[...breaking].join("|")} ${rowProblem}`;

  let rendered = renderedRows.get(id);
  if (!rendered || rendered.item !== item || rendered.state !== displayState || rendered.noteOpen !== noteOpen) {
    const li = rendered?.li ?? createItemElement(id);
    li.querySelector(":scope > .row")?.remove();
    const toggleOpen = attachment?.image && !hasChildren ? !item.collapsed : expanded;
    li.prepend(mirror === null ? createRow(item, toggleOpen, noteOpen, cells, results, foldedCount, breaking, rowProblem, attachment !== null) : createMirrorRow(item, expanded, noteOpen, cells, mirror));
    rendered = { item, state: displayState, noteOpen, li };
    renderedRows.set(id, rendered);
  }

  const li = rendered.li;
  li.classList.toggle("completed", item.completed);
  li.classList.toggle("mirror", mirror !== null);
  li.classList.toggle("checks", isChecksItem(item));
  li.classList.toggle("settings-item", isSettingsItem(item));
  li.classList.toggle("check-bad", rowProblem !== "");
  li.classList.toggle("has-children", hasChildren);
  li.classList.toggle("folded", hasChildren && !expanded);
  li.classList.toggle("attachment", mirror === null && attachment !== null);
  li.classList.toggle("image-child", mirror === null && attachment?.image === true);
  li.classList.toggle("picture-folded", mirror === null && foldedPicture);
  li.classList.toggle("match", Boolean(state.results?.matches.has(id)));
  if (hasChildren) li.setAttribute("aria-expanded", String(expanded));
  else if (attachment?.image) li.setAttribute("aria-expanded", String(!foldedPicture));
  else li.removeAttribute("aria-expanded");

  let list = li.querySelector<HTMLUListElement>(":scope > .children");
  if (expanded) {
    if (!list) {
      list = document.createElement("ul");
      list.className = "children";
      list.setAttribute("role", "group");
      li.append(list);
    }
    placeChildren(list, children.map(renderItem));
  } else {
    list?.remove();
  }
  return li;
}

/** A node of the tree view shows the count in its round fold button, which has room for a number only. */
function foldedCountLabel(item: Item, shown: ItemId[]): string {
  return sidewaysShown() ? String(shown.length) : countLabel(doc(), item.children);
}

function createItemElement(id: ItemId): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "item";
  li.dataset.id = id;
  li.setAttribute("role", "treeitem");
  return li;
}

function createRow(item: Item, expanded: boolean, noteOpen: boolean, cells: string, results: Map<string, Cell>, foldedCount: string, breaking: Map<string, string>, rowProblem: string, attachment: boolean): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML =
    `<button class="toggle" type="button" tabindex="-1" aria-label="${expanded ? "Collapse" : "Expand"}"><svg viewBox="0 0 12 12"><path d="M4.5 3l3 3-3 3"/></svg></button>` +
    `<button class="bullet" type="button" tabindex="-1" aria-label="Zoom in" title="Zoom in · drag to move">${attachment ? `<span class="clip">📎</span>` : `<span class="dot"></span>`}</button>` +
    `<div class="body">` +
    `<div class="text${item.text === "" ? " empty" : ""}" contenteditable="plaintext-only" spellcheck="true" data-id="${item.id}"${rowProblem ? ` title="${escape(rowProblem)}"` : ""}>${renderItemText(item.text)}</div>` +
    (foldedCount === "" ? "" : `<span class="fold-count" title="Direct children">${escape(foldedCount)}</span>`) +
    `<button class="prop-add" type="button" tabindex="-1" aria-label="Add…" title="Add…">+</button>` +
    propertyChipsHtml(item, keysShownAsColumns(), results, breaking) +
    `<div class="note" contenteditable="${isSealed(item.note) ? "false" : "plaintext-only"}" spellcheck="true" data-id="${item.id}"${noteOpen ? "" : " hidden"}>${renderNote(item.note)}</div>` +
    `</div>` +
    cells;
  return row;
}

function createMirrorRow(item: Item, expanded: boolean, noteOpen: boolean, cells: string, mirror: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML =
    `<button class="toggle" type="button" tabindex="-1" aria-label="${expanded ? "Collapse" : "Expand"}"><svg viewBox="0 0 12 12"><path d="M4.5 3l3 3-3 3"/></svg></button>` +
    `<button class="bullet" type="button" tabindex="-1" aria-label="Go to the mirrored item" title="${escape(mirrorBulletTitle(doc(), item.id))}"><span class="dot"></span></button>` +
    `<div class="body">` +
    mirror +
    `<div class="note" contenteditable="${isSealed(item.note) ? "false" : "plaintext-only"}" spellcheck="true" data-id="${item.id}"${noteOpen ? "" : " hidden"}>${renderNote(item.note)}</div>` +
    `</div>` +
    cells;
  return row;
}

/** Makes `parent`'s element children exactly `nodes`, moving only what is out of place. */
function placeChildren(parent: Element, nodes: Element[]): void {
  nodes.forEach((node, index) => {
    if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] ?? null);
  });
  while (parent.children.length > nodes.length) parent.lastElementChild!.remove();
}

function renderSearchSummary(): void {
  const results = state.results;
  ui.searchSummary.hidden = !results;
  if (!results) return;
  const count = results.matches.size;
  if (results.elsewhere) {
    const title = doc().items[results.elsewhere].text || "Untitled";
    ui.searchSummary.innerHTML =
      `<span>Not on this page: <strong>${escape(title)}</strong></span>` +
      `<button type="button" class="link-button" data-action="open-named">Open</button>` +
      `<button type="button" class="link-button" data-action="clear-search">Clear</button>`;
    return;
  }
  ui.searchSummary.innerHTML =
    `<span>${count === 0 ? "No matches" : count === 1 ? "1 match" : `${count} matches`} for <strong>${escape(state.query.trim())}</strong></span>` +
    `<button type="button" class="link-button" data-action="clear-search">Clear</button>`;
}

function highlightMatches(): void {
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightClass = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!registry || !HighlightClass) return;
  registry.delete("search");
  if (!state.results || state.results.terms.length === 0) return;
  const ranges: Range[] = [];
  for (const editor of shownOutline().querySelectorAll<HTMLElement>(".match > .row .text, .match > .row .note, .match > .board-column-head .text")) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const haystack = node.data.toLowerCase();
      for (const term of state.results.terms) {
        for (let at = haystack.indexOf(term); at !== -1; at = haystack.indexOf(term, at + term.length)) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + term.length);
          ranges.push(range);
        }
      }
    }
  }
  registry.set("search", new HighlightClass(...ranges));
}

/** Text editors of the visible rows, in reading order: the order arrow keys and selection follow. */
/** The outline as it is shown: the agenda, the tree, or the board when the page is one. */
export function shownOutline(): HTMLElement {
  if (agendaShown() || queryViewShown()) return ui.agenda;
  return boardShown() ? ui.board : ui.tree;
}

export function treeEditors(): HTMLElement[] {
  return [...shownOutline().querySelectorAll<HTMLElement>(".text[data-id]")];
}

export function itemElementFor(id: ItemId): HTMLElement | null {
  return shownOutline().querySelector<HTMLElement>(`.item[data-id="${CSS.escape(id)}"]`);
}

export function editorFor(id: ItemId, part: "text" | "note"): HTMLElement | null {
  if (id === state.zoom) return part === "text" ? ui.title : ui.titleNote;
  return itemElementFor(id)?.querySelector<HTMLElement>(`:scope > .row .${part}`) ?? null;
}

export function textEditorFor(id: ItemId): HTMLElement | null {
  return editorFor(id, "text");
}

export function replayAnimation(element: Element, className: string): void {
  element.classList.remove(className);
  void (element as HTMLElement).offsetWidth;
  element.classList.add(className);
}

export function flashRow(id: ItemId): void {
  const row = itemElementFor(id)?.querySelector(":scope > .row");
  if (row) replayAnimation(row, "flash");
}

export function focusCaret(focus: Focus): void {
  const editor = editorFor(focus.id, focus.inNote ? "note" : "text");
  if (!editor) return;
  editor.hidden = false;
  editor.focus({ preventScroll: true });
  select(editor, Math.min(focus.offset, (editor.textContent ?? "").length));
  editor.scrollIntoView({ block: "nearest" });
}

