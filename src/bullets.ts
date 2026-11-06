import { Doc, ItemId, indexInParent, isDescendant, moveTo } from "./model";
import { swallowNextClick } from "./clicks";

interface DragHost {
  doc: () => Doc;
  zoomInto: (id: ItemId) => void;
  move: (next: Doc, id: ItemId) => void;
  openMenu: (id: ItemId, anchor: HTMLElement, byTouch: boolean) => void;
}

export interface Drop {
  parent: ItemId;
  index: number;
  indicator: { left: number; top: number; width: number } | { left: number; top: number; height: number };
}

/** Where a dragged item can land in one view, and how that view scrolls toward the pointer near its edges. */
export interface DropPlaces {
  dropAt: (x: number, y: number, dragged: ItemId, doc: Doc) => Drop | null;
  scrollToward: (x: number, y: number) => void;
}

const DRAG_THRESHOLD = 5;
const CHILD_OFFSET = 28;
const LONG_PRESS_MS = 450;

/**
 * Bullets are handles: a press that does not move is a click that zooms in,
 * a press that moves drags the item, and a long touch or a right click opens
 * the item's menu.
 */
export function enableBulletHandles(outline: HTMLElement, host: DragHost, places: DropPlaces = treeDrops(outline)): void {
  outline.addEventListener("pointerdown", (event) => {
    const bullet = (event.target as HTMLElement).closest<HTMLElement>(".bullet");
    if (!bullet || event.button !== 0) return;
    event.preventDefault();
    const source = bullet.closest<HTMLElement>(".item")!;
    trackPointer(event, bullet, source, places, host);
  });
  outline.addEventListener("contextmenu", (event) => {
    const bullet = (event.target as HTMLElement).closest<HTMLElement>(".bullet");
    if (!bullet) return;
    event.preventDefault();
    const open = () => host.openMenu(bullet.closest<HTMLElement>(".item")!.dataset.id!, bullet, false);
    const buttonStillDown = (event.buttons & 2) !== 0;
    if (buttonStillDown) window.addEventListener("pointerup", () => setTimeout(open), { once: true });
    else open();
  });
}

function trackPointer(start: PointerEvent, bullet: HTMLElement, source: HTMLElement, places: DropPlaces, host: DragHost) {
  const id = source.dataset.id!;
  let ghost: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;
  let drop: Drop | null = null;
  let menuOpened = false;
  try {
    bullet.setPointerCapture(start.pointerId);
  } catch {
    // A pointer the browser no longer tracks; the listeners below still work for it.
  }
  const longPress =
    start.pointerType === "mouse"
      ? undefined
      : window.setTimeout(() => {
          menuOpened = true;
          bullet.classList.add("pressed");
        }, LONG_PRESS_MS);

  const onMove = (event: PointerEvent) => {
    const distance = Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY);
    if (menuOpened || (!ghost && distance < DRAG_THRESHOLD)) return;
    window.clearTimeout(longPress);
    if (!ghost) {
      ghost = createGhost(source);
      indicator = Object.assign(document.createElement("div"), { className: "drop-indicator" });
      document.body.append(ghost, indicator);
      document.body.classList.add("dragging");
      source.classList.add("drag-source");
    }
    ghost.style.transform = `translate(${event.clientX + 14}px, ${event.clientY - 14}px)`;
    drop = places.dropAt(event.clientX, event.clientY, id, host.doc());
    indicator!.hidden = !drop;
    if (drop) placeIndicator(indicator!, drop.indicator);
    places.scrollToward(event.clientX, event.clientY);
  };

  const finish = (event: PointerEvent) => {
    window.clearTimeout(longPress);
    bullet.removeEventListener("pointermove", onMove);
    bullet.removeEventListener("pointerup", finish);
    bullet.removeEventListener("pointercancel", finish);
    const dragged = Boolean(ghost);
    ghost?.remove();
    indicator?.remove();
    document.body.classList.remove("dragging");
    source.classList.remove("drag-source");
    bullet.classList.remove("pressed");
    if (menuOpened && event.type === "pointerup") setTimeout(() => host.openMenu(id, bullet, true));
    if (event.type === "pointercancel" || menuOpened) return;
    if (!dragged) {
      swallowNextClick();
      host.zoomInto(id);
    } else if (drop) host.move(moveTo(host.doc(), id, drop.parent, drop.index), id);
  };

  bullet.addEventListener("pointermove", onMove);
  bullet.addEventListener("pointerup", finish);
  bullet.addEventListener("pointercancel", finish);
}

function placeIndicator(indicator: HTMLElement, at: Drop["indicator"]): void {
  const upright = "height" in at;
  indicator.classList.toggle("upright", upright);
  Object.assign(indicator.style, {
    left: `${at.left}px`,
    top: `${at.top}px`,
    width: upright ? "" : `${at.width}px`,
    height: upright ? `${at.height}px` : "",
  });
}

function createGhost(source: HTMLElement): HTMLElement {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = source.querySelector(".text")?.textContent || "Untitled";
  return ghost;
}

function treeDrops(tree: HTMLElement): DropPlaces {
  return { dropAt: (x, y, dragged, doc) => dropInTree(x, y, dragged, tree, doc), scrollToward: (_x, y) => scrollPageToward(y) };
}

function dropInTree(x: number, y: number, dragged: ItemId, tree: HTMLElement, doc: Doc): Drop | null {
  const row = rowNear(x, y, tree);
  if (!row) return null;
  const target = row.closest<HTMLElement>(".item")!.dataset.id!;
  if (target === dragged || isDescendant(doc, target, dragged)) return null;

  const rowRect = row.getBoundingClientRect();
  const textLeft = row.querySelector(".body")!.getBoundingClientRect().left;
  const width = rowRect.right - textLeft;
  const parent = doc.items[target].parent!;
  const index = indexInParent(doc, target);
  const expanded = row.parentElement!.querySelector(":scope > .children") !== null;

  if (y < rowRect.top + rowRect.height / 2) {
    return { parent, index, indicator: { left: textLeft, top: rowRect.top, width } };
  }
  if (expanded || x > textLeft + CHILD_OFFSET) {
    return {
      parent: target,
      index: 0,
      indicator: { left: textLeft + CHILD_OFFSET, top: rowRect.bottom, width: width - CHILD_OFFSET },
    };
  }
  return { parent, index: index + 1, indicator: { left: textLeft, top: rowRect.bottom, width } };
}

function rowNear(x: number, y: number, tree: HTMLElement): HTMLElement | null {
  const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>(".row");
  if (hit && tree.contains(hit)) return hit;
  const rows = [...tree.querySelectorAll<HTMLElement>(".row")];
  return rows.find((row) => {
    const rect = row.getBoundingClientRect();
    return y >= rect.top && y <= rect.bottom;
  }) ?? null;
}

export function scrollPageToward(y: number): void {
  const edge = 56;
  if (y < edge) window.scrollBy(0, -12);
  else if (y > window.innerHeight - edge) window.scrollBy(0, 12);
}
