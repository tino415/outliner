import {
  Doc,
  Item,
  ItemId,
  ROOT,
  ViewFilter,
  ancestors,
  completeAll,
  descendantCount,
  duplicate,
  indent,
  indentAll,
  insertChild,
  indexInParent,
  isDescendant,
  isShown,
  moveTo,
  mergeInto,
  moveDown,
  moveUp,
  moveAllDown,
  moveAllUp,
  outdent,
  outdentAll,
  remove,
  removeAll,
  removeCompleted,
  selectionRoots,
  setCollapsed,
  setCollapsedEverywhere,
  setNote,
  setText,
  shownChildren,
  split,
  toggleCompleted,
} from "./model";
import { Caret, History } from "./store";
import { Prefs, discardPendingSave, flushSave, loadDoc, loadPrefs, onDocChangedInAnotherTab, onSaveFailed, savePrefs, saveDocSoon } from "./storage";
import { Candidate, SearchResult, findItems, pathOf, search } from "./search";
import { openPalette } from "./palette";
import { escape, plainText, renderInline } from "./inline";
import { isCaretOnFirstLine, isCaretOnLastLine, caretRect, offsetAtPoint, select, selectionIn } from "./caret";
import { download, exportJson, exportMarkdown, exportOpml, graft, importText, parseIndentedText, subtreesAsText } from "./transfer";
import { welcomeDoc } from "./welcome";
import { bindingFor, describeKeys, keyString } from "./keys";
import { isMac } from "./platform";
import { enableBulletHandles } from "./bullets";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  crumbs: $("crumbs"),
  title: $("title"),
  titleNote: $("title-note"),
  tree: $<HTMLUListElement>("tree"),
  addItem: $<HTMLButtonElement>("add-item"),
  search: $<HTMLInputElement>("search"),
  searchSummary: $("search-summary"),
  menu: $("menu"),
  completedSwitch: $("completed-switch"),
  importFile: $<HTMLInputElement>("import-file"),
  toolbar: $("toolbar"),
  help: $<HTMLDialogElement>("help"),
  helpGrid: $("help-grid"),
  toast: $("toast"),
};

const state = {
  history: new History(loadDoc() ?? welcomeDoc()),
  prefs: loadPrefs(),
  zoom: ROOT as ItemId,
  query: "",
  results: null as SearchResult | null,
  openNotes: new Set<ItemId>(),
  selection: null as { anchor: ItemId; head: ItemId } | null,
  recent: [] as ItemId[],
  keptInResults: new Set<ItemId>(),
};

const doc = (): Doc => state.history.doc;
const filter = (): ViewFilter => ({ showCompleted: state.prefs.showCompleted });

export function start(): void {
  state.zoom = zoomFromHash();
  applyAppearance();
  bindEditorEvents();
  bindChrome();
  bindGlobalKeys();
  bindItemMenu();
  enableBulletHandles(ui.tree, {
    doc,
    zoomInto: (id) => zoomTo(id),
    move: (next, id) => commitAndRender(next, { id, offset: 0, selectNone: true }),
    openMenu: openItemMenu,
  });
  onDocChangedInAnotherTab((incoming) => {
    const caret = caretNow();
    discardPendingSave();
    state.history.replaceFromElsewhere(incoming);
    if (!incoming.items[state.zoom]) zoomTo(ROOT);
    else render(caret && incoming.items[caret.id] ? caret : null);
  });
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushSave());
  onSaveFailed(() => toast("Could not save: browser storage is full. Export a backup from the menu."));
  render(null);
  saveDocSoon(doc());
  navigator.storage?.persist?.().catch(() => undefined);
}

// ---- changing the document ------------------------------------------------

interface Focus extends Caret {
  selectNone?: boolean;
}

function commit(next: Doc, typingKey: string | null = null, caretBefore = caretNow()): void {
  state.history.commit(next, caretBefore, typingKey);
  saveDocSoon(next);
}

function commitAndRender(next: Doc, focus: Focus | null): void {
  if (next === doc()) return;
  commit(next);
  render(focus);
}

