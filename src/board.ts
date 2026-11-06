import { caretNow } from "./editing";
import { Focus, commitAndRender, doc, filter, state, ui } from "./app";
import { ItemId, ROOT, indexInParent, insertChild, isBoard, moveTo, newChildIndex, setItemProperty, shownChildren } from "./model";
import { isSealed } from "./notes";
import { escape, renderItemText, renderNote } from "./inline";
import { propertyChipsHtml } from "./propertyChips";
import { ownFormulaResults } from "./render";
import { isMirror, mirrorBulletTitle, mirrorTextHtml } from "./mirrors";
import { Drop, DropPlaces, scrollPageToward } from "./bullets";
import { agendaShown } from "./agenda";
import { queryViewShown } from "./queryView";

/*
 * The board view (doc/adr/0031): an item with `:view: board` shows its
 * children as columns and their children as cards. Cards are ordinary items,
 * edited in place; moving one to another column moves it in the outline.
 */

export type View = "tree" | "board";

export function shownView(): View {
  return boardShown() ? "board" : "tree";
}

export function boardShown(): boolean {
  return !state.results && !agendaShown() && !queryViewShown() && isBoard(doc().items[state.zoom]);
}

export function isColumn(id: ItemId): boolean {
  return boardShown() && doc().items[id].parent === state.zoom;
}

export function isCard(id: ItemId): boolean {
  const parent = doc().items[id].parent;
  return Boolean(parent) && isColumn(parent!);
}

/** On a board only a card shows whether it is folded; a column, and a card's children, show their children another way. */
export function foldShows(id: ItemId): boolean {
  return !boardShown() || isCard(id);
}

/** Joining two items on a board keeps to two cards of one column, so no card hides inside another column's title or card. */
export function joinStaysInColumn(id: ItemId, other: ItemId): boolean {
  const parent = doc().items[id].parent;
  return !boardShown() || (parent === doc().items[other].parent && parent !== state.zoom);
}

/** Out of a card's page straight back to its board; the column's page stays a breadcrumb away. */
export function pageAbove(page: ItemId): ItemId {
  const parent = doc().items[page].parent ?? ROOT;
  const grandparent = doc().items[parent].parent;
  return grandparent && isBoard(doc().items[grandparent]) ? grandparent : parent;
}

export function toggleBoard(): void {
  const page = doc().items[state.zoom];
  commitAndRender(setItemProperty(doc(), page.id, "view", isBoard(page) ? "" : "board"), caretNow());
}

export function renderBoard(): void {
  const columns = shownChildren(doc(), state.zoom, filter());
  ui.board.innerHTML = columns.map((id) => columnGapHtml(id) + columnHtml(id)).join("") + `<button type="button" class="board-new-column" data-board-new-column>+ Column</button>`;
}

function columnGapHtml(nextColumn: ItemId): string {
  return `<button type="button" class="board-gap" data-board-gap="${escape(nextColumn)}" aria-label="Add a column here" title="Add a column here"></button>`;
}

function columnHtml(id: ItemId): string {
  const item = doc().items[id];
  const cards = shownChildren(doc(), id, filter());
  return (
    `<section class="item board-column${item.completed ? " completed" : ""}" data-id="${escape(id)}">` +
    `<div class="row board-column-head">${bullet(id)}${textEditor(id)}${propertyButton()}<span class="board-count">${cards.length}</span>${propertyChipsHtml(item, undefined, ownFormulaResults(id))}${noteEditor(id)}</div>` +
    `<ol class="board-cards">${cards.map(cardHtml).join("")}</ol>` +
    `<button type="button" class="board-new-card" data-board-new-card="${escape(id)}">+ Add a card</button></section>`
  );
}

/** An expanded card shows one level of its children as rows; deeper levels, and a folded card's children, are a count. */
function cardHtml(id: ItemId): string {
  const item = doc().items[id];
  const children = shownChildren(doc(), id, filter());
  const expanded = children.length > 0 && !item.collapsed;
  const classes = ["item", "board-card", item.completed && "completed", children.length > 0 && "has-children", children.length > 0 && !expanded && "folded"];
  return (
    `<li class="${classes.filter(Boolean).join(" ")}" data-id="${escape(id)}"><div class="row">` +
    `${foldToggle(expanded)}${bullet(id)}${textEditor(id)}${propertyButton()}${propertyChipsHtml(item, undefined, ownFormulaResults(id))}${noteEditor(id)}` +
    (expanded ? "" : insideLink(id, children.length)) +
    `</div>` +
    (expanded ? `<ol class="board-children">${children.map(cardChildHtml).join("")}</ol>` : "") +
    `</li>`
  );
}

function cardChildHtml(id: ItemId): string {
  const item = doc().items[id];
  return (
    `<li class="item board-child${item.completed ? " completed" : ""}" data-id="${escape(id)}"><div class="row">` +
    `${bullet(id)}${textEditor(id)}${propertyButton()}${propertyChipsHtml(item, undefined, ownFormulaResults(id))}${noteEditor(id)}` +
    insideLink(id, shownChildren(doc(), id, filter()).length) +
    `</div></li>`
  );
}

function foldToggle(expanded: boolean): string {
  return `<button class="toggle" type="button" tabindex="-1" aria-label="${expanded ? "Collapse" : "Expand"}"><svg viewBox="0 0 12 12"><path d="M4.5 3l3 3-3 3"/></svg></button>`;
}

function insideLink(id: ItemId, inside: number): string {
  return inside ? `<a class="board-inside" href="#/${encodeURIComponent(id)}">${inside} inside</a>` : "";
}

