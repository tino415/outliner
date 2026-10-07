import { Doc, ItemId, indexInParent, isDescendant, moveTo } from "./model";

interface DragHost {
  doc: () => Doc;
  zoomInto: (id: ItemId) => void;
  move: (next: Doc, id: ItemId) => void;
}

interface Drop {
  parent: ItemId;
  index: number;
  indicator: { left: number; top: number; width: number };
}

const DRAG_THRESHOLD = 5;
const CHILD_OFFSET = 28;

/** Bullets are drag handles; a press that does not move is a click that zooms in. */
export function enableDragAndDrop(tree: HTMLElement, host: DragHost): void {
  tree.addEventListener("pointerdown", (event) => {
    const bullet = (event.target as HTMLElement).closest<HTMLElement>(".bullet");
    if (!bullet || event.button !== 0) return;
    event.preventDefault();
    const source = bullet.closest<HTMLElement>(".item")!;
    trackPointer(event, bullet, source, tree, host);
  });
}

function trackPointer(start: PointerEvent, bullet: HTMLElement, source: HTMLElement, tree: HTMLElement, host: DragHost) {
  const id = source.dataset.id!;
  let ghost: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;
  let drop: Drop | null = null;
  bullet.setPointerCapture(start.pointerId);

  const onMove = (event: PointerEvent) => {
    const distance = Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY);
    if (!ghost && distance < DRAG_THRESHOLD) return;
    if (!ghost) {
      ghost = createGhost(source);
      indicator = Object.assign(document.createElement("div"), { className: "drop-indicator" });
      document.body.append(ghost, indicator);
      document.body.classList.add("dragging");
      source.classList.add("drag-source");
    }
    ghost.style.transform = `translate(${event.clientX + 14}px, ${event.clientY - 14}px)`;
    drop = dropAt(event.clientX, event.clientY, id, tree, host.doc());
    indicator!.hidden = !drop;
    if (drop) {
      Object.assign(indicator!.style, {
        left: `${drop.indicator.left}px`,
        top: `${drop.indicator.top}px`,
        width: `${drop.indicator.width}px`,
      });
    }
    autoScroll(event.clientY);
  };

  const finish = (event: PointerEvent) => {
    bullet.removeEventListener("pointermove", onMove);
    bullet.removeEventListener("pointerup", finish);
    bullet.removeEventListener("pointercancel", finish);
    const dragged = Boolean(ghost);
    ghost?.remove();
    indicator?.remove();
    document.body.classList.remove("dragging");
    source.classList.remove("drag-source");
    if (event.type === "pointercancel") return;
    if (!dragged) host.zoomInto(id);
    else if (drop) host.move(moveTo(host.doc(), id, drop.parent, drop.index), id);
  };

  bullet.addEventListener("pointermove", onMove);
  bullet.addEventListener("pointerup", finish);
  bullet.addEventListener("pointercancel", finish);
}

function createGhost(source: HTMLElement): HTMLElement {
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = source.querySelector(".text")?.textContent || "Untitled";
  return ghost;
}

function dropAt(x: number, y: number, dragged: ItemId, tree: HTMLElement, doc: Doc): Drop | null {
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

function autoScroll(y: number): void {
  const edge = 56;
  if (y < edge) window.scrollBy(0, -12);
  else if (y > window.innerHeight - edge) window.scrollBy(0, 12);
}