function undo(): void {
  const caret = state.history.undo(caretNow());
  if (caret === undefined) return;
  afterHistoryJump(caret);
}

function redo(): void {
  const caret = state.history.redo(caretNow());
  if (caret === undefined) return;
  afterHistoryJump(caret);
}

function afterHistoryJump(caret: Caret | null): void {
  saveDocSoon(doc());
  if (caret && !doc().items[caret.id]) caret = null;
  if (!doc().items[state.zoom]) zoomTo(ROOT, caret && isUnder(caret.id, ROOT) ? caret : null);
  else if (caret && !isOnPage(caret.id)) zoomTo(doc().items[caret.id].parent ?? ROOT, caret);
  else render(caret);
}

function isUnder(id: ItemId, top: ItemId): boolean {
  return id === top || ancestors(doc(), id).includes(top);
}

function isOnPage(id: ItemId): boolean {
  return isUnder(id, state.zoom);
}

// ---- editor events ----------------------------------------------------------

function bindEditorEvents(): void {
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

function editorOf(target: EventTarget | null): HTMLElement | null {
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

function editorContext(editor: HTMLElement): EditorContext {
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

function caretNow(): Caret | null {
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
    if (c.isTitle) return;
    commitAndRender(setCollapsed(doc(), c.id, true), keepCaret(c));
  },

  expand(c: EditorContext): void {
    if (c.isTitle) return;
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

function jumpToItem(): void {
  const recent = (): Candidate[] =>
    state.recent
      .filter((id) => doc().items[id])
      .map((id) => ({ id, text: doc().items[id].text, path: pathOf(doc(), id) }));
  openPalette({
    placeholder: "Jump to…",
    hint: "↑ ↓ to choose · Enter to open · Esc to close",
    candidates: (query) => {
      if (query.trim()) return findItems(doc(), query, 40);
      const seen = new Set(state.recent);
      return [...recent(), ...findItems(doc(), "", 30, (id) => seen.has(id))];
    },
    choose: (candidate) => zoomTo(candidate.id),
  });
}

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

function startSelection(anchor: ItemId, head: ItemId): void {
  editorOf(document.activeElement)?.blur();
  state.selection = { anchor, head };
  paintSelection();
}

function clearSelection(): void {
  if (!state.selection) return;
  state.selection = null;
  paintSelection();
}

function paintSelection(): void {
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
function handleSelectionKey(event: KeyboardEvent): boolean {
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
function rowsAround(roots: ItemId[]): { before: ItemId | null; after: ItemId | null } {
  const items = roots.map((id) => ui.tree.querySelector(`.item[data-id="${CSS.escape(id)}"]`)).filter(Boolean) as Element[];
  const inside = (editor: HTMLElement) => items.some((item) => item.contains(editor));
  const editors = treeEditors();
  const first = editors.findIndex(inside);
  if (first === -1) return { before: null, after: null };
  const after = editors.slice(first).find((editor) => !inside(editor));
  return { before: editors[first - 1]?.dataset.id ?? null, after: after?.dataset.id ?? null };
}

function focusAfterRemoving(roots: ItemId[], next: Doc): Focus | null {
  const { before, after } = rowsAround(roots);
  if (before) return { id: before, offset: next.items[before].text.length };
  if (after) return { id: after, offset: 0 };
  return null;
}

function copyText(text: string): void {
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

// ---- zoom and search ------------------------------------------------------------

function zoomFromHash(): ItemId {
  let id = "";
  try {
    id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  } catch {
    return ROOT;
  }
  return id && doc().items[id] ? id : ROOT;
}

let pendingZoomFocus: Focus | null = null;

function zoomTo(id: ItemId, focus: Focus | null = null): void {
  pendingZoomFocus = focus;
  const hash = id === ROOT ? "#/" : `#/${encodeURIComponent(id)}`;
  if (location.hash === hash || (id === ROOT && location.hash === "")) {
    showZoom();
  } else {
    location.hash = hash;
  }
}

function showZoom(): void {
  const focus = pendingZoomFocus;
  pendingZoomFocus = null;
  const changed = state.zoom !== zoomFromHash();
  state.zoom = zoomFromHash();
  if (changed && state.query) clearQuery();
  if (changed && state.zoom !== ROOT) state.recent = [state.zoom, ...state.recent.filter((id) => id !== state.zoom)].slice(0, 8);
  render(focus);
  if (changed) {
    ui.tree.classList.remove("entering");
    void ui.tree.offsetWidth;
    ui.tree.classList.add("entering");
    if (!focus) window.scrollTo({ top: 0 });
  }
}

function setQuery(query: string): void {
  changeQuery(query);
  render(null);
}

function clearQuery(): void {
  changeQuery("");
  state.results = null;
}

function changeQuery(query: string): void {
  state.query = query;
  if (ui.search.value !== query) ui.search.value = query;
  state.keptInResults.clear();
}

/**
 * Search results, plus every item edited while this query is active, so that
 * an item does not vanish under the caret because it stopped matching.
 */
function searchResults(focus: Focus | null): SearchResult | null {
  if (!state.query.trim()) return null;
  if (focus && focus.id !== state.zoom) state.keptInResults.add(focus.id);
  const results = search(doc(), state.zoom, state.query, filter());
  for (const id of state.keptInResults) {
    if (!doc().items[id] || !isUnder(id, state.zoom)) continue;
    for (const shown of [id, ...ancestors(doc(), id)]) if (shown !== state.zoom && isUnder(shown, state.zoom)) results.shown.add(shown);
  }
  return results;
}

// ---- rendering ------------------------------------------------------------------

function render(focus: Focus | null): void {
  state.results = searchResults(focus);
  const started = performance.now();
  renderCrumbs();
  renderHead();
  renderTree();
  renderSearchSummary();
  renderMenuState();
  highlightMatches();
  paintSelection();
  if (focus) focusCaret(focus);
  performance.measure("render", { start: started });
}

function renderCrumbs(): void {
  const trail = ancestors(doc(), state.zoom);
  const parts = trail.map((id) =>
    id === ROOT
      ? `<a class="crumb home" href="#/" aria-label="Home"><svg viewBox="0 0 20 20"><path d="M3.5 9.5L10 4l6.5 5.5M5.5 8v7.5h9V8" /></svg></a>`
      : `<a class="crumb" href="#/${encodeURIComponent(id)}">${escape(shortLabel(doc().items[id].text, 28)) || "Untitled"}</a>`,
  );
  ui.crumbs.innerHTML = parts.join(`<span class="crumb-sep" aria-hidden="true">/</span>`);
  ui.crumbs.classList.toggle("at-home", trail.length === 0);
  if (trail.length === 0) ui.crumbs.innerHTML = `<span class="brand"><span class="brand-dot"></span>Outliner</span>`;
}

function renderHead(): void {
  const item = doc().items[state.zoom];
  ui.title.dataset.id = item.id;
  ui.titleNote.dataset.id = item.id;
  if (document.activeElement !== ui.title || ui.title.textContent !== item.text) ui.title.innerHTML = renderInline(item.text);
  ui.title.classList.toggle("empty", item.text === "");
  if (document.activeElement !== ui.titleNote || ui.titleNote.textContent !== item.note) ui.titleNote.innerHTML = renderInline(item.note);
  ui.titleNote.hidden = item.note === "" && !state.openNotes.has(item.id);
  document.title = titleFor(item.id);
}

function titleFor(id: ItemId): string {
  const text = doc().items[id].text.trim();
  return text ? `${shortLabel(text, 40)} · Outliner` : "Outliner";
}

/*
 * Rows are kept between renders, keyed by item id. Items are immutable, so a
 * row whose item object and display state are unchanged is reused as is;
 * only changed rows are rebuilt and only moved rows are moved.
 */
interface RenderedRow {
  item: Item;
  state: string;
  li: HTMLLIElement;
}

const renderedRows = new Map<ItemId, RenderedRow>();
let rowsSeen = new Set<ItemId>();

/** Typing changes a row's DOM without a render; the row now shows the current item. */
function rowShowsTypedText(id: ItemId): void {
  const rendered = renderedRows.get(id);
  if (rendered) rendered.item = doc().items[id];
}

function renderTree(): void {
  const top = shownChildrenOf(state.zoom);
  rowsSeen = new Set();
  placeChildren(ui.tree, top.map(renderItem));
  for (const id of renderedRows.keys()) if (!rowsSeen.has(id)) renderedRows.delete(id);
  ui.tree.classList.toggle("searching", Boolean(state.results));
  const isEmpty = top.length === 0;
  ui.addItem.hidden = Boolean(state.results);
  ui.addItem.classList.toggle("prominent", isEmpty);
}

function shownChildrenOf(id: ItemId): ItemId[] {
  const children = shownChildren(doc(), id, filter());
  if (state.results) return children.filter((child) => state.results!.shown.has(child));
  return children;
}

function renderItem(id: ItemId): HTMLLIElement {
  rowsSeen.add(id);
  const item = doc().items[id];
  const children = shownChildrenOf(id);
  const hasChildren = shownChildren(doc(), id, filter()).length > 0;
  const expanded = hasChildren && (state.results ? children.length > 0 : !item.collapsed);
  const noteOpen = item.note !== "" || state.openNotes.has(id);
  const displayState = `${hasChildren} ${expanded} ${noteOpen}`;

  let rendered = renderedRows.get(id);
  if (!rendered || rendered.item !== item || rendered.state !== displayState) {
    const li = rendered?.li ?? createItemElement(id);
    li.querySelector(":scope > .row")?.remove();
    li.prepend(createRow(item, expanded, noteOpen));
    rendered = { item, state: displayState, li };
    renderedRows.set(id, rendered);
  }

  const li = rendered.li;
  li.classList.toggle("completed", item.completed);
  li.classList.toggle("has-children", hasChildren);
  li.classList.toggle("folded", hasChildren && !expanded);
  li.classList.toggle("match", Boolean(state.results?.matches.has(id)));
  if (hasChildren) li.setAttribute("aria-expanded", String(expanded));
  else li.removeAttribute("aria-expanded");

  let list = li.querySelector<HTMLUListElement>(":scope > .children");
  if (expanded) {
    if (!list) {
      list = document.createElement("ul");
      list.className = "children";
      list.setAttribute("role", "group");
      li.append(list);
    }
    placeChildren(list, children.map(renderItem));
  } else {
    list?.remove();
  }
  return li;
}

function createItemElement(id: ItemId): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "item";
  li.dataset.id = id;
  li.setAttribute("role", "treeitem");
  return li;
}

function createRow(item: Item, expanded: boolean, noteOpen: boolean): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML =
    `<button class="toggle" type="button" tabindex="-1" aria-label="${expanded ? "Collapse" : "Expand"}"><svg viewBox="0 0 12 12"><path d="M4.5 3l3 3-3 3"/></svg></button>` +
    `<button class="bullet" type="button" tabindex="-1" aria-label="Zoom in" title="Zoom in · drag to move"><span class="dot"></span></button>` +
    `<div class="body">` +
    `<div class="text${item.text === "" ? " empty" : ""}" contenteditable="plaintext-only" spellcheck="true" data-id="${item.id}">${renderInline(item.text)}</div>` +
    `<div class="note" contenteditable="plaintext-only" spellcheck="true" data-id="${item.id}"${noteOpen ? "" : " hidden"}>${renderInline(item.note)}</div>` +
    `</div>`;
  return row;
}

/** Makes `parent`'s element children exactly `nodes`, moving only what is out of place. */
function placeChildren(parent: Element, nodes: Element[]): void {
  nodes.forEach((node, index) => {
    if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] ?? null);
  });
  while (parent.children.length > nodes.length) parent.lastElementChild!.remove();
}

function renderSearchSummary(): void {
  const results = state.results;
  ui.searchSummary.hidden = !results;
  if (!results) return;
  const count = results.matches.size;
  ui.searchSummary.innerHTML =
    `<span>${count === 0 ? "No matches" : count === 1 ? "1 match" : `${count} matches`} for <strong>${escape(state.query.trim())}</strong></span>` +
    `<button type="button" class="link-button" data-action="clear-search">Clear</button>`;
}

function highlightMatches(): void {
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const HighlightClass = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!registry || !HighlightClass) return;
  registry.delete("search");
  if (!state.results || state.results.terms.length === 0) return;
  const ranges: Range[] = [];
  for (const editor of ui.tree.querySelectorAll<HTMLElement>(".match > .row .text, .match > .row .note")) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const haystack = node.data.toLowerCase();
      for (const term of state.results.terms) {
        for (let at = haystack.indexOf(term); at !== -1; at = haystack.indexOf(term, at + term.length)) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + term.length);
          ranges.push(range);
        }
      }
    }
  }
  registry.set("search", new HighlightClass(...ranges));
}

