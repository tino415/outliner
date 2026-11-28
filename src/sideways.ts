import { state, doc, ui } from "./app";
import { Doc, ItemId, indexInParent, isDescendant, isSidewaysTree } from "./model";
import { agendaShown } from "./agenda";
import { queryViewShown } from "./queryView";
import { showPageAs } from "./board";
import { Drop, DropPlaces } from "./bullets";
import { itemElementFor } from "./render";

/*
 * The tree view: a page with `:view: tree` lays the outline's own rows out
 * sideways, the title at the left and each level to the right of its parent.
 * The rows are the ones the outline renders; only the style sheet differs.
 */

export function sidewaysShown(): boolean {
  return !agendaShown() && !queryViewShown() && isSidewaysTree(doc().items[state.zoom]);
}

export function toggleSideways(): void {
  showPageAs(isSidewaysTree(doc().items[state.zoom]) ? "tree" : "sideways");
}

export type Across = "up" | "down" | "left" | "right";

/** Up and down stay among the shown items of one level, left goes to the parent, right to the first shown child. */
export function nodeAcross(doc: Doc, page: ItemId, from: ItemId, way: Across, shownUnder: (id: ItemId) => ItemId[]): ItemId | null {
  if (way === "left") return from === page ? null : (doc.items[from].parent ?? null);
  if (way === "right") return shownUnder(from)[0] ?? null;
  if (from === page) return way === "down" ? (shownUnder(page)[0] ?? null) : null;
  const depth = depthBelow(doc, page, from);
  const level = nodesAtDepth(page, depth, shownUnder);
  const at = level.indexOf(from);
  if (at === -1) return null;
  const neighbour = level[at + (way === "down" ? 1 : -1)];
  if (neighbour) return neighbour;
  return way === "up" && depth === 1 ? page : null;
}

function depthBelow(doc: Doc, page: ItemId, id: ItemId): number {
  let depth = 0;
  for (let at: ItemId | null = id; at !== page && at !== null; at = doc.items[at].parent) depth++;
  return depth;
}

function nodesAtDepth(page: ItemId, depth: number, shownUnder: (id: ItemId) => ItemId[]): ItemId[] {
  let level = [page];
  for (let step = 0; step < depth; step++) level = level.flatMap(shownUnder);
  return level;
}

/** The nodes drawn right of an item: none while it is folded. */
export function nodesShownUnder(id: ItemId): ItemId[] {
  const list = id === state.zoom ? ui.tree : itemElementFor(id)?.querySelector(":scope > .children");
  return [...(list?.children ?? [])].map((child) => (child as HTMLElement).dataset.id!);
}

let pageLaidOut: ItemId | null = null;

/** A page shown as a tree opens with its title at the left edge, half way down; later renders keep the scroll. */
export function placeSidewaysPage(sideways: boolean): void {
  if (sideways && pageLaidOut !== state.zoom) {
    window.scrollTo(0, 0);
    ui.page.scrollTo(0, (ui.page.scrollHeight - ui.page.clientHeight) / 2);
  }
  pageLaidOut = sideways ? state.zoom : null;
}

// ---- dragging ------------------------------------------------------------------------------

const EDGE = 48;
const STEP = 12;

/** A node's upper half puts the dragged item before it, its lower half after it, and its right third makes it the node's last child. */
export const sidewaysDrops: DropPlaces = {
  dropAt: (x, y, dragged, doc) => dropOnNode(x, y, dragged, doc),
  scrollToward: (x, y) => {
    const box = ui.page.getBoundingClientRect();
    if (x < box.left + EDGE) ui.page.scrollLeft -= STEP;
    if (x > box.right - EDGE) ui.page.scrollLeft += STEP;
    if (y < box.top + EDGE) ui.page.scrollTop -= STEP;
    if (y > box.bottom - EDGE) ui.page.scrollTop += STEP;
  },
};

function dropOnNode(x: number, y: number, dragged: ItemId, doc: Doc): Drop | null {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>(".row");
  if (!row || !ui.tree.contains(row)) return null;
  const target = row.closest<HTMLElement>(".item")!.dataset.id!;
  if (target === dragged || isDescendant(doc, target, dragged)) return null;
  const box = row.getBoundingClientRect();
  if (x > box.left + (box.width * 2) / 3) {
    return { parent: target, index: doc.items[target].children.length, indicator: { left: box.right + 4, top: box.top, height: box.height } };
  }
  const parent = doc.items[target].parent!;
  const before = y < box.top + box.height / 2;
  return {
    parent,
    index: indexInParent(doc, target) + (before ? 0 : 1),
    indicator: { left: box.left, top: before ? box.top - 3 : box.bottom + 3, width: box.width },
  };
}
