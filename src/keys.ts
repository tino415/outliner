import { EditorContext, actions } from "./editing";
import { selectionActions } from "./selection";
import { globalActions } from "./chrome";
import { escape } from "./inline";
import { isMac } from "./platform";

/** Where a global shortcut applies, judged by what has focus. */
export type Reach = "anywhere" | "outsideFields" | "onPage";

interface Shortcut {
  keys: string[];
  label: string;
  hidden?: boolean;
}

interface EditorBinding extends Shortcut {
  context: "editor";
  run: (c: EditorContext) => boolean | void;
}

interface SelectionBinding extends Shortcut {
  context: "selection";
  run: () => boolean | void;
}

interface GlobalBinding extends Shortcut {
  context: "global";
  reach: Reach;
  run: () => boolean | void;
}

type Binding = EditorBinding | SelectionBinding | GlobalBinding;
type BindingIn<C extends Binding["context"]> = Extract<Binding, { context: C }>;

const editor = (keys: string[], label: string, run: EditorBinding["run"], hidden = false): EditorBinding => ({
  context: "editor",
  keys,
  label,
  run,
  hidden,
});

const selection = (keys: string[], run: SelectionBinding["run"]): SelectionBinding => ({
  context: "selection",
  keys,
  label: "",
  run,
  hidden: true,
});

const global = (keys: string[], label: string, reach: Reach, run: GlobalBinding["run"], hidden = false): GlobalBinding => ({
  context: "global",
  keys,
  label,
  reach,
  run,
  hidden,
});

const bindings: Binding[] = [
  editor(["Enter"], "New item, or split at the caret", (c) => actions.enter(c)),
  editor(["Tab"], "Indent", (c) => actions.indent(c)),
  editor(["Shift+Tab"], "Outdent", (c) => actions.outdent(c)),
  editor(["Backspace"], "At the start: join with the item above", (c) => actions.backspace(c)),
  editor(["Delete"], "At the end: pull the next item up", (c) => actions.deleteForward(c), true),
  editor(["Shift+Enter"], "Add or leave a note", (c) => actions.toggleNote(c)),
  editor(["Mod+Enter"], "Complete / uncomplete", (c) => actions.complete(c)),
  editor(["Alt+Shift+ArrowUp", "Mod+Shift+ArrowUp"], "Move up", (c) => actions.moveUp(c)),
  editor(["Alt+Shift+ArrowDown", "Mod+Shift+ArrowDown"], "Move down", (c) => actions.moveDown(c)),
  editor(["Mod+ArrowUp"], "Collapse", (c) => actions.collapse(c)),
  editor(["Mod+ArrowDown"], "Expand", (c) => actions.expand(c)),
  editor(["Alt+ArrowRight", "Mod+]"], "Zoom in", (c) => actions.zoomIn(c)),
  editor(["Alt+ArrowLeft", "Mod+["], "Zoom out", (c) => actions.zoomOut(c)),
  editor(["Mod+Shift+Backspace"], "Delete item", (c) => actions.deleteItem(c)),
  editor(["Alt+Shift+d", "Mod+Shift+d"], "Duplicate item", (c) => actions.duplicate(c)),
  editor(["Alt+Shift+m"], "Move item to…", (c) => actions.moveToPicker(c)),
  editor(["Mod+b"], "Bold", (c) => actions.bold(c)),
  editor(["Mod+i"], "Italic", (c) => actions.italic(c)),
  editor(["Mod+e"], "Code", (c) => actions.code(c)),
  editor(["Mod+z"], "Undo", () => globalActions.undo()),
  editor(["Mod+Shift+z", "Mod+y"], "Redo", () => globalActions.redo()),
  editor(["Escape"], "Stop editing", (c) => actions.blur(c)),
  editor(["Shift+ArrowUp"], "Select items (at the start or end)", (c) => actions.selectUp(c)),
  editor(["Shift+ArrowDown"], "Select items (at the start or end)", (c) => actions.selectDown(c)),
  editor(["Mod+a"], "Select all items (press twice)", (c) => actions.selectAll(c)),
  editor(["Ctrl+n"], "Next item", (c) => actions.nextItem(c)),
  editor(["Ctrl+p"], "Previous item", (c) => actions.previousItem(c)),
  editor(["ArrowUp"], "", (c) => actions.arrowUp(c), true),
  editor(["ArrowDown"], "", (c) => actions.arrowDown(c), true),
  editor(["ArrowLeft"], "", (c) => actions.arrowLeft(c), true),
  editor(["ArrowRight"], "", (c) => actions.arrowRight(c), true),

  selection(["Shift+ArrowUp"], () => selectionActions.extend(-1)),
  selection(["Shift+ArrowDown"], () => selectionActions.extend(1)),
  selection(["ArrowUp"], () => selectionActions.leaveAt("start")),
  selection(["ArrowDown", "Enter"], () => selectionActions.leaveAt("end")),
  selection(["Escape"], () => selectionActions.leave()),
  selection(["Tab"], () => selectionActions.indent()),
  selection(["Shift+Tab"], () => selectionActions.outdent()),
  selection(["Alt+Shift+ArrowUp", "Mod+Shift+ArrowUp"], () => selectionActions.moveUp()),
  selection(["Alt+Shift+ArrowDown", "Mod+Shift+ArrowDown"], () => selectionActions.moveDown()),
  selection(["Mod+Enter"], () => selectionActions.complete()),
  selection(["Backspace", "Delete", "Mod+Shift+Backspace"], () => selectionActions.remove()),
  selection(["Mod+c"], () => selectionActions.copy()),
  selection(["Mod+x"], () => selectionActions.cut()),
  selection(["Mod+a"], () => selectionActions.selectPage()),

  global(["Mod+k"], "Jump to an item", "anywhere", () => globalActions.jump()),
  global(["/"], "Search", "outsideFields", () => globalActions.search()),
  global(["Mod+f"], "Search", "anywhere", () => globalActions.search()),
  global(["?"], "Show shortcuts", "outsideFields", () => globalActions.help()),
  global(["Mod+/"], "Show shortcuts", "anywhere", () => globalActions.help()),
  global(["Mod+o"], "Show / hide completed", "anywhere", () => globalActions.toggleCompleted()),
  global(["Alt+Shift+c"], "Show / hide columns", "anywhere", () => globalActions.toggleColumns()),
  global(["Mod+z"], "Undo", "outsideFields", () => globalActions.undo(), true),
  global(["Mod+Shift+z", "Mod+y"], "Redo", "outsideFields", () => globalActions.redo(), true),
  global(["Escape"], "Clear search", "outsideFields", () => globalActions.clearSearch(), true),
  global(["Enter", "ArrowDown"], "Start editing", "onPage", () => globalActions.startEditing(), true),
  global(["Alt+ArrowLeft", "Mod+["], "Zoom out", "outsideFields", () => globalActions.zoomOut(), true),
];

