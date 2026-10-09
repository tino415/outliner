import {
  ItemId,
  ROOT,
  descendantCount,
  duplicate,
  indent,
  insertChild,
  indexInParent,
  isBlank,
  isDescendant,
  isShown,
  mergeInto,
  moveDown,
  moveTo,
  moveUp,
  newChildIndex,
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
import { itemLabel, plainText, renderInline, renderNote, shortLabel } from "./inline";
import { referenceTo, resolveReference } from "./references";
import { isInCode } from "./notes";
import { isCaretOnFirstLine, isCaretOnLastLine, caretRect, offsetAtPoint, select, selectionIn } from "./caret";
import { graft, parseIndentedText } from "./transfer";
import { bindingFor, bindingForKeys } from "./keys";
import { Focus, commitAndRender, commitShownEdit, doc, filter, state, ui } from "./app";
import { clearSelection, focusAfterRemoving, paintSelection, rowsAround, selectWholePage, startSelection } from "./selection";
import { setQuery, zoomTo } from "./navigation";
import { END, editorFor, focusCaret, itemElementFor, replayAnimation, textEditorFor, titleFor, treeEditors } from "./render";
import { toast, toastWithUndo } from "./chrome";
import { refreshAfterNoteEdit } from "./columns";

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
    if (isNoteEditor(editor)) {
      commitShownEdit(setNote(doc(), id, value), id, caretBeforeInput, `${id}:note`);
    } else {
      commitShownEdit(setText(doc(), id, value), id, caretBeforeInput, id);
      if (id === state.zoom) document.title = titleFor(id);
      editor.classList.toggle("empty", value === "");
    }
    const context = editorContext(editor);
    const before = value.slice(0, context.start);
    if ((event as InputEvent).data === "[" && before.endsWith("[[") && !(context.inNote && isInCode(before))) pickReference(context, 2);
  });

  document.addEventListener("focusout", (event) => {
    if (!editorOf(event.relatedTarget)) {
      ui.toolbar.classList.remove("active");
      clearFocusedRow();
    }
    const editor = editorOf(event.target);
    const item = editor && doc().items[editor.dataset.id!];
    if (!editor || !item) return;
    editor.innerHTML = isNoteEditor(editor) ? renderNote(item.note) : renderInline(item.text);
    if (isNoteEditor(editor)) refreshAfterNoteEdit();
    if (isNoteEditor(editor) && item.note === "") {
      state.openNotes.delete(item.id);
      editor.hidden = true;
    }
  });

  document.addEventListener("focusin", (event) => {
    const editor = editorOf(event.target);
    ui.toolbar.classList.toggle("active", Boolean(editor));
    clearFocusedRow();
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
    const clickedRow = editor && ui.tree.contains(editor) && !isNoteEditor(editor) ? editor : null;
    if (event.shiftKey && clickedRow) {
      const focused = editorOf(document.activeElement);
      if (state.selection) {
        event.preventDefault();
        state.selection = { ...state.selection, head: clickedRow.dataset.id! };
        paintSelection();
        return;
      }
      if (focused && ui.tree.contains(focused) && focused !== clickedRow) {
        event.preventDefault();
        startSelection(focused.dataset.id!, clickedRow.dataset.id!);
        return;
      }
    }
    if (!target.closest("#toolbar, #toast")) clearSelection();
    if (!editor || document.activeElement === editor) return;
    if (target.closest("a.link, .tag, .ref")) event.preventDefault();
    else if (isNoteEditor(editor) && editor.querySelector(".prop-line")) placeCaretBeforeLinesAppear(event, editor);
  });

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const editor = editorOf(target);
    if (!editor || document.activeElement === editor) return;
    const link = target.closest<HTMLAnchorElement>("a.link");
    const tag = target.closest<HTMLElement>(".tag");
    const reference = target.closest<HTMLElement>(".ref");
    if (link) {
      event.preventDefault();
      window.open(link.href, "_blank", "noopener");
    } else if (tag) {
      setQuery(tag.dataset.tag!);
    } else if (reference) {
      followReference(reference.dataset.ref!);
    }
  });

  document.addEventListener("paste", (event) => {
    const editor = editorOf(event.target);
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!editor || isNoteEditor(editor) || !text.includes("\n")) return;
    event.preventDefault();
    pasteLines(editor.dataset.id!, text);
  });

  ui.tree.addEventListener("click", (event) => {
    const toggle = (event.target as HTMLElement).closest<HTMLElement>(".toggle");
    if (toggle) toggleFold(toggle.closest<HTMLElement>(".item")!.dataset.id!);
  });
}

