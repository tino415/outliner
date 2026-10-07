import {
  ItemId,
  ROOT,
  descendantCount,
  duplicate,
  indent,
  insertChild,
  indexInParent,
  isDescendant,
  isShown,
  mergeInto,
  moveDown,
  moveTo,
  moveUp,
  outdent,
  remove,
  setCollapsed,
  setNote,
  setText,
  shownChildren,
  split,
  toggleCompleted,
} from "./model";
import { Caret } from "./store";
import { Candidate, findItems } from "./search";
import { openPalette } from "./palette";
import { renderInline } from "./inline";
import { isCaretOnFirstLine, isCaretOnLastLine, caretRect, offsetAtPoint, select, selectionIn } from "./caret";
import { graft, parseIndentedText } from "./transfer";
import { bindingFor } from "./keys";
import { Focus, commit, commitAndRender, doc, filter, state, ui, undo, redo } from "./app";
import { clearSelection, paintSelection, rowsAround, focusAfterRemoving, startSelection } from "./selection";
import { setQuery, zoomTo } from "./navigation";
import { focusCaret, noteEditorFor, rowShowsTypedText, textEditorFor, titleFor } from "./render";
import { shortLabel, toast } from "./chrome";

// ---- editor events ----------------------------------------------------------

export function bindEditorEvents(): void {
  let caretBeforeInput: Caret | null = null;

  document.addEventListener("beforeinput", (event) => {
    const editor = editorOf(event.target);
    if (!editor) return;
    caretBeforeInput = caretNow();
    if (handledAsKey(event, editor)) event.preventDefault();
  });

  document.addEventListener("input", (event) => {
    const editor = editorOf(event.target);
    if (!editor) return;
    const id = editor.dataset.id!;
    const value = editor.textContent ?? "";
    if (editor.classList.contains("note")) {
      commit(setNote(doc(), id, value), `${id}:note`, caretBeforeInput);
    } else {
      commit(setText(doc(), id, value), id, caretBeforeInput);
      if (id === state.zoom) document.title = titleFor(id);
      editor.classList.toggle("empty", value === "");
    }
    rowShowsTypedText(id);
    if (state.query) state.keptInResults.add(id);
  });

  document.addEventListener("focusout", (event) => {
    if (!editorOf(event.relatedTarget)) {
      ui.toolbar.classList.remove("active");
      document.querySelectorAll(".row.focused").forEach((row) => row.classList.remove("focused"));
    }
    const editor = editorOf(event.target);
    if (!editor || !doc().items[editor.dataset.id!]) return;
    const item = doc().items[editor.dataset.id!];
    const isNote = editor.classList.contains("note");
    editor.innerHTML = renderInline(isNote ? item.note : item.text);
    if (isNote && item.note === "") {
      state.openNotes.delete(item.id);
      editor.hidden = true;
    }
  });

  document.addEventListener("focusin", (event) => {
    const editor = editorOf(event.target);
    ui.toolbar.classList.toggle("active", Boolean(editor));
    document.querySelectorAll(".row.focused").forEach((row) => row.classList.remove("focused"));
    editor?.closest(".row")?.classList.add("focused");
  });

  document.addEventListener("keydown", (event) => {
    const editor = editorOf(event.target);
    if (!editor || event.isComposing) return;
    const binding = bindingFor(event, "editor");
    if (binding && binding.run(editorContext(editor)) !== false) event.preventDefault();
  });

  document.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement;
    const editor = editorOf(target);
    const focused = editorOf(document.activeElement);
    const clickedItem = editor && ui.tree.contains(editor) && !editor.classList.contains("note");
    if (event.shiftKey && clickedItem && state.selection) {
      event.preventDefault();
      state.selection = { ...state.selection, head: editor.dataset.id! };
      paintSelection();
      return;
    }
    const inTree = editor && ui.tree.contains(editor) && focused && ui.tree.contains(focused);
    if (event.shiftKey && inTree && focused !== editor && !editor.classList.contains("note")) {
      event.preventDefault();
      startSelection(focused.dataset.id!, editor.dataset.id!);
      return;
    }
    if (!target.closest("#toolbar, #toast")) clearSelection();
    if (!editor || document.activeElement === editor) return;
    if (target.closest("a.link, .tag")) event.preventDefault();
  });

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const editor = editorOf(target);
    if (!editor || document.activeElement === editor) return;
    const link = target.closest<HTMLAnchorElement>("a.link");
    const tag = target.closest<HTMLElement>(".tag");
    if (link) {
      event.preventDefault();
      window.open(link.href, "_blank", "noopener");
    } else if (tag) {
      setQuery(tag.dataset.tag!);
    }
  });

  document.addEventListener("paste", (event) => {
    const editor = editorOf(event.target);
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!editor || editor.classList.contains("note") || !text.includes("\n")) return;
    event.preventDefault();
    pasteLines(editor.dataset.id!, text);
  });

  ui.tree.addEventListener("click", (event) => {
    const toggle = (event.target as HTMLElement).closest<HTMLElement>(".toggle");
    if (!toggle) return;
    const id = toggle.closest<HTMLElement>(".item")!.dataset.id!;
    toggleFold(id);
  });
}