export function bindingFor<C extends Binding["context"]>(event: KeyboardEvent, context: C): BindingIn<C> | null {
  return bindingForKeys(keyString(event), context) ?? (pressesCtrlItself(event) ? bindingForKeys(keyString(event).replace(/^Mod\+/, "Ctrl+"), context) : null);
}

/** "Mod" is Ctrl or ⌘ alike; "Ctrl" bindings are for the Ctrl key itself, as Emacs habits on a Mac expect. */
function pressesCtrlItself(event: KeyboardEvent): boolean {
  return event.ctrlKey && !event.metaKey;
}

export function bindingForKeys<C extends Binding["context"]>(keys: string, context: C): BindingIn<C> | null {
  const found = bindings.find((binding) => binding.context === context && binding.keys.includes(keys));
  return (found as BindingIn<C> | undefined) ?? null;
}

export function keyString(event: KeyboardEvent): string {
  const key = baseKey(event);
  const isSymbol = key.length === 1 && !/[a-z0-9]/.test(key);
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey && !isSymbol) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/**
 * Letters follow the layout (Ctrl+Z is Z on QWERTZ too). Only when the key
 * does not produce a Latin letter, as on Cyrillic layouts or with Option on
 * a Mac, does the physical key position decide. Brackets fall back to their
 * position because many layouts put them behind AltGr.
 */
function baseKey(event: KeyboardEvent): string {
  const typed = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (/^[a-z]$/.test(typed)) return typed;
  if (event.code.startsWith("Key")) return event.code.slice(3).toLowerCase();
  if (["[", "]", "/", "?"].includes(typed)) return typed;
  if (event.code === "BracketLeft") return "[";
  if (event.code === "BracketRight") return "]";
  return event.key;
}

function pretty(keys: string): string {
  return keys
    .split("+")
    .map((part) => {
      const label =
        {
          Mod: isMac ? "⌘" : "Ctrl",
          Ctrl: isMac ? "⌃" : "Ctrl",
          Alt: isMac ? "⌥" : "Alt",
          Shift: "⇧",
          ArrowUp: "↑",
          ArrowDown: "↓",
          ArrowLeft: "←",
          ArrowRight: "→",
          Backspace: isMac ? "⌫" : "Backspace",
          Enter: "Enter",
          Escape: "Esc",
        }[part] ?? (part.length === 1 ? part.toUpperCase() : part);
      return `<kbd>${escape(label)}</kbd>`;
    })
    .join("");
}

export function describeKeys(): string {
  const keysByLabel = new Map<string, string[]>();
  for (const binding of bindings.filter((binding) => !binding.hidden && binding.label)) {
    keysByLabel.set(binding.label, [...(keysByLabel.get(binding.label) ?? []), ...binding.keys]);
  }
  return [...keysByLabel]
    .map(
      ([label, keys]) =>
        `<div class="help-label">${escape(label)}</div><div class="help-keys">${keys
          .slice(0, 2)
          .map(pretty)
          .join(`<span class="help-or">or</span>`)}</div>`,
    )
    .join("");
}
