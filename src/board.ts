import { caretNow } from "./editing";
import { commitAndRender, doc, filter, state, ui } from "./app";
import { ItemId, indexInParent, insertChild, isBoard, moveTo, setItemProperty, shownChildren } from "./model";
import { isSealed } from "./notes";
import { escape, renderItemText, renderNote } from "./inline";
import { propertyChipsHtml } from "./propertyChips";

/*
 * The board view (doc/adr/0031): an item with `:view: board` shows its
 * children as columns and their children as cards. Cards are ordinary items,
 * edited in place; moving one to another column moves it in the outline.
 */

export function boardShown(): boolean {
  return !state.results && isBoard(doc().items[state.zoom]);
}

export function toggleBoard(): void {
  const page = doc().items[state.zoom];
  commitAndRender(setItemProperty(doc(), page.id, "view", isBoard(page) ? "" : "board"), caretNow());
}

export function renderBoard(): void {
  const columns = shownChildren(doc(), state.zoom, filter());
  ui.board.innerHTML = columns.map(columnHtml).join("") + `<button type="button" class="board-new-column" data-board-new-column>+ Column</button>`;
}

function columnHtml(id: ItemId): string {
  const item = doc().items[id];
  const cards = shownChildren(doc(), id, filter());
  return (
    `<section class="item board-column${item.completed ? " completed" : ""}" data-id="${escape(id)}">` +
    `<div class="row board-column-head">${textEditor(id)}<span class="board-count">${cards.length}</span></div>` +
    `<ol class="board-cards">${cards.map(cardHtml).join("")}</ol>` +
    `<button type="button" class="board-new-card" data-board-new-card="${escape(id)}">+ Add a card</button></section>`
  );
}

function cardHtml(id: ItemId): string {
  const item = doc().items[id];
  const inside = shownChildren(doc(), id, filter()).length;
  const noteOpen = item.note !== "" || state.openNotes.has(id);
  return (
    `<li class="item board-card${item.completed ? " completed" : ""}" data-id="${escape(id)}"><div class="row">` +
    `<span class="board-handle" aria-label="Drag to move" title="Drag to move">⠿</span>${textEditor(id)}${propertyChipsHtml(item)}` +
    `<div class="note" contenteditable="${isSealed(item.note) ? "false" : "plaintext-only"}" spellcheck="true" data-id="${escape(id)}"${noteOpen ? "" : " hidden"}>${renderNote(item.note)}</div>` +
    (inside ? `<a class="board-inside" href="#/${encodeURIComponent(id)}">${inside} inside</a>` : "") +
    `</div></li>`
  );
}

function textEditor(id: ItemId): string {
  const text = doc().items[id].text;
  return `<div class="text${text === "" ? " empty" : ""}" contenteditable="plaintext-only" spellcheck="true" data-id="${escape(id)}">${renderItemText(text)}</div>`;
}

/** Alt-Shift-← and → on a board: a card to the next column, a column one place over. */
export function moveSideways(id: ItemId, direction: -1 | 1, offset: number): boolean {
  if (!boardShown()) return false;
  const item = doc().items[id];
  const columns = shownChildren(doc(), state.zoom, filter());
  if (item.parent === state.zoom) {
    const index = columns.indexOf(id);
    const neighbour = columns[index + direction];
    if (!neighbour) return true;
    commitAndRender(moveTo(doc(), id, state.zoom, indexInParent(doc(), neighbour) + (direction === 1 ? 1 : 0)), { id, offset });
    return true;
  }
  const column = columns[columns.indexOf(item.parent!) + direction];
  if (!column) return true;
  commitAndRender(moveTo(doc(), id, column, doc().items[column].children.length), { id, offset });
  return true;
}

// ---- adding and dragging ----------------------------------------------------------------

export function bindBoard(): void {
  ui.board.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const newCard = target.closest<HTMLElement>("[data-board-new-card]");
    if (newCard) addChild(newCard.dataset.boardNewCard!);
    if (target.closest("[data-board-new-column]")) addChild(state.zoom);
  });
  ui.board.addEventListener("pointerdown", (event) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>(".board-handle");
    if (handle && event.button === 0) drag(event, handle);
  });
}

function addChild(parent: ItemId): void {
  const created = insertChild(doc(), parent, doc().items[parent].children.length);
  commitAndRender(created.doc, { id: created.id, offset: 0 });
}

function drag(start: PointerEvent, handle: HTMLElement): void {
  start.preventDefault();
  const card = handle.closest<HTMLElement>(".board-card")!;
  const id = card.dataset.id!;
  const marker = Object.assign(document.createElement("li"), { className: "board-drop" });
  card.classList.add("dragging");
  handle.setPointerCapture(start.pointerId);

  const follow = (event: PointerEvent) => {
    const column = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(".board-column");
    if (column) {
      const cards = [...column.querySelectorAll<HTMLElement>(":scope > .board-cards > .board-card")].filter((each) => each !== card);
      const before = cards.find((each) => event.clientY < each.getBoundingClientRect().top + each.getBoundingClientRect().height / 2);
      column.querySelector(".board-cards")!.insertBefore(marker, before ?? null);
    }
    const edge = 48;
    if (event.clientX < edge) ui.board.scrollLeft -= 12;
    if (event.clientX > window.innerWidth - edge) ui.board.scrollLeft += 12;
  };
  const drop = () => {
    handle.removeEventListener("pointermove", follow);
    card.classList.remove("dragging");
    const column = marker.closest<HTMLElement>(".board-column")?.dataset.id;
    const next = (marker.nextElementSibling as HTMLElement | null)?.dataset.id;
    marker.remove();
    if (!column) return;
    const index = next ? indexInParent(doc(), next) : doc().items[column].children.length;
    commitAndRender(moveTo(doc(), id, column, index), null);
  };
  handle.addEventListener("pointermove", follow);
  handle.addEventListener("pointerup", drop, { once: true });
  handle.addEventListener("pointercancel", drop, { once: true });
}