/**
 * Virtual keyboards often report Enter and Backspace as an "Unidentified"
 * keydown, so the key bindings never see them. The input they are about to
 * cause still says what was meant.
 */
function handledAsKey(event: InputEvent, editor: HTMLElement): boolean {
  const fake = (key: string, shiftKey = false) => ({ key, code: "", shiftKey, ctrlKey: false, metaKey: false, altKey: false }) as KeyboardEvent;
  const intent: Record<string, KeyboardEvent> = {
    insertParagraph: fake("Enter"),
    insertLineBreak: fake("Enter", true),
    deleteContentBackward: fake("Backspace"),
  };
  const key = intent[event.inputType];
  if (!key) return false;
  const binding = bindingFor(key, "editor");
  if (!binding) return false;
  const context = editorContext(editor);
  if (event.inputType === "insertLineBreak" && context.inNote) return false;
  return binding.run(context) !== false;
}

export function editorOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>(".text[data-id], .note[data-id]");
}

export interface EditorContext {
  editor: HTMLElement;
  id: ItemId;
  inNote: boolean;
  isTitle: boolean;
  start: number;
  end: number;
}

export function editorContext(editor: HTMLElement): EditorContext {
  const length = (editor.textContent ?? "").length;
  const selection = selectionIn(editor) ?? { start: length, end: length };
  return {
    editor,
    id: editor.dataset.id!,
    inNote: editor.classList.contains("note"),
    isTitle: editor === ui.title || editor === ui.titleNote,
    start: selection.start,
    end: selection.end,
  };
}

export function caretNow(): Caret | null {
  const editor = editorOf(document.activeElement);
  if (!editor) return null;
  return {
    id: editor.dataset.id!,
    offset: selectionIn(editor)?.start ?? 0,
    inNote: editor.classList.contains("note"),
  };
}

// ---- editing actions ------------------------------------------------------------

