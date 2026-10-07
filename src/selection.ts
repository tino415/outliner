import {
  ItemId,
  completeAll,
  indentAll,
  moveAllDown,
  moveAllUp,
  outdentAll,
  removeAll,
  selectionRoots,
  subtreeSize,
} from "./model";
import { subtreesAsText } from "./transfer";
import { Focus, commitAndRender, doc, filter, state, ui } from "./app";
import { editorOf } from "./editing";
import { END, focusCaret, itemElementFor, treeEditors } from "./render";
import { itemCount, toast, toastWithUndo } from "./chrome";

export const selectionActions = {
  extend(direction: -1 | 1): void {
    const editors = treeEditors();
    const head = editors.findIndex((editor) => editor.dataset.id === state.selection!.head);
    const next = editors[head + direction];
    if (!next) return;
    state.selection = { ...state.selection!, head: next.dataset.id! };
    paintSelection();
    next.scrollIntoView({ block: "nearest" });
  },

  leaveAt(edge: "start" | "end"): void {
    const head = state.selection!.head;
    clearSelection();
    focusCaret({ id: head, offset: edge === "start" ? 0 : END });
  },

  leave(): void {
    clearSelection();
  },

  indent(): void {
    commitAndRender(indentAll(doc(), selectedRoots(), filter()), null);
  },

  outdent(): void {
    commitAndRender(outdentAll(doc(), selectedRoots(), state.zoom), null);
  },

  moveUp(): void {
    commitAndRender(moveAllUp(doc(), selectedRoots(), filter()), null);
  },

  moveDown(): void {
    commitAndRender(moveAllDown(doc(), selectedRoots(), filter()), null);
  },

  complete(): void {
    commitAndRender(completeAll(doc(), selectedRoots()), null);
  },

  remove(): void {
    deleteItems(selectedRoots());
  },

  copy(): void {
    const roots = selectedRoots();
    copyItems(roots);
    toast(`Copied ${itemCount(roots.length)}`);
  },

  cut(): void {
    const roots = selectedRoots();
    copyItems(roots);
    deleteItems(roots);
  },

  selectPage(): void {
    selectWholePage();
  },
};

export function startSelection(anchor: ItemId, head: ItemId): void {
  editorOf(document.activeElement)?.blur();
  state.selection = { anchor, head };
  paintSelection();
}

export function clearSelection(): void {
  if (!state.selection) return;
  state.selection = null;
  paintSelection();
}

export function selectWholePage(): void {
  const editors = treeEditors();
  if (editors.length === 0) return;
  startSelection(editors[0].dataset.id!, editors.at(-1)!.dataset.id!);
}

export function paintSelection(): void {
  const selected = selectedIds();
  if (selected.length === 0) state.selection = null;
  ui.tree.querySelectorAll(".item.selected").forEach((item) => item.classList.remove("selected"));
  for (const id of selected) itemElementFor(id)?.classList.add("selected");
  document.body.classList.toggle("selecting", selected.length > 0);
}

function selectedIds(): ItemId[] {
  if (!state.selection) return [];
  const ids = treeEditors().map((editor) => editor.dataset.id!);
  const anchor = ids.indexOf(state.selection.anchor);
  const head = ids.indexOf(state.selection.head);
  if (anchor === -1 || head === -1) return [];
  return ids.slice(Math.min(anchor, head), Math.max(anchor, head) + 1);
}

function selectedRoots(): ItemId[] {
  return selectionRoots(doc(), selectedIds());
}

/** Deletes whole subtrees, puts the caret on the nearest surviving row and offers undo. */
export function deleteItems(roots: ItemId[]): void {
  const count = subtreeSize(doc(), roots);
  const focus = focusAfterRemoving(roots);
  state.selection = null;
  commitAndRender(removeAll(doc(), roots), focus);
  toastWithUndo(`Deleted ${itemCount(count)}`);
}

export function focusAfterRemoving(roots: ItemId[]): Focus[] {
  const { before, after } = rowsAround(roots);
  return [before && { id: before, offset: END }, after && { id: after, offset: 0 }].filter(Boolean) as Focus[];
}

/** The nearest rows above and below `roots` that are not inside any of them. */
export function rowsAround(roots: ItemId[]): { before: ItemId | null; after: ItemId | null } {
  const removed = new Set(roots);
  const isInside = (editor: HTMLElement) => {
    for (let item = editor.closest<HTMLElement>(".item"); item; item = item.parentElement!.closest<HTMLElement>(".item")) {
      if (removed.has(item.dataset.id!)) return true;
    }
    return false;
  };
  const editors = treeEditors();
  const first = editors.findIndex(isInside);
  if (first === -1) return { before: null, after: null };
  const after = editors.slice(first).find((editor) => !isInside(editor));
  return { before: editors[first - 1]?.dataset.id ?? null, after: after?.dataset.id ?? null };
}

export function copyItems(ids: ItemId[]): void {
  copyText(subtreesAsText(doc(), ids));
}

function copyText(text: string): void {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => copyWithTextarea(text));
  else copyWithTextarea(text);
}

function copyWithTextarea(text: string): void {
  const area = Object.assign(document.createElement("textarea"), { value: text });
  area.style.cssText = "position:fixed;opacity:0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export function endSelectionWhenSomethingTakesFocus(): void {
  document.addEventListener("focusin", clearSelection);
}