function textEditorFor(id: ItemId): HTMLElement | null {
  if (id === state.zoom) return ui.title;
  return ui.tree.querySelector<HTMLElement>(`.item[data-id="${CSS.escape(id)}"] > .row .text`);
}

function noteEditorFor(id: ItemId): HTMLElement | null {
  if (id === state.zoom) return ui.titleNote;
  return ui.tree.querySelector<HTMLElement>(`.item[data-id="${CSS.escape(id)}"] > .row .note`);
}

function focusCaret(focus: Focus): void {
  const editor = focus.inNote ? noteEditorFor(focus.id) : textEditorFor(focus.id);
  if (!editor) return;
  if (focus.selectNone) {
    const row = editor.closest(".row");
    row?.classList.remove("flash");
    void (row as HTMLElement | null)?.offsetWidth;
    row?.classList.add("flash");
    return;
  }
  editor.hidden = false;
  editor.focus({ preventScroll: true });
  select(editor, Math.min(focus.offset, (editor.textContent ?? "").length));
  editor.scrollIntoView({ block: "nearest" });
}

// ---- chrome: search box, menu, toolbar, help, toasts ---------------------------

function bindChrome(): void {
  ui.search.addEventListener("input", () => {
    changeQuery(ui.search.value);
    render(null);
  });
  ui.search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      clearQuery();
      render(null);
      ui.search.blur();
    } else if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      const first = ui.tree.querySelector<HTMLElement>(".match > .row .text") ?? ui.tree.querySelector<HTMLElement>(".text");
      if (first) focusCaret({ id: first.dataset.id!, offset: (first.textContent ?? "").length });
    }
  });

  window.addEventListener("hashchange", showZoom);
  window.addEventListener("scroll", () => document.body.classList.toggle("scrolled", window.scrollY > 4), { passive: true });

  ui.tree.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest(".bullet")) event.preventDefault();
  });

  ui.addItem.addEventListener("click", () => {
    const created = insertChild(doc(), state.zoom, doc().items[state.zoom].children.length);
    commitAndRender(created.doc, { id: created.id, offset: 0 });
  });

  document.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!button || button.closest("#toolbar")) return;
    runMenuAction(button.dataset.action!);
  });

  ui.menu.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-pref] [data-value]");
    if (!button) return;
    const pref = button.closest<HTMLElement>("[data-pref]")!.dataset.pref as "theme" | "textSize";
    updatePrefs({ [pref]: button.dataset.value });
    applyAppearance();
  });

  ui.importFile.addEventListener("change", async () => {
    const file = ui.importFile.files?.[0];
    ui.importFile.value = "";
    if (!file) return;
    try {
      const incoming = importText(await file.text());
      const count = Object.keys(incoming.items).length - 1;
      const result = graft(doc(), incoming, state.zoom, doc().items[state.zoom].children.length);
      commitAndRender(result.doc, null);
      toast(`Imported ${count} item${count === 1 ? "" : "s"} from ${file.name}`, { label: "Undo", run: undo });
    } catch (error) {
      toast(`Could not import ${file.name}: ${(error as Error).message}`);
    }
  });

  ui.toolbar.addEventListener("pointerdown", (event) => event.preventDefault());
  ui.toolbar.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    const editor = editorOf(document.activeElement);
    if (!button || !editor) return;
    runToolbarAction(button.dataset.action!, editor);
  });
  keepToolbarAboveKeyboard();

  $("help-close").addEventListener("click", () => ui.help.close());
  ui.help.addEventListener("click", (event) => event.target === ui.help && ui.help.close());
  ui.helpGrid.innerHTML = describeKeys();
  $("build-info").textContent = `Stored only in this browser · build ${__BUILD_COMMIT__}`;
  document.querySelector(".menu-kbd")!.textContent = isMac ? "⌘K" : "Ctrl K";

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyAppearance);
}