export const actions = {
  enter(c: EditorContext): boolean | void {
    if (c.inNote) {
      document.execCommand("insertText", false, "\n");
      return;
    }
    if (c.isTitle) {
      const created = insertChild(doc(), state.zoom, 0);
      commitAndRender(created.doc, { id: created.id, offset: 0 });
      return;
    }
    let current = doc();
    if (c.end > c.start) {
      const text = current.items[c.id].text;
      current = setText(current, c.id, text.slice(0, c.start) + text.slice(c.end));
    }
    const item = current.items[c.id];
    const siblings = shownChildren(current, item.parent!, filter());
    const isLastEmptyNested =
      item.text === "" && item.children.length === 0 && item.parent !== state.zoom && siblings.at(-1) === c.id;
    if (isLastEmptyNested) {
      commitAndRender(outdent(current, c.id, state.zoom), { id: c.id, offset: 0 });
      return;
    }
    const result = split(current, c.id, c.start, filter());
    commitAndRender(result.doc, { id: result.focus, offset: 0 });
  },

  toggleNote(c: EditorContext): void {
    if (c.inNote) {
      focusCaret({ id: c.id, offset: doc().items[c.id].text.length });
      return;
    }
    state.openNotes.add(c.id);
    const note = noteEditorFor(c.id);
    if (!note) return;
    note.hidden = false;
    focusCaret({ id: c.id, offset: doc().items[c.id].note.length, inNote: true });
  },

  backspace(c: EditorContext): boolean | void {
    if (c.start !== 0 || c.end !== 0 || c.isTitle) return false;
    if (c.inNote) {
      if (doc().items[c.id].note !== "") return false;
      actions.toggleNote(c);
      return;
    }
    const item = doc().items[c.id];
    const previous = neighbourEditor(c.editor, -1);
    if (item.text === "" && item.children.length === 0 && item.note === "") {
      if (!previous && !neighbourEditor(c.editor, 1)) return;
      const next = remove(doc(), c.id);
      const target = previous ?? neighbourEditor(c.editor, 1)!;
      const targetId = target.dataset.id!;
      commitAndRender(next, { id: targetId, offset: previous ? next.items[targetId].text.length : 0 });
      return;
    }
    if (!previous || previous === ui.title) return;
    const merged = mergeInto(doc(), c.id, previous.dataset.id!);
    commitAndRender(merged.doc, { id: previous.dataset.id!, offset: merged.offset });
  },

  deleteForward(c: EditorContext): boolean | void {
    const length = (c.editor.textContent ?? "").length;
    if (c.inNote || c.isTitle || c.start !== length || c.end !== length) return false;
    const next = neighbourEditor(c.editor, 1);
    if (!next) return;
    const merged = mergeInto(doc(), next.dataset.id!, c.id);
    commitAndRender(merged.doc, { id: c.id, offset: merged.offset });
  },

  arrowUp(c: EditorContext): boolean | void {
    if (c.inNote || !isCaretOnFirstLine(c.editor)) return false;
    const previous = neighbourEditor(c.editor, -1);
    if (!previous) return false;
    focusAtX(previous, caretX(c.editor), "bottom");
  },

  arrowDown(c: EditorContext): boolean | void {
    if (c.inNote || !isCaretOnLastLine(c.editor)) return false;
    const next = neighbourEditor(c.editor, 1);
    if (!next) return false;
    focusAtX(next, caretX(c.editor), "top");
  },

  arrowLeft(c: EditorContext): boolean | void {
    if (c.inNote || c.start !== 0 || c.end !== 0) return false;
    const previous = neighbourEditor(c.editor, -1);
    if (!previous) return false;
    focusCaret({ id: previous.dataset.id!, offset: (previous.textContent ?? "").length });
  },

  arrowRight(c: EditorContext): boolean | void {
    const length = (c.editor.textContent ?? "").length;
    if (c.inNote || c.start !== length || c.end !== length) return false;
    const next = neighbourEditor(c.editor, 1);
    if (!next) return false;
    focusCaret({ id: next.dataset.id!, offset: 0 });
  },

  indent(c: EditorContext): void {
    if (c.isTitle) return;
    commitAndRender(indent(doc(), c.id, filter()), keepCaret(c));
  },

  outdent(c: EditorContext): void {
    if (c.isTitle) return;
    commitAndRender(outdent(doc(), c.id, state.zoom), keepCaret(c));
  },

  moveUp(c: EditorContext): void {
    if (c.isTitle) return;
    commitAndRender(moveUp(doc(), c.id, filter()), keepCaret(c));
  },

  moveDown(c: EditorContext): void {
    if (c.isTitle) return;
    commitAndRender(moveDown(doc(), c.id, filter()), keepCaret(c));
  },

  complete(c: EditorContext): void {
    if (c.isTitle) return;
    const next = toggleCompleted(doc(), c.id);
    if (isShown(next, c.id, filter())) {
      commitAndRender(next, keepCaret(c));
      return;
    }
    const around = rowsAround([c.id]);
    const neighbour = around.after ?? around.before;
    commitAndRender(next, neighbour ? { id: neighbour, offset: 0 } : null);
    toast("Completed and hidden", { label: "Undo", run: undo });
  },

  duplicate(c: EditorContext): void {
    if (c.isTitle) return;
    const result = duplicate(doc(), c.id);
    commitAndRender(result.doc, { id: result.id, offset: c.start });
  },

  deleteItem(c: EditorContext): void {
    if (c.isTitle) return;
    const item = doc().items[c.id];
    const hidden = descendantCount(doc(), c.id);
    const next = remove(doc(), c.id);
    commitAndRender(next, focusAfterRemoving([c.id], next));
    const label = item.text.trim() ? `“${shortLabel(item.text, 32)}”` : "Item";
    toast(hidden > 0 ? `${label} and ${hidden} more deleted` : `${label} deleted`, { label: "Undo", run: undo });
  },

  collapse(c: EditorContext): void {
    if (c.isTitle || state.results) return;
    commitAndRender(setCollapsed(doc(), c.id, true), keepCaret(c));
  },

  expand(c: EditorContext): void {
    if (c.isTitle || state.results) return;
    commitAndRender(setCollapsed(doc(), c.id, false), keepCaret(c));
    animateOpening(c.id);
  },

  zoomIn(c: EditorContext): void {
    if (c.isTitle) return;
    zoomTo(c.id, { id: c.id, offset: c.start });
  },

  zoomOut(c: EditorContext): void {
    if (state.zoom === ROOT) return;
    const former = state.zoom;
    zoomTo(doc().items[former].parent ?? ROOT, { id: former, offset: c.isTitle ? c.start : 0 });
  },

  bold(c: EditorContext): void {
    wrapSelection(c, "**");
  },

  italic(c: EditorContext): void {
    wrapSelection(c, "*");
  },

  code(c: EditorContext): void {
    wrapSelection(c, "`");
  },

  blur(c: EditorContext): void {
    c.editor.blur();
  },

  moveToPicker(c: EditorContext): void {
    if (c.isTitle) return;
    const id = c.id;
    const around = rowsAround([id]);
    const home: Candidate = { id: ROOT, text: doc().items[ROOT].text || "Home", path: [] };
    openPalette({
      placeholder: `Move “${shortLabel(doc().items[id].text, 30) || "Untitled"}” to…`,
      hint: "It goes to the end of the item you choose",
      candidates: (query) => {
        const found = findItems(doc(), query, 40, (other) => other === id || isDescendant(doc(), other, id));
        const homeMatches = !query.trim() || home.text.toLowerCase().includes(query.trim().toLowerCase());
        return homeMatches ? [home, ...found] : found;
      },
      choose: (target) => {
        commitAndRender(moveTo(doc(), id, target.id, doc().items[target.id].children.length), null);
        const focus = [id, around.before, around.after].find((candidate) => candidate && textEditorFor(candidate));
        if (focus) focusCaret({ id: focus, offset: 0 });
        toast(`Moved to “${shortLabel(target.text, 30)}”`, { label: "Go there", run: () => zoomTo(target.id, { id, offset: 0 }) });
      },
    });
  },

  selectUp(c: EditorContext): boolean | void {
    if (c.inNote || c.isTitle || c.start !== 0 || !isCaretOnFirstLine(c.editor)) return false;
    const previous = neighbourEditor(c.editor, -1);
    startSelection(c.id, previous && previous !== ui.title ? previous.dataset.id! : c.id);
  },

  selectDown(c: EditorContext): boolean | void {
    const length = (c.editor.textContent ?? "").length;
    if (c.inNote || c.isTitle || c.end !== length || !isCaretOnLastLine(c.editor)) return false;
    startSelection(c.id, neighbourEditor(c.editor, 1)?.dataset.id ?? c.id);
  },

  undo(): void {
    undo();
  },

  redo(): void {
    redo();
  },
};

