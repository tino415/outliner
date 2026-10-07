import { Item, ItemId, ROOT, ancestors, shownChildren } from "./model";
import { escape, renderInline } from "./inline";
import { select } from "./caret";
import { Focus, doc, filter, state, ui } from "./app";
import { paintSelection } from "./selection";
import { searchResults } from "./navigation";
import { renderMenuState, shortLabel } from "./chrome";

// ---- rendering ------------------------------------------------------------------

export function render(focus: Focus | null): void {
  state.results = searchResults(focus);
  const started = performance.now();
  renderCrumbs();
  renderHead();
  renderTree();
  renderSearchSummary();
  renderMenuState();
  highlightMatches();
  paintSelection();
  if (focus) focusCaret(focus);
  performance.measure("render", { start: started });
}

function renderCrumbs(): void {
  const trail = ancestors(doc(), state.zoom);
  const parts = trail.map((id) =>
    id === ROOT
      ? `<a class="crumb home" href="#/" aria-label="Home"><svg viewBox="0 0 20 20"><path d="M3.5 9.5L10 4l6.5 5.5M5.5 8v7.5h9V8" /></svg></a>`
      : `<a class="crumb" href="#/${encodeURIComponent(id)}">${escape(shortLabel(doc().items[id].text, 28)) || "Untitled"}</a>`,
  );
  ui.crumbs.innerHTML = parts.join(`<span class="crumb-sep" aria-hidden="true">/</span>`);
  ui.crumbs.classList.toggle("at-home", trail.length === 0);
  if (trail.length === 0) ui.crumbs.innerHTML = `<span class="brand"><span class="brand-dot"></span>Outliner</span>`;
}

function renderHead(): void {
  const item = doc().items[state.zoom];
  ui.title.dataset.id = item.id;
  ui.titleNote.dataset.id = item.id;
  if (document.activeElement !== ui.title || ui.title.textContent !== item.text) ui.title.innerHTML = renderInline(item.text);
  ui.title.classList.toggle("empty", item.text === "");
  if (document.activeElement !== ui.titleNote || ui.titleNote.textContent !== item.note) ui.titleNote.innerHTML = renderInline(item.note);
  ui.titleNote.hidden = item.note === "" && !state.openNotes.has(item.id);
  document.title = titleFor(item.id);
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
  li: HTMLLIElement;
}

const renderedRows = new Map<ItemId, RenderedRow>();
let rowsSeen = new Set<ItemId>();

/** Typing changes a row's DOM without a render; the row now shows the current item. */
export function rowShowsTypedText(id: ItemId): void {
  const rendered = renderedRows.get(id);
  if (rendered) rendered.item = doc().items[id];
}

function renderTree(): void {
  const top = shownChildrenOf(state.zoom);
  rowsSeen = new Set();
  placeChildren(ui.tree, top.map(renderItem));
  for (const id of renderedRows.keys()) if (!rowsSeen.has(id)) renderedRows.delete(id);
  ui.tree.classList.toggle("searching", Boolean(state.results));
  const isEmpty = top.length === 0;
  ui.addItem.hidden = Boolean(state.results);
  ui.addItem.classList.toggle("prominent", isEmpty);
}

function shownChildrenOf(id: ItemId): ItemId[] {
  const children = shownChildren(doc(), id, filter());
  if (state.results) return children.filter((child) => state.results!.shown.has(child));
  return children;
}

function renderItem(id: ItemId): HTMLLIElement {
  rowsSeen.add(id);
  const item = doc().items[id];
  const children = shownChildrenOf(id);
  const hasChildren = shownChildren(doc(), id, filter()).length > 0;
  const expanded = hasChildren && (state.results ? children.length > 0 : !item.collapsed);
  const noteOpen = item.note !== "" || state.openNotes.has(id);
  const displayState = `${hasChildren} ${expanded} ${noteOpen}`;

  let rendered = renderedRows.get(id);
  if (!rendered || rendered.item !== item || rendered.state !== displayState) {
    const li = rendered?.li ?? createItemElement(id);
    li.querySelector(":scope > .row")?.remove();
    li.prepend(createRow(item, expanded, noteOpen));
    rendered = { item, state: displayState, li };
    renderedRows.set(id, rendered);
  }

  const li = rendered.li;
  li.classList.toggle("completed", item.completed);
  li.classList.toggle("has-children", hasChildren);
  li.classList.toggle("folded", hasChildren && !expanded);
  li.classList.toggle("match", Boolean(state.results?.matches.has(id)));
  if (hasChildren) li.setAttribute("aria-expanded", String(expanded));
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

function createItemElement(id: ItemId): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "item";
  li.dataset.id = id;
  li.setAttribute("role", "treeitem");
  return li;
}

function createRow(item: Item, expanded: boolean, noteOpen: boolean): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML =
    `<button class="toggle" type="button" tabindex="-1" aria-label="${expanded ? "Collapse" : "Expand"}"><svg viewBox="0 0 12 12"><path d="M4.5 3l3 3-3 3"/></svg></button>` +
    `<button class="bullet" type="button" tabindex="-1" aria-label="Zoom in" title="Zoom in · drag to move"><span class="dot"></span></button>` +
    `<div class="body">` +
    `<div class="text${item.text === "" ? " empty" : ""}" contenteditable="plaintext-only" spellcheck="true" data-id="${item.id}">${renderInline(item.text)}</div>` +
    `<div class="note" contenteditable="plaintext-only" spellcheck="true" data-id="${item.id}"${noteOpen ? "" : " hidden"}>${renderInline(item.note)}</div>` +
    `</div>`;
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
  for (const editor of ui.tree.querySelectorAll<HTMLElement>(".match > .row .text, .match > .row .note")) {
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

export function textEditorFor(id: ItemId): HTMLElement | null {
  if (id === state.zoom) return ui.title;
  return ui.tree.querySelector<HTMLElement>(`.item[data-id="${CSS.escape(id)}"] > .row .text`);
}

export function noteEditorFor(id: ItemId): HTMLElement | null {
  if (id === state.zoom) return ui.titleNote;
  return ui.tree.querySelector<HTMLElement>(`.item[data-id="${CSS.escape(id)}"] > .row .note`);
}

export function focusCaret(focus: Focus): void {
  const editor = focus.inNote ? noteEditorFor(focus.id) : textEditorFor(focus.id);
  if (!editor) return;
  if (focus.selectNone) {
    const row = editor.closest(".row");
    row?.classList.remove("flash");
    void (row as HTMLElement | null)?.offsetWidth;
    row?.classList.add("flash");
    return;
  }
  editor.hidden = false;
  editor.focus({ preventScroll: true });
  select(editor, Math.min(focus.offset, (editor.textContent ?? "").length));
  editor.scrollIntoView({ block: "nearest" });
}