function runMenuAction(action: string): void {
  const page = state.zoom === ROOT ? "outline" : slug(doc().items[state.zoom].text) || "outline";
  switch (action) {
    case "jump":
      ui.menu.hidePopover();
      jumpToItem();
      break;
    case "toggle-completed":
      updatePrefs({ showCompleted: !state.prefs.showCompleted });
      render(caretNow());
      break;
    case "expand-all":
      commitAndRender(setCollapsedEverywhere(doc(), state.zoom, false), null);
      break;
    case "collapse-all":
      commitAndRender(setCollapsedEverywhere(doc(), state.zoom, true), null);
      break;
    case "delete-completed": {
      const result = removeCompleted(doc(), state.zoom);
      ui.menu.hidePopover();
      if (result.count === 0) {
        toast("Nothing completed on this page");
        break;
      }
      commitAndRender(result.doc, null);
      toast(`Deleted ${result.count} completed item${result.count === 1 ? "" : "s"}`, { label: "Undo", run: undo });
      break;
    }
    case "export-markdown":
      download(`${page}.md`, "text/markdown", exportMarkdown(doc(), state.zoom));
      break;
    case "export-opml":
      download(`${page}.opml`, "text/x-opml", exportOpml(doc(), state.zoom));
      break;
    case "export-json":
      download(`outliner-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json", exportJson(doc()));
      break;
    case "import":
      ui.importFile.click();
      break;
    case "help":
      ui.menu.hidePopover();
      ui.help.showModal();
      break;
    case "clear-search":
      clearQuery();
      render(null);
      break;
  }
}

function runToolbarAction(action: string, editor: HTMLElement): void {
  const names: Record<string, keyof typeof actions> = {
    indent: "indent",
    outdent: "outdent",
    "move-up": "moveUp",
    "move-down": "moveDown",
    complete: "complete",
    note: "toggleNote",
    undo: "undo",
    done: "blur",
  };
  const name = names[action];
  if (name) actions[name](editorContext(editor));
}

// ---- the item menu (long press or right click on a bullet) ----------------------

let menuItem: ItemId | null = null;

function openItemMenu(id: ItemId, anchor: HTMLElement): void {
  menuItem = id;
  const menu = $("item-menu");
  const item = doc().items[id];
  $("item-menu-title").textContent = shortLabel(item.text, 40) || "Untitled";
  menu.querySelector('[data-item-action="complete"] span')!.textContent = item.completed ? "Uncomplete" : "Complete";
  menu.querySelector('[data-item-action="note"] span')!.textContent = item.note ? "Edit note" : "Add a note";
  menu.showPopover();
  const rect = anchor.getBoundingClientRect();
  const height = menu.offsetHeight;
  const fitsBelow = rect.bottom + 4 + height < window.innerHeight;
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - height - 4)}px`;
}

function bindItemMenu(): void {
  $("item-menu").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-item-action]");
    if (!button || !menuItem || !doc().items[menuItem]) return;
    $("item-menu").hidePopover();
    runItemAction(button.dataset.itemAction!, menuItem);
  });
}