function keepCaret(c: EditorContext): Focus {
  return { id: c.id, offset: c.start, inNote: c.inNote };
}

function wrapSelection(c: EditorContext, marker: string): void {
  const text = c.editor.textContent ?? "";
  const selected = text.slice(c.start, c.end);
  const next = text.slice(0, c.start) + marker + selected + marker + text.slice(c.end);
  const update = c.inNote ? setNote(doc(), c.id, next) : setText(doc(), c.id, next);
  commit(update);
  c.editor.textContent = next;
  rowShowsTypedText(c.id);
  select(c.editor, c.start + marker.length, c.end + marker.length);
}

/** Lines pasted into an item go after it (replacing it if empty); into the page title, to the top of the page. */
function pasteLines(id: ItemId, text: string): void {
  const item = doc().items[id];
  const incoming = parseIndentedText(text);
  const intoTitle = id === state.zoom;
  const replacesEmptyItem = !intoTitle && item.text === "" && item.children.length === 0 && item.note === "";
  const parent = intoTitle ? id : item.parent!;
  const at = intoTitle ? 0 : indexInParent(doc(), id) + (replacesEmptyItem ? 0 : 1);
  const result = graft(doc(), incoming, parent, at);
  const next = replacesEmptyItem ? remove(result.doc, id) : result.doc;
  const last = result.ids.at(-1);
  commitAndRender(next, last ? { id: last, offset: next.items[last].text.length } : null);
}

function toggleFold(id: ItemId): void {
  if (state.results) return;
  const opening = doc().items[id].collapsed;
  commitAndRender(setCollapsed(doc(), id, !opening), caretNow());
  if (opening) animateOpening(id);
}

function animateOpening(id: ItemId): void {
  ui.tree.querySelector(`.item[data-id="${CSS.escape(id)}"] > .children`)?.classList.add("opening");
}

function neighbourEditor(editor: HTMLElement, direction: -1 | 1): HTMLElement | null {
  const editors = [ui.title, ...ui.tree.querySelectorAll<HTMLElement>(".text[data-id]")];
  const textEditor = editor.classList.contains("note") ? textEditorFor(editor.dataset.id!) ?? editor : editor;
  const index = editors.indexOf(textEditor);
  return editors[index + direction] ?? null;
}

function caretX(editor: HTMLElement): number {
  return caretRect()?.left ?? editor.getBoundingClientRect().left;
}

function focusAtX(editor: HTMLElement, x: number, edge: "top" | "bottom"): void {
  editor.focus({ preventScroll: true });
  const rect = editor.getBoundingClientRect();
  const y = edge === "top" ? rect.top + 6 : rect.bottom - 6;
  const length = (editor.textContent ?? "").length;
  const offset = offsetAtPoint(editor, x, y) ?? (edge === "top" ? 0 : length);
  select(editor, Math.min(offset, length));
  editor.scrollIntoView({ block: "nearest" });
}

