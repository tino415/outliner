import { EditorContext, actions } from "./editing";
import { selectionActions } from "./selection";
import { globalActions } from "./chrome";
import { escape } from "./inline";
import { isMac } from "./platform";
import { moveSideways, toggleBoard } from "./board";

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
  isCommand: boolean;
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

const editor = (keys: string[], label: string, run: EditorBinding["run"]): EditorBinding => ({
  context: "editor",
  keys,
  label,
  run,
  isCommand: true,
});

/** Keys that type or move the caret: in the shortcut list, but not commands of their own. */
const typing = (keys: string[], label: string, run: EditorBinding["run"], hidden = false): EditorBinding => ({
  context: "editor",
  keys,
  label,
  run,
  hidden,
  isCommand: false,
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
  typing(["Enter"], "New item, or split at the caret", (c) => actions.enter(c)),
  editor(["Tab"], "Indent", (c) => actions.indent(c)),
  editor(["Shift+Tab"], "Outdent", (c) => actions.outdent(c)),
  typing(["Backspace"], "At the start: join with the item above", (c) => actions.backspace(c)),
  typing(["Delete"], "At the end: pull the next item up", (c) => actions.deleteForward(c), true),
  editor(["Shift+Enter"], "Add or leave a note", (c) => actions.toggleNote(c)),
  editor(["Alt+Shift+Enter"], "New first child", (c) => actions.newFirstChild(c)),
  editor(["Mod+Enter"], "Complete / uncomplete", (c) => actions.complete(c)),
  editor(["Alt+Shift+ArrowUp", "Mod+Shift+ArrowUp"], "Move up", (c) => actions.moveUp(c)),
  editor(["Alt+Shift+ArrowDown", "Mod+Shift+ArrowDown"], "Move down", (c) => actions.moveDown(c)),
  editor(["Alt+Shift+ArrowLeft"], "On a board: to the column on the left", (c) => moveSideways(c.id, -1, c.start)),
  editor(["Alt+Shift+ArrowRight"], "On a board: to the column on the right", (c) => moveSideways(c.id, 1, c.start)),
  editor(["Ctrl+."], "Fold / unfold", (c) => actions.toggleFold(c)),
  editor(["Mod+ArrowUp"], "Collapse", (c) => actions.collapse(c)),
  editor(["Mod+ArrowDown"], "Expand", (c) => actions.expand(c)),
  editor(["Ctrl+u"], "Up to the parent item", (c) => actions.upToParent(c)),
  editor(["Ctrl+]"], "Zoom in", (c) => actions.zoomIn(c)),
  editor(["Ctrl+["], "Zoom out", (c) => actions.zoomOut(c)),
  editor(["Mod+Shift+Backspace"], "Delete item", (c) => actions.deleteItem(c)),
  editor(["Mod+j d", "Mod+Shift+d"], "Duplicate item", (c) => actions.duplicate(c)),
  editor(["Mod+j m"], "Move item to…", (c) => actions.moveToPicker(c)),
  editor(["Mod+b"], "Bold", (c) => actions.bold(c)),
  editor(["Mod+i"], "Italic", (c) => actions.italic(c)),
  editor(["Mod+e"], "Code", (c) => actions.code(c)),
  editor(["Mod+Shift+e"], "Code block in the note", (c) => actions.codeBlock(c)),
  editor(["Mod+j t"], "Add a tag", (c) => actions.addTag(c)),
  editor(["Mod+j p", "Mod+;"], "Set a property…", (c) => actions.setProperty(c)),
  editor(["Mod+j k"], "Set the kind (Question:, Needs you: …)", (c) => actions.setKind(c)),
  editor(["Mod+j l"], "Link to an item", (c) => actions.insertReference(c)),
  editor(["Mod+j a"], "Attach a file…", (c) => actions.attachFile(c)),
  editor(["Mod+j x"], "Make private…", (c) => actions.makePrivate(c)),
  editor(["Mod+z"], "Undo", () => globalActions.undo()),
  editor(["Mod+Shift+z", "Mod+y"], "Redo", () => globalActions.redo()),
  typing(["Escape"], "Stop editing", (c) => actions.blur(c)),
  typing(["Shift+ArrowUp"], "Select items (at the start or end)", (c) => actions.selectUp(c)),
  typing(["Shift+ArrowDown"], "Select items (at the start or end)", (c) => actions.selectDown(c)),
  editor(["Mod+a"], "Select all items (press twice)", (c) => actions.selectAll(c)),
  typing(["Ctrl+n"], "Next item", (c) => actions.nextItem(c)),
  typing(["Ctrl+p"], "Previous item", (c) => actions.previousItem(c)),
  typing(["Ctrl+f"], "Forward a character", (c) => actions.forwardChar(c)),
  typing(["Ctrl+b"], "Back a character", (c) => actions.backwardChar(c)),
  typing(["Ctrl+a"], "Start of the item", (c) => actions.startOfItem(c)),
  typing(["Ctrl+e"], "End of the item", (c) => actions.endOfItem(c)),
  typing(["ArrowUp"], "", (c) => actions.arrowUp(c), true),
  typing(["ArrowDown"], "", (c) => actions.arrowDown(c), true),
  typing(["ArrowLeft"], "", (c) => actions.arrowLeft(c), true),
  typing(["ArrowRight"], "", (c) => actions.arrowRight(c), true),

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

  global(["Mod+k"], "Search items and commands", "anywhere", () => globalActions.jump()),
  global(["Mod+Shift+k"], "Run a command", "anywhere", () => globalActions.runCommand()),
  global(["Mod+j j"], "Jump to an item", "anywhere", () => globalActions.jumpToItem()),
  global(["/"], "Search", "outsideFields", () => globalActions.search()),
  global(["Mod+f"], "Search", "anywhere", () => globalActions.search()),
  global(["?"], "Show shortcuts", "outsideFields", () => globalActions.help()),
  global(["Mod+/"], "Show shortcuts", "anywhere", () => globalActions.help()),
  global(["Mod+o"], "Show / hide completed", "anywhere", () => globalActions.toggleCompleted()),
  global(["Mod+j c"], "Show / hide columns", "anywhere", () => globalActions.toggleColumns()),
  global(["Mod+j b"], "Show this page as a board", "anywhere", () => toggleBoard()),
  global(["Mod+j n"], "Capture…", "anywhere", () => globalActions.capture()),
  global(["Mod+z"], "Undo", "outsideFields", () => globalActions.undo(), true),
  global(["Mod+Shift+z", "Mod+y"], "Redo", "outsideFields", () => globalActions.redo(), true),
  global(["Escape"], "Clear search", "outsideFields", () => globalActions.clearSearch(), true),
  global(["Enter", "ArrowDown"], "Start editing", "onPage", () => globalActions.startEditing(), true),
  global(["Ctrl+["], "Zoom out", "outsideFields", () => globalActions.zoomOut(), true),
];

/**
 * "Mod" is Ctrl or ⌘ alike; "Ctrl" bindings are for the Ctrl key itself, as
 * Emacs habits expect. On a Mac the Ctrl key is free, so its bindings come
 * first. Elsewhere Ctrl is Mod, and a Ctrl binding only gets the keys no Mod
 * binding wants, so Ctrl-F stays search and Ctrl-B bold.
 */
export function bindingFor<C extends Binding["context"]>(event: KeyboardEvent, context: C): BindingIn<C> | null {
  const keys = keyString(event);
  if (!pressesCtrlItself(event)) return bindingForKeys(keys, context);
  const ctrlKeys = keys.replace(/^Mod\+/, "Ctrl+");
  if (isMac) return bindingForKeys(ctrlKeys, context) ?? bindingForKeys(keys, context);
  return isShadowed(ctrlKeys) ? bindingForKeys(keys, context) : (bindingForKeys(keys, context) ?? bindingForKeys(ctrlKeys, context));
}

function pressesCtrlItself(event: KeyboardEvent): boolean {
  return event.ctrlKey && !event.metaKey;
}

function isShadowed(keys: string): boolean {
  if (isMac || !keys.startsWith("Ctrl+")) return false;
  const asMod = keys.replace(/^Ctrl\+/, "Mod+");
  return bindings.some((binding) => binding.keys.includes(asMod));
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

// ---- the prefix: ⌘J or Ctrl-J, then a key, as C-x in Emacs ----------------------------

export const PREFIX = "Mod+j";

export function isPrefix(event: KeyboardEvent): boolean {
  return keyString(event) === PREFIX;
}

export function isModifierAlone(event: KeyboardEvent): boolean {
  return ["Shift", "Control", "Meta", "Alt", "AltGraph", "CapsLock"].includes(event.key);
}

/** The prefix and the key pressed after it; holding ⌘ or Ctrl for that key too means the same, as C-x C-s does. */
export function sequenceAfterPrefix(event: KeyboardEvent): string {
  return `${PREFIX} ${keyString(event).replace(/^Mod\+/, "")}`;
}

/** What can follow the prefix, for the panel shown while it waits. */
export function keysAfterPrefix(): { key: string; label: string; needsItem: boolean }[] {
  return bindings.flatMap((binding) =>
    binding.keys
      .filter((keys) => keys.startsWith(`${PREFIX} `))
      .map((keys) => ({ key: pretty(keys.slice(PREFIX.length + 1)), label: binding.label, needsItem: binding.context === "editor" })),
  );
}

export function prefixLabel(): string {
  return pretty(PREFIX);
}

function pretty(keys: string): string {
  return keys.split(" ").map(prettyChord).join(" ");
}

function prettyChord(keys: string): string {
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

export interface Command {
  label: string;
  shortcut: string;
  run: () => void;
}

/** What the palette can run: shortcuts that act on their own, with the item being edited if there is one. */
export function keyCommands(editing: EditorContext | null): Command[] {
  const commands = new Map<string, Command>();
  for (const binding of bindings) {
    if (binding.hidden || !binding.label || commands.has(binding.label)) continue;
    const shortcut = shortcutFor(binding.label);
    if (binding.context === "global") commands.set(binding.label, { label: binding.label, shortcut, run: () => binding.run() });
    else if (binding.context === "editor" && binding.isCommand && editing) {
      commands.set(binding.label, { label: binding.label, shortcut, run: () => binding.run(editing) });
    }
  }
  return [...commands.values()];
}

function shortcutFor(label: string): string {
  const keys = bindings.filter((binding) => binding.label === label).flatMap((binding) => usableKeys(binding));
  return keys.length ? pretty(keys[0]) : "";
}

function usableKeys(binding: Binding): string[] {
  return binding.keys.filter((keys) => !isShadowed(keys));
}

export function describeKeys(): string {
  const keysByLabel = new Map<string, string[]>();
  for (const binding of bindings.filter((binding) => !binding.hidden && binding.label && usableKeys(binding).length)) {
    keysByLabel.set(binding.label, [...(keysByLabel.get(binding.label) ?? []), ...usableKeys(binding)]);
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