/**
 * Virtual keyboards often report Enter and Backspace as an "Unidentified"
 * keydown, so the key bindings never see them. The input they are about to
 * cause still says what was meant.
 */
const keysMeantBy: Record<string, string> = {
  insertParagraph: "Enter",
  insertLineBreak: "Shift+Enter",
  deleteContentBackward: "Backspace",
};

function handledAsKey(event: InputEvent, editor: HTMLElement): boolean {
  if (insertingText) return false;
  const keys = keysMeantBy[event.inputType];
  const binding = keys ? bindingForKeys(keys, "editor") : null;
  if (!binding) return false;
  const context = editorContext(editor);
  if (event.inputType === "insertLineBreak" && context.inNote) return false;
  return binding.run(context) !== false;
}

let insertingText = false;

/**
 * Types `text` at the caret the way the keyboard would, so it reaches the
 * input handler. Chrome turns a "\n" inside inserted text into a new `<div>`,
 * which `textContent` does not count, so line breaks go in as line breaks;
 * they must not run the Shift-Enter binding on the way.
 */
export function insertText(text: string): void {
  insertingText = true;
  try {
    text.split("\n").forEach((line, index) => {
      if (index > 0) document.execCommand("insertLineBreak");
      if (line) document.execCommand("insertText", false, line);
    });
  } finally {
    insertingText = false;
  }
}

export function editorOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>(".text[data-id], .note[data-id]");
}

function isNoteEditor(editor: HTMLElement): boolean {
  return editor.classList.contains("note");
}

/**
 * Focusing a note reveals property lines the column view hides, which moves
 * the text under the pointer. The caret goes where the click was, measured
 * before anything moves.
 */
function placeCaretBeforeLinesAppear(event: MouseEvent, note: HTMLElement): void {
  const offset = offsetAtPoint(note, event.clientX, event.clientY);
  if (offset === null) return;
  event.preventDefault();
  note.focus({ preventScroll: true });
  select(note, offset);
}

function clearFocusedRow(): void {
  ui.tree.querySelector(".row.focused")?.classList.remove("focused");
}

export interface EditorContext {
  editor: HTMLElement;
  id: ItemId;
  inNote: boolean;
  isTitle: boolean;
  start: number;
  end: number;
  length: number;
  atStart: boolean;
  atEnd: boolean;
}

export function editorContext(editor: HTMLElement): EditorContext {
  const length = (editor.textContent ?? "").length;
  const { start, end } = selectionIn(editor) ?? { start: length, end: length };
  return {
    editor,
    id: editor.dataset.id!,
    inNote: isNoteEditor(editor),
    isTitle: editor === ui.title || editor === ui.titleNote,
    start,
    end,
    length,
    atStart: start === 0 && end === 0,
    atEnd: start === length && end === length,
  };
}

export function caretNow(): Caret | null {
  const editor = editorOf(document.activeElement);
  if (!editor) return null;
  return { id: editor.dataset.id!, offset: selectionIn(editor)?.start ?? 0, inNote: isNoteEditor(editor) };
}

// ---- editing actions ------------------------------------------------------------

type Action = (c: EditorContext) => boolean | void;

/** Actions on a row of the outline; on the page title they do nothing. */
const onItem =
  (run: Action): Action =>
  (c) => {
    if (!c.isTitle) return run(c);
  };