function runItemAction(action: string, id: ItemId): void {
  const editor = textEditorFor(id);
  if (!editor) return;
  const c = editorContext(editor);
  switch (action) {
    case "zoom":
      zoomTo(id);
      break;
    case "note":
      actions.toggleNote(c);
      break;
    case "complete":
      actions.complete(c);
      break;
    case "duplicate":
      actions.duplicate(c);
      break;
    case "move":
      actions.moveToPicker(c);
      break;
    case "copy":
      copyText(subtreesAsText(doc(), [id]));
      toast("Copied as text");
      break;
    case "delete":
      actions.deleteItem(c);
      break;
  }
}

function keepToolbarAboveKeyboard(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const place = () => {
    const keyboard = window.innerHeight - viewport.height - viewport.offsetTop;
    ui.toolbar.style.setProperty("--keyboard", `${Math.max(0, keyboard)}px`);
  };
  viewport.addEventListener("resize", place);
  viewport.addEventListener("scroll", place);
  place();
}

function updatePrefs(change: Partial<Prefs>): void {
  state.prefs = { ...state.prefs, ...change };
  savePrefs(state.prefs);
  renderMenuState();
}

function renderMenuState(): void {
  for (const group of ui.menu.querySelectorAll<HTMLElement>("[data-pref]")) {
    const current = state.prefs[group.dataset.pref as "theme" | "textSize"];
    for (const button of group.querySelectorAll<HTMLElement>("[data-value]")) {
      button.setAttribute("aria-checked", String(button.dataset.value === current));
    }
  }
  ui.completedSwitch.classList.toggle("on", state.prefs.showCompleted);
}