function noteEditor(id: ItemId): string {
  const note = doc().items[id].note;
  const open = note !== "" || state.openNotes.has(id);
  return `<div class="note" contenteditable="${isSealed(note) ? "false" : "plaintext-only"}" spellcheck="true" data-id="${escape(id)}"${open ? "" : " hidden"}>${renderNote(note)}</div>`;
}

function bullet(id: ItemId): string {
  const title = isMirror(doc(), id) ? mirrorBulletTitle(doc(), id) : "Open · drag to move";
  return `<button class="bullet" type="button" tabindex="-1" aria-label="Open" title="${escape(title)}"><span class="dot"></span></button>`;
}

function propertyButton(): string {
  return `<button class="prop-add" type="button" tabindex="-1" aria-label="Add a property" title="Add a property">+</button>`;
}

function textEditor(id: ItemId): string {
  if (isMirror(doc(), id)) return mirrorTextHtml(doc(), id);
  const text = doc().items[id].text;
  return `<div class="text${text === "" ? " empty" : ""}" contenteditable="plaintext-only" spellcheck="true" data-id="${escape(id)}">${renderItemText(text)}</div>`;
}

/** Tab and Shift-Tab on a board: a card to the next column at the same height, a column one place over. */
export function moveSideways(id: ItemId, direction: -1 | 1, caret: Focus | null): void {
  const columns = shownChildren(doc(), state.zoom, filter());
  if (!isCard(id) && !isColumn(id)) return;
  if (isColumn(id)) {
    const neighbour = columns[columns.indexOf(id) + direction];
    if (neighbour) commitAndRender(moveTo(doc(), id, state.zoom, indexInParent(doc(), neighbour) + (direction === 1 ? 1 : 0)), caret);
    return;
  }
  const from = doc().items[id].parent!;
  const column = columns[columns.indexOf(from) + direction];
  if (!column) return;
  const height = shownChildren(doc(), from, filter()).indexOf(id);
  const cardThere = shownChildren(doc(), column, filter())[height];
  const index = cardThere ? indexInParent(doc(), cardThere) : doc().items[column].children.length;
  commitAndRender(moveTo(doc(), id, column, index), caret);
}

// ---- adding and dragging ----------------------------------------------------------------

export function bindBoard(): void {
  ui.board.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const newCard = target.closest<HTMLElement>("[data-board-new-card]");
    if (newCard) addChild(newCard.dataset.boardNewCard!, newChildIndex(doc(), newCard.dataset.boardNewCard!));
    if (target.closest("[data-board-new-column]")) addChild(state.zoom);
    const gap = target.closest<HTMLElement>("[data-board-gap]");
    if (gap) addChild(state.zoom, indexInParent(doc(), gap.dataset.boardGap!));
  });
}

function addChild(parent: ItemId, index = doc().items[parent].children.length): void {
  const created = insertChild(doc(), parent, index);
  commitAndRender(created.doc, { id: created.id, offset: 0 });
}

/** A card lands between two cards of the column under the pointer, a column between two columns; anywhere else the drag snaps back. */
export const boardDrops: DropPlaces = {
  dropAt: (x, y, dragged) => (isColumn(dragged) ? columnDropAt(x, y, dragged) : cardDropAt(x, y, dragged)),
  scrollToward: (x, y) => {
    const edge = 48;
    if (x < edge) ui.board.scrollLeft -= 12;
    if (x > window.innerWidth - edge) ui.board.scrollLeft += 12;
    scrollPageToward(y);
  },
};

function cardDropAt(x: number, y: number, dragged: ItemId): Drop | null {
  const column = document.elementFromPoint(x, y)?.closest<HTMLElement>(".board-column");
  if (!column || !ui.board.contains(column)) return null;
  const list = column.querySelector<HTMLElement>(":scope > .board-cards")!.getBoundingClientRect();
  const cards = [...column.querySelectorAll<HTMLElement>(":scope > .board-cards > .board-card")].filter((card) => card.dataset.id !== dragged);
  const before = cards.find((card) => y < middle(card.getBoundingClientRect()).y);
  const last = cards.at(-1)?.getBoundingClientRect();
  const top = before ? before.getBoundingClientRect().top - 4 : last ? last.bottom + 4 : list.top + list.height / 2;
  const parent = column.dataset.id!;
  const index = before ? indexInParent(doc(), before.dataset.id!) : doc().items[parent].children.length;
  return { parent, index, indicator: { left: list.left + 6, top, width: list.width - 6 } };
}

function columnDropAt(x: number, y: number, dragged: ItemId): Drop | null {
  const board = ui.board.getBoundingClientRect();
  if (y < board.top || y > board.bottom) return null;
  const columns = [...ui.board.querySelectorAll<HTMLElement>(":scope > .board-column")].filter((column) => column.dataset.id !== dragged);
  const before = columns.find((column) => x < middle(column.getBoundingClientRect()).x);
  const edge = before ? before.getBoundingClientRect().left - 8 : columns.at(-1)!.getBoundingClientRect().right + 8;
  const index = before ? indexInParent(doc(), before.dataset.id!) : doc().items[state.zoom].children.length;
  const head = (before ?? columns.at(-1)!).getBoundingClientRect();
  return { parent: state.zoom, index, indicator: { left: edge, top: head.top, height: head.height } };
}

function middle(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function otherColumns(card: ItemId): ItemId[] {
  return shownChildren(doc(), state.zoom, filter()).filter((column) => column !== doc().items[card].parent);
}
