import { ItemId, setCollapsed, toggleCompleted, isShown } from "./model";
import { commitAndRender, doc, filter, state } from "./app";
import { openItemMenu, toastWithUndo } from "./chrome";
import { flashRow } from "./render";

/*
 * Swipes on rows for touch screens (doc/adr/0016): right completes, left
 * folds an item with children or opens the menu of one without.
 */

const SLOP = 10;
const THRESHOLD = 72;
const SCREEN_EDGE = 24;

type SwipeAction = "complete" | "reopen" | "collapse" | "expand" | "menu";

const LABELS: Record<SwipeAction, string> = {
  complete: "Complete",
  reopen: "Reopen",
  collapse: "Collapse",
  expand: "Expand",
  menu: "More…",
};

export function enableRowSwipes(tree: HTMLElement): void {
  tree.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || !event.isPrimary || state.results) return;
    if (event.clientX < SCREEN_EDGE || event.clientX > window.innerWidth - SCREEN_EDGE) return;
    const target = event.target as Element;
    const row = target.closest<HTMLElement>(".row");
    if (!row || target.closest(".bullet, .toggle")) return;
    followSwipe(event, row);
  });
}

function followSwipe(start: PointerEvent, row: HTMLElement): void {
  const item = row.parentElement as HTMLElement;
  const id = item.dataset.id!;
  let band: HTMLElement | null = null;
  let armed = false;
  let action: SwipeAction | null = null;

  const move = (event: PointerEvent) => {
    if (event.pointerId !== start.pointerId) return;
    const dx = event.clientX - start.clientX;
    const dy = event.clientY - start.clientY;
    if (!band) {
      if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) return stop();
      if (Math.abs(dx) < SLOP || Math.abs(dx) < 2 * Math.abs(dy)) return;
      band = showBand(item, row);
    }
    action = dx > 0 ? (doc().items[id].completed ? "reopen" : "complete") : leftSwipeAction(id);
    const nowArmed = Math.abs(dx) >= THRESHOLD;
    if (nowArmed && !armed) navigator.vibrate?.(8);
    armed = nowArmed;
    band.dataset.action = action;
    band.dataset.side = dx > 0 ? "left" : "right";
    band.classList.toggle("armed", armed);
    band.querySelector("span")!.textContent = LABELS[action];
    row.style.transform = `translateX(${dx}px)`;
  };

  const end = (event: PointerEvent) => {
    if (event.pointerId !== start.pointerId) return;
    const swiped = band !== null;
    stop();
    if (!swiped) return;
    swallowNextClick();
    const chosen = action;
    if (armed && chosen && event.type === "pointerup") setTimeout(() => perform(chosen, id, row));
  };

  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    if (band) {
      row.style.transition = "transform 0.18s ease-out";
      row.style.transform = "";
      const finished = band;
      setTimeout(() => {
        finished.remove();
        row.style.transition = "";
      }, 180);
    }
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function leftSwipeAction(id: ItemId): SwipeAction {
  const item = doc().items[id];
  if (item.children.length === 0) return "menu";
  return item.collapsed ? "expand" : "collapse";
}

function showBand(item: HTMLElement, row: HTMLElement): HTMLElement {
  const band = document.createElement("div");
  band.className = "swipe-band";
  band.innerHTML = "<span></span>";
  band.style.top = `${row.offsetTop}px`;
  band.style.height = `${row.offsetHeight}px`;
  item.prepend(band);
  return band;
}

function perform(action: SwipeAction, id: ItemId, row: HTMLElement): void {
  if (action === "menu") {
    openItemMenu(id, row.querySelector<HTMLElement>(".bullet")!, true);
    return;
  }
  if (action === "collapse" || action === "expand") {
    commitAndRender(setCollapsed(doc(), id, action === "collapse"), null);
    return;
  }
  const next = toggleCompleted(doc(), id);
  commitAndRender(next, null);
  if (isShown(next, id, filter())) flashRow(id);
  else toastWithUndo("Completed and hidden");
}

/** A swipe ends with the finger lifting, which the browser would also report as a tap on the row. */
function swallowNextClick(): void {
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const stopSwallowing = () => window.removeEventListener("click", swallow, { capture: true });
  window.addEventListener("click", swallow, { capture: true, once: true });
  window.addEventListener("pointerdown", stopSwallowing, { capture: true, once: true });
  setTimeout(stopSwallowing, 400);
}