function applyAppearance(): void {
  const { theme, textSize } = state.prefs;
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  if (textSize === "medium") delete root.dataset.size;
  else root.dataset.size = textSize;
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')!.setAttribute("content", dark ? "#17181c" : "#f7f5f0");
}

function bindGlobalKeys(): void {
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const typingSomewhere = event.target instanceof HTMLElement && Boolean(event.target.closest("input, dialog, .text, .note"));
    if (state.selection && !typingSomewhere && handleSelectionKey(event)) {
      event.preventDefault();
      return;
    }
    const onPage = event.target === document.body || event.target === document.documentElement;
    const inField = event.target instanceof HTMLInputElement || Boolean(editorOf(event.target));
    const binding = bindingFor(event, "global");
    if (!binding) return;
    if (binding.typing && (inField || (binding.id === "focus-first" && !onPage))) return;
    if (inField && !["search", "help", "jump", "toggle-completed"].includes(binding.id!)) return;
    event.preventDefault();
    runGlobal(binding.id!);
  });
}

function runGlobal(id: string): void {
  if (["search", "help", "jump"].includes(id)) clearSelection();
  switch (id) {
    case "search":
      ui.search.focus();
      ui.search.select();
      break;
    case "help":
      ui.help.open ? ui.help.close() : ui.help.showModal();
      break;
    case "undo":
      undo();
      break;
    case "redo":
      redo();
      break;
    case "jump":
      jumpToItem();
      break;
    case "toggle-completed":
      runMenuAction("toggle-completed");
      break;
    case "escape":
      if (state.query) {
        clearQuery();
        render(null);
      }
      break;
    case "focus-first": {
      const first = ui.tree.querySelector<HTMLElement>(".text");
      if (first) focusCaret({ id: first.dataset.id!, offset: 0 });
      else ui.addItem.click();
      break;
    }
    case "zoom-out":
      if (state.zoom !== ROOT) zoomTo(doc().items[state.zoom].parent ?? ROOT);
      break;
  }
}

let toastTimer: number | undefined;

function toast(message: string, action?: { label: string; run: () => void }): void {
  window.clearTimeout(toastTimer);
  ui.toast.innerHTML = `<span>${escape(message)}</span>`;
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      ui.toast.hidden = true;
      action.run();
    });
    ui.toast.append(button);
  }
  ui.toast.hidden = false;
  toastTimer = window.setTimeout(() => (ui.toast.hidden = true), 5000);
}

function shortLabel(text: string, length: number): string {
  const plain = plainText(text).trim();
  return plain.length > length ? `${plain.slice(0, length - 1).trimEnd()}…` : plain;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