export const actions = {
  enter(c: EditorContext): void {
    if (c.inNote) {
      const before = (c.editor.textContent ?? "").slice(0, c.start);
      const indentation = isInCode(before) ? /[ \t]*/.exec(before.slice(before.lastIndexOf("\n") + 1))![0] : "";
      insertText("\n" + indentation);
      return;
    }
    if (c.isTitle) {
      const created = insertChild(doc(), state.zoom, 0);
      commitAndRender(created.doc, startOf(created.id));
      return;
    }
    let current = doc();
    if (c.end > c.start) {
      const text = current.items[c.id].text;
      current = setText(current, c.id, text.slice(0, c.start) + text.slice(c.end));
    }
    const item = current.items[c.id];
    const isLastEmptyNested =
      isBlank(item) && item.parent !== state.zoom && shownChildren(current, item.parent!, filter()).at(-1) === c.id;
    if (isLastEmptyNested) {
      commitAndRender(outdent(current, c.id, state.zoom), startOf(c.id));
      return;
    }
    const result = split(current, c.id, c.start, filter());
    commitAndRender(result.doc, startOf(result.focus));
  },

  toggleNote(c: EditorContext): void {
    if (c.inNote) {
      focusCaret({ id: c.id, offset: END });
      return;
    }
    state.openNotes.add(c.id);
    const note = editorFor(c.id, "note");
    if (!note) return;
    note.hidden = false;
    focusCaret({ id: c.id, offset: END, inNote: true });
  },

  backspace(c: EditorContext): boolean | void {
    if (!c.atStart || c.isTitle) return false;
    if (c.inNote) {
      if (doc().items[c.id].note !== "") return false;
      actions.toggleNote(c);
      return;
    }
    const previous = neighbourEditor(c.editor, -1);
    if (isBlank(doc().items[c.id])) {
      const target = previous ?? neighbourEditor(c.editor, 1);
      if (target) commitAndRender(remove(doc(), c.id), { id: target.dataset.id!, offset: previous ? END : 0 });
      return;
    }
    if (!previous || previous === ui.title) return;
    const merged = mergeInto(doc(), c.id, previous.dataset.id!);
    commitAndRender(merged.doc, { id: previous.dataset.id!, offset: merged.offset });
  },

  deleteForward(c: EditorContext): boolean | void {
    if (c.inNote || c.isTitle || !c.atEnd) return false;
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

  nextItem(c: EditorContext): boolean | void {
    const next = neighbourEditor(c.editor, 1);
    if (!next) return false;
    focusAtX(next, caretX(c.editor), "top");
  },

  previousItem(c: EditorContext): boolean | void {
    const previous = neighbourEditor(c.editor, -1);
    if (!previous) return false;
    focusAtX(previous, caretX(c.editor), "bottom");
  },

  forwardChar(c: EditorContext): void {
    if (c.atEnd) actions.arrowRight(c);
    else select(c.editor, Math.min(c.end + 1, c.length));
  },

  backwardChar(c: EditorContext): void {
    if (c.atStart) actions.arrowLeft(c);
    else select(c.editor, Math.max(c.start - 1, 0));
  },

  startOfItem(c: EditorContext): void {
    select(c.editor, lineAround(c).start);
  },

  endOfItem(c: EditorContext): void {
    select(c.editor, lineAround(c).end);
  },

  arrowLeft(c: EditorContext): boolean | void {
    if (c.inNote || !c.atStart) return false;
    const previous = neighbourEditor(c.editor, -1);
    if (!previous) return false;
    focusCaret({ id: previous.dataset.id!, offset: END });
  },

  arrowRight(c: EditorContext): boolean | void {
    if (c.inNote || !c.atEnd) return false;
    const next = neighbourEditor(c.editor, 1);
    if (!next) return false;
    focusCaret(startOf(next.dataset.id!));
  },

  indent(c: EditorContext): void {
    if (inCodeBlock(c)) insertText("  ");
    else if (!c.isTitle) commitAndRender(indent(doc(), c.id, filter()), keepCaret(c));
  },

  outdent(c: EditorContext): void {
    if (inCodeBlock(c)) takeBackIndentation(c);
    else if (!c.isTitle) commitAndRender(outdent(doc(), c.id, state.zoom), keepCaret(c));
  },

  codeBlock(c: EditorContext): void {
    if (!c.inNote) actions.toggleNote(c);
    const note = editorFor(c.id, "note");
    if (!note) return;
    const text = note.textContent ?? "";
    const at = c.inNote ? c.end : text.length;
    const lead = at === 0 || text[at - 1] === "\n" ? "" : "\n";
    const trail = at === text.length || text[at] === "\n" ? "" : "\n";
    select(note, at);
    insertText(`${lead}\`\`\`\n\n\`\`\`${trail}`);
    select(note, at + lead.length + 4);
  },

  moveUp: onItem((c) => commitAndRender(moveUp(doc(), c.id, filter()), keepCaret(c))),

  moveDown: onItem((c) => commitAndRender(moveDown(doc(), c.id, filter()), keepCaret(c))),

  complete: onItem((c) => {
    const next = toggleCompleted(doc(), c.id);
    const { before, after } = rowsAround([c.id]);
    commitAndRender(next, [keepCaret(c), ...startsOf(after, before)]);
    if (!isShown(next, c.id, filter())) toastWithUndo("Completed and hidden");
  }),

  duplicate: onItem((c) => {
    const result = duplicate(doc(), c.id);
    commitAndRender(result.doc, { id: result.id, offset: c.start });
  }),

  deleteItem: onItem((c) => {
    const item = doc().items[c.id];
    const hidden = descendantCount(doc(), c.id);
    commitAndRender(remove(doc(), c.id), focusAfterRemoving([c.id]));
    const label = item.text.trim() ? `“${shortLabel(item.text, 32)}”` : "Item";
    toastWithUndo(hidden > 0 ? `${label} and ${hidden} more deleted` : `${label} deleted`);
  }),

  collapse: onItem((c) => {
    if (!state.results) commitAndRender(setCollapsed(doc(), c.id, true), keepCaret(c));
  }),

  expand: onItem((c) => {
    if (state.results) return;
    commitAndRender(setCollapsed(doc(), c.id, false), keepCaret(c));
    animateOpening(c.id);
  }),

  toggleFold: onItem((c) => {
    if (doc().items[c.id].children.length > 0) toggleFold(c.id);
  }),

  newFirstChild(c: EditorContext): void {
    const created = insertChild(doc(), c.id, 0);
    commitAndRender(created.doc, startOf(created.id));
  },

  upToParent: onItem((c) => {
    if (c.inNote) focusCaret({ id: c.id, offset: 0 });
    else focusCaret({ id: doc().items[c.id].parent ?? state.zoom, offset: 0 });
  }),

  zoomIn: onItem((c) => zoomTo(c.id, { id: c.id, offset: c.start })),

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

  insertReference(c: EditorContext): void {
    pickReference(c, 0);
  },

  addTag(c: EditorContext): void {
    const text = c.editor.textContent ?? "";
    select(c.editor, c.length);
    insertText(text === "" || /\s$/.test(text) ? "#" : " #");
  },

  blur(c: EditorContext): void {
    c.editor.blur();
  },

  moveToPicker: onItem((c) => {
    const id = c.id;
    const { before, after } = rowsAround([id]);
    const home: Candidate = { id: ROOT, text: doc().items[ROOT].text || "Home", path: [] };
    openPalette({
      placeholder: `Move “${itemLabel(doc().items[id].text, 30)}” to…`,
      hint: "It goes under the item you choose, last or where the page files new items",
      candidates: (query) => {
        const found = findItems(doc(), query, 40, (other) => other === id || isDescendant(doc(), other, id));
        const homeMatches = !query.trim() || home.text.toLowerCase().includes(query.trim().toLowerCase());
        return homeMatches ? [home, ...found] : found;
      },
      choose: (target) => {
        commitAndRender(moveTo(doc(), id, target.id, newChildIndex(doc(), target.id)), startsOf(id, before, after));
        toast(`Moved to “${shortLabel(target.text, 30)}”`, { label: "Go there", run: () => zoomTo(target.id, startOf(id)) });
      },
    });
  }),

  selectUp(c: EditorContext): boolean | void {
    if (c.inNote || c.isTitle || c.start !== 0 || !isCaretOnFirstLine(c.editor)) return false;
    const previous = neighbourEditor(c.editor, -1);
    startSelection(c.id, previous && previous !== ui.title ? previous.dataset.id! : c.id);
  },

  selectAll(c: EditorContext): boolean | void {
    const wholeTextSelected = c.start === 0 && c.end === c.length;
    if (c.inNote || c.isTitle || !wholeTextSelected) return false;
    selectWholePage();
  },

  selectDown(c: EditorContext): boolean | void {
    if (c.inNote || c.isTitle || c.end !== c.length || !isCaretOnLastLine(c.editor)) return false;
    startSelection(c.id, neighbourEditor(c.editor, 1)?.dataset.id ?? c.id);
  },
};

/** Picks an item and writes a reference to it at the caret, over the `typed` characters before it (the "[[" that asked). */
function pickReference(c: EditorContext, typed: number): void {
  const { editor, start, end } = c;
  openPalette({
    placeholder: "Link to…",
    hint: "The link keeps working when the item is renamed",
    candidates: (query) => findItems(doc(), query, 40, (id) => id === c.id),
    choose: (target) => {
      editor.focus();
      select(editor, start - typed, end);
      insertText(referenceTo(target.id, plainText(target.text)));
    },
  });
}

function followReference(target: string): void {
  const id = resolveReference(doc(), target);
  if (id) zoomTo(id);
  else toast(`Nothing called “${target}” yet`);
}

function inCodeBlock(c: EditorContext): boolean {
  return c.inNote && isInCode((c.editor.textContent ?? "").slice(0, c.start));
}

/** The line the caret is on: in a note one line of it, in item text the whole text. */
function lineAround(c: EditorContext): { start: number; end: number } {
  const text = c.editor.textContent ?? "";
  if (!c.inNote) return { start: 0, end: text.length };
  const end = text.indexOf("\n", c.start);
  return { start: text.lastIndexOf("\n", c.start - 1) + 1, end: end === -1 ? text.length : end };
}

function takeBackIndentation(c: EditorContext): void {
  const { start } = lineAround(c);
  const spaces = /^ {1,2}/.exec((c.editor.textContent ?? "").slice(start))?.[0].length ?? 0;
  if (spaces === 0) return;
  select(c.editor, start, start + spaces);
  document.execCommand("delete");
  select(c.editor, Math.max(start, c.start - spaces));
}

function keepCaret(c: EditorContext): Focus {
  return { id: c.id, offset: c.start, inNote: c.inNote };
}

function startOf(id: ItemId): Focus {
  return { id, offset: 0 };
}

function startsOf(...ids: (ItemId | null)[]): Focus[] {
  return ids.filter((id): id is ItemId => id !== null).map(startOf);
}

function wrapSelection(c: EditorContext, marker: string): void {
  const text = c.editor.textContent ?? "";
  const next = text.slice(0, c.start) + marker + text.slice(c.start, c.end) + marker + text.slice(c.end);
  commitShownEdit(c.inNote ? setNote(doc(), c.id, next) : setText(doc(), c.id, next), c.id, caretNow());
  c.editor.textContent = next;
  select(c.editor, c.start + marker.length, c.end + marker.length);
}

/** Lines pasted into an item go after it (replacing it if empty); into the page title, to the top of the page. */
function pasteLines(id: ItemId, text: string): void {
  const item = doc().items[id];
  const intoTitle = id === state.zoom;
  const replacesEmptyItem = !intoTitle && isBlank(item);
  const parent = intoTitle ? id : item.parent!;
  const at = intoTitle ? 0 : indexInParent(doc(), id) + (replacesEmptyItem ? 0 : 1);
  const result = graft(doc(), parseIndentedText(text), parent, at);
  const next = replacesEmptyItem ? remove(result.doc, id) : result.doc;
  const last = result.ids.at(-1);
  commitAndRender(next, last ? { id: last, offset: END } : null);
}

function toggleFold(id: ItemId): void {
  if (state.results) return;
  const opening = doc().items[id].collapsed;
  commitAndRender(setCollapsed(doc(), id, !opening), caretNow());
  if (opening) animateOpening(id);
}

function animateOpening(id: ItemId): void {
  const children = itemElementFor(id)?.querySelector(":scope > .children");
  if (children) replayAnimation(children, "opening");
}

function neighbourEditor(editor: HTMLElement, direction: -1 | 1): HTMLElement | null {
  const editors = [ui.title, ...treeEditors()];
  const textEditor = isNoteEditor(editor) ? (textEditorFor(editor.dataset.id!) ?? editor) : editor;
  return editors[editors.indexOf(textEditor) + direction] ?? null;
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
