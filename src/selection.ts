import {
  Doc,
  ItemId,
  completeAll,
  descendantCount,
  indentAll,
  moveAllDown,
  moveAllUp,
  outdentAll,
  removeAll,
  selectionRoots,
} from "./model";
import { subtreesAsText } from "./transfer";
import { keyString } from "./keys";
import { Focus, commitAndRender, doc, filter, state, ui, undo } from "./app";
import { editorOf } from "./editing";
import { focusCaret } from "./render";
import { toast } from "./chrome";

// ---- selecting several items ------------------------------------------------------

function treeEditors(): HTMLElement[] {
  return [...ui.tree.querySelectorAll<HTMLElement>(".text[data-id]")];
}

function selectedIds(): ItemId[] {
  if (!state.selection) return [];
  const ids = treeEditors().map((editor) => editor.dataset.id!);
  const anchor = ids.indexOf(state.selection.anchor);
  const head = ids.indexOf(state.selection.head);
  if (anchor === -1 || head === -1) return [];
  return ids.slice(Math.min(anchor, head), Math.max(anchor, head) + 1);
}

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

export function paintSelection(): void {
  const selected = new Set(selectedIds());
  if (selected.size === 0) state.selection = null;
  for (const item of ui.tree.querySelectorAll<HTMLElement>(".item")) {
    item.classList.toggle("selected", selected.has(item.dataset.id!));
  }
  document.body.classList.toggle("selecting", selected.size > 0);
}

function extendSelection(direction: -1 | 1): void {
  const editors = treeEditors();
  const head = editors.findIndex((editor) => editor.dataset.id === state.selection!.head);
  const next = editors[head + direction];
  if (!next) return;
  state.selection = { ...state.selection!, head: next.dataset.id! };
  paintSelection();
  next.scrollIntoView({ block: "nearest" });
}

/** Keys while items are selected. Returns false for keys that should behave as usual. */
export function handleSelectionKey(event: KeyboardEvent): boolean {
  const roots = selectionRoots(doc(), selectedIds());
  const keys = keyString(event);
  const keep = (next: Doc) => commitAndRender(next, null);
  switch (keys) {
    case "Shift+ArrowUp":
      extendSelection(-1);
      return true;
    case "Shift+ArrowDown":
      extendSelection(1);
      return true;
    case "ArrowUp":
    case "ArrowDown":
    case "Enter": {
      const head = state.selection!.head;
      clearSelection();
      focusCaret({ id: head, offset: keys === "ArrowUp" ? 0 : doc().items[head].text.length });
      return true;
    }
    case "Escape":
      clearSelection();
      return true;
    case "Tab":
      keep(indentAll(doc(), roots, filter()));
      return true;
    case "Shift+Tab":
      keep(outdentAll(doc(), roots, state.zoom));
      return true;
    case "Alt+Shift+ArrowUp":
    case "Mod+Shift+ArrowUp":
      keep(moveAllUp(doc(), roots, filter()));
      return true;
    case "Alt+Shift+ArrowDown":
    case "Mod+Shift+ArrowDown":
      keep(moveAllDown(doc(), roots, filter()));
      return true;
    case "Mod+Enter":
      keep(completeAll(doc(), roots));
      return true;
    case "Backspace":
    case "Delete":
    case "Mod+Shift+Backspace":
      deleteSelection(roots);
      return true;
    case "Mod+c":
      copyText(subtreesAsText(doc(), roots));
      toast(`Copied ${roots.length} item${roots.length === 1 ? "" : "s"}`);
      return true;
    case "Mod+x":
      copyText(subtreesAsText(doc(), roots));
      deleteSelection(roots);
      return true;
    case "Mod+a":
      state.selection = { anchor: treeEditors()[0].dataset.id!, head: treeEditors().at(-1)!.dataset.id! };
      paintSelection();
      return true;
  }
  if (!event.metaKey && !event.ctrlKey && event.key.length === 1) clearSelection();
  return false;
}

function deleteSelection(roots: ItemId[]): void {
  const count = roots.reduce((sum, id) => sum + 1 + descendantCount(doc(), id), 0);
  state.selection = null;
  const next = removeAll(doc(), roots);
  commitAndRender(next, focusAfterRemoving(roots, next));
  toast(`Deleted ${count} item${count === 1 ? "" : "s"}`, { label: "Undo", run: undo });
}

/** The nearest rows above and below `roots` that are not inside any of them. */
export function rowsAround(roots: ItemId[]): { before: ItemId | null; after: ItemId | null } {
  const items = roots.map((id) => ui.tree.querySelector(`.item[data-id="${CSS.escape(id)}"]`)).filter(Boolean) as Element[];
  const inside = (editor: HTMLElement) => items.some((item) => item.contains(editor));
  const editors = treeEditors();
  const first = editors.findIndex(inside);
  if (first === -1) return { before: null, after: null };
  const after = editors.slice(first).find((editor) => !inside(editor));
  return { before: editors[first - 1]?.dataset.id ?? null, after: after?.dataset.id ?? null };
}

export function focusAfterRemoving(roots: ItemId[], next: Doc): Focus | null {
  const { before, after } = rowsAround(roots);
  if (before) return { id: before, offset: next.items[before].text.length };
  if (after) return { id: after, offset: 0 };
  return null;
}

export function copyText(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => copyWithTextarea(text));
  } else {
    copyWithTextarea(text);
  }
}

function copyWithTextarea(text: string): void {
  const area = Object.assign(document.createElement("textarea"), { value: text });
  area.style.cssText = "position:fixed;opacity:0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

