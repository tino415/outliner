import { EditorContext, actions } from "./editing";
import { selectionActions } from "./selection";
import { globalActions } from "./chrome";
import { escape } from "./inline";
import { Platform, isMac, platform } from "./platform";
import { moveSideways, toggleBoard } from "./board";
import { openAgenda } from "./agenda";
import { Doc } from "./model";
import { CommandName, LostKeys, PREFIX, Refusal, applyShortcuts, chooseShortcuts, shortcutSettingsIn } from "./shortcuts";

/** Where a global shortcut applies, judged by what has focus. */
export type Reach = "anywhere" | "outsideFields" | "onPage";

interface Shortcut {
  name?: CommandName;
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

const editor = (name: CommandName, keys: string[], label: string, run: EditorBinding["run"]): EditorBinding => ({
  context: "editor",
  name,
  keys,
  label,
  run,
  isCommand: true,
});

/** A command whose keys no setting changes. */
const fixed = (keys: string[], label: string, run: EditorBinding["run"]): EditorBinding => ({
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

/** A named selection key follows the command of that name when a setting changes it. */
const selection = (name: CommandName | undefined, keys: string[], run: SelectionBinding["run"]): SelectionBinding => ({
  context: "selection",
  name,
  keys,
  label: "",
  run,
  hidden: true,
});

const global = (name: CommandName | undefined, keys: string[], label: string, reach: Reach, run: GlobalBinding["run"], hidden = false): GlobalBinding => ({
  context: "global",
  name,
  keys,
  label,
  reach,
  run,
  hidden,
});

const defaultBindings: Binding[] = [
  typing(["Enter"], "New item, or split at the caret", (c) => actions.enter(c)),
  fixed(["Tab"], "Indent", (c) => actions.indent(c)),
  fixed(["Shift+Tab"], "Outdent", (c) => actions.outdent(c)),
  typing(["Backspace"], "At the start: join with the item above", (c) => actions.backspace(c)),
  typing(["Delete"], "At the end: pull the next item up", (c) => actions.deleteForward(c), true),
  editor("toggle-note", ["Shift+Enter"], "Add or leave a note", (c) => actions.toggleNote(c)),
  editor("new-first-child", ["Alt+Shift+Enter"], "New first child", (c) => actions.newFirstChild(c)),
  editor("complete", ["Mod+Enter"], "Complete / uncomplete", (c) => actions.complete(c)),
  editor("move-up", ["Alt+Shift+ArrowUp", "Mod+Shift+ArrowUp"], "Move up", (c) => actions.moveUp(c)),
  editor("move-down", ["Alt+Shift+ArrowDown", "Mod+Shift+ArrowDown"], "Move down", (c) => actions.moveDown(c)),
  editor("move-left", ["Alt+Shift+ArrowLeft"], "On a board: to the column on the left", (c) => moveSideways(c.id, -1, c.start)),
  editor("move-right", ["Alt+Shift+ArrowRight"], "On a board: to the column on the right", (c) => moveSideways(c.id, 1, c.start)),
  editor("fold", ["Ctrl+."], "Fold / unfold", (c) => actions.toggleFold(c)),
  editor("collapse", ["Mod+ArrowUp"], "Collapse", (c) => actions.collapse(c)),
  editor("expand", ["Mod+ArrowDown"], "Expand", (c) => actions.expand(c)),
  editor("up-to-parent", ["Ctrl+u"], "Up to the parent item", (c) => actions.upToParent(c)),
  editor("zoom-in", ["Ctrl+]"], "Zoom in", (c) => actions.zoomIn(c)),
  editor("zoom-out", ["Ctrl+["], "Zoom out", (c) => actions.zoomOut(c)),
  editor("delete-item", ["Mod+Shift+Backspace"], "Delete item", (c) => actions.deleteItem(c)),
  editor("duplicate", ["Mod+j d", "Mod+Shift+d"], "Duplicate item", (c) => actions.duplicate(c)),
  editor("move-to", ["Mod+j m"], "Move item to…", (c) => actions.moveToPicker(c)),
  editor("bold", ["Mod+b"], "Bold", (c) => actions.bold(c)),
  editor("italic", ["Mod+i"], "Italic", (c) => actions.italic(c)),
  editor("code", ["Mod+e"], "Code", (c) => actions.code(c)),
  editor("code-block", ["Mod+Shift+e"], "Code block in the note", (c) => actions.codeBlock(c)),
  editor("tag", ["Mod+j t"], "Add a tag", (c) => actions.addTag(c)),
  editor("property", ["Mod+j p", "Mod+;"], "Set a property…", (c) => actions.setProperty(c)),
  editor("kind", ["Mod+j k"], "Set the kind (Question:, Needs you: …)", (c) => actions.setKind(c)),
  editor("link", ["Mod+j l"], "Link to an item", (c) => actions.insertReference(c)),
  editor("mirror", ["Mod+j r"], "Mirror here", (c) => actions.mirrorHere(c)),
  editor("date", ["Mod+j ;"], "Insert a date…", (c) => actions.insertDate(c)),
  editor("attach", ["Mod+j a"], "Attach a file…", (c) => actions.attachFile(c)),
  editor("make-private", ["Mod+j x"], "Make private…", (c) => actions.makePrivate(c)),
  editor("undo", ["Mod+z"], "Undo", () => globalActions.undo()),
  editor("redo", ["Mod+Shift+z", "Mod+y"], "Redo", () => globalActions.redo()),
  typing(["Escape"], "Stop editing", (c) => actions.blur(c)),
  typing(["Shift+ArrowUp"], "Select items (at the start or end)", (c) => actions.selectUp(c)),
  typing(["Shift+ArrowDown"], "Select items (at the start or end)", (c) => actions.selectDown(c)),
  editor("select-all", ["Mod+a"], "Select all items (press twice)", (c) => actions.selectAll(c)),
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

  selection(undefined, ["Shift+ArrowUp"], () => selectionActions.extend(-1)),
  selection(undefined, ["Shift+ArrowDown"], () => selectionActions.extend(1)),
  selection(undefined, ["ArrowUp"], () => selectionActions.leaveAt("start")),
  selection(undefined, ["ArrowDown", "Enter"], () => selectionActions.leaveAt("end")),
  selection(undefined, ["Escape"], () => selectionActions.leave()),
  selection(undefined, ["Tab"], () => selectionActions.indent()),
  selection(undefined, ["Shift+Tab"], () => selectionActions.outdent()),
  selection("move-up", ["Alt+Shift+ArrowUp", "Mod+Shift+ArrowUp"], () => selectionActions.moveUp()),
  selection("move-down", ["Alt+Shift+ArrowDown", "Mod+Shift+ArrowDown"], () => selectionActions.moveDown()),
  selection("complete", ["Mod+Enter"], () => selectionActions.complete()),
  selection("delete-item", ["Backspace", "Delete", "Mod+Shift+Backspace"], () => selectionActions.remove()),
  selection(undefined, ["Mod+c"], () => selectionActions.copy()),
  selection(undefined, ["Mod+x"], () => selectionActions.cut()),
  selection("select-all", ["Mod+a"], () => selectionActions.selectPage()),

  global("search-all", ["Mod+k"], "Search items and commands", "anywhere", () => globalActions.jump()),
  global("run-command", ["Mod+Shift+k"], "Run a command", "anywhere", () => globalActions.runCommand()),
  global("jump-to-item", ["Mod+j j"], "Jump to an item", "anywhere", () => globalActions.jumpToItem()),
  global("search", ["Mod+f"], "Search", "anywhere", () => globalActions.search()),
  global("search", ["/"], "Search", "outsideFields", () => globalActions.search()),
  global("help", ["Mod+/"], "Show shortcuts", "anywhere", () => globalActions.help()),
  global("help", ["?"], "Show shortcuts", "outsideFields", () => globalActions.help()),
  global("toggle-completed", ["Mod+o"], "Show / hide completed", "anywhere", () => globalActions.toggleCompleted()),
  global("toggle-columns", ["Mod+j c"], "Show / hide columns", "anywhere", () => globalActions.toggleColumns()),
  global("toggle-board", ["Mod+j b"], "Show this page as a board", "anywhere", () => toggleBoard()),
  global("agenda", ["Mod+j g"], "Agenda: overdue, today and the next 7 days", "anywhere", () => openAgenda()),
  global("capture", ["Mod+j n"], "Capture…", "anywhere", () => globalActions.capture()),
  global("undo", ["Mod+z"], "Undo", "outsideFields", () => globalActions.undo(), true),
  global("redo", ["Mod+Shift+z", "Mod+y"], "Redo", "outsideFields", () => globalActions.redo(), true),
  global(undefined, ["Escape"], "Clear search", "outsideFields", () => globalActions.clearSearch(), true),
  global(undefined, ["Enter", "ArrowDown"], "Start editing", "onPage", () => globalActions.startEditing(), true),
  global("zoom-out", ["Ctrl+["], "Zoom out", "outsideFields", () => globalActions.zoomOut(), true),
];

let bindings: Binding[] = defaultBindings;
let lostKeys: LostKeys[] = [];
let refusedSettings: Refusal[] = [];
let settingsRead = "[]";

export function followShortcutSettings(doc: Doc): void {
  const written = shortcutSettingsIn(doc);
  if (JSON.stringify(written) === settingsRead) return;
  settingsRead = JSON.stringify(written);
  const chosen = chooseShortcuts(written, keysOfUnnamedCommands());
  const applied = applyShortcuts(defaultBindings, chosen.keys, isMac);
  bindings = applied.bindings;
  lostKeys = applied.lost;
  refusedSettings = chosen.refused;
}

function keysOfUnnamedCommands(): string[] {
  return defaultBindings.filter((binding) => !binding.name && binding.context !== "selection").flatMap((binding) => binding.keys);
}

/**
 * "Mod" is Ctrl or ⌘ alike; "Ctrl" bindings are for the Ctrl key itself, as
 * Emacs habits expect. On a Mac the Ctrl key is free, so its bindings come
 * first. Elsewhere Ctrl is Mod, and a Ctrl binding only gets the keys no Mod
 * binding wants, so Ctrl-F stays search and Ctrl-B bold.
 */
export function bindingFor<C extends Binding["context"]>(event: KeyboardEvent, context: C, on: Platform = platform): BindingIn<C> | null {
  const keys = keyString(event);
  if (!pressesCtrlItself(event)) return bindingForKeys(keys, context);
  const ctrlKeys = keys.replace(/^Mod\+/, "Ctrl+");
  if (on === "mac") return bindingForKeys(ctrlKeys, context) ?? bindingForKeys(keys, context);
  return isShadowed(ctrlKeys, on) ? bindingForKeys(keys, context) : (bindingForKeys(keys, context) ?? bindingForKeys(ctrlKeys, context));
}

function pressesCtrlItself(event: KeyboardEvent): boolean {
  return event.ctrlKey && !event.metaKey;
}

function isShadowed(keys: string, on: Platform = platform): boolean {
  if (on === "mac" || !keys.startsWith("Ctrl+")) return false;
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
  return describeCommands() + describeRefusals() + `<p class="help-how">Set your own on an item with the property <code>shortcuts: on</code>: one property per command, e.g. <code>tag: Mod+j g</code>, several keys separated by commas, <code>none</code> to unbind.</p>`;
}

function describeCommands(): string {
  const shown = new Map<string, { name?: CommandName; keys: string[] }>();
  for (const binding of bindings.filter((binding) => !binding.hidden && binding.label && (binding.name || usableKeys(binding).length))) {
    const row = shown.get(binding.label) ?? { name: binding.name, keys: [] };
    row.keys.push(...usableKeys(binding));
    shown.set(binding.label, row);
  }
  return [...shown].map(([label, { name, keys }]) => `<div class="help-label">${escape(label)}${name ? nameAndLostKeys(name) : ""}</div><div class="help-keys">${keysShown(keys)}</div>`).join("");
}

function nameAndLostKeys(name: CommandName): string {
  const lost = lostKeys.filter((each) => each.name === name).map((each) => `<div class="help-note">${pretty(each.keys)} now runs <code>${each.to}</code></div>`);
  return ` <code class="help-name">${name}</code>${lost.join("")}`;
}

function keysShown(keys: string[]): string {
  if (keys.length === 0) return `<span class="help-or">none</span>`;
  return keys.slice(0, 2).map(pretty).join(`<span class="help-or">or</span>`);
}

function describeRefusals(): string {
  if (refusedSettings.length === 0) return "";
  const rows = refusedSettings.map(({ name, keys, reason }) => `<li><code>${escape(name)}: ${escape(keys)}</code> ${escape(reason)}</li>`);
  return `<div class="help-refused"><h3>Not used from your shortcuts</h3><ul>${rows.join("")}</ul></div>`;
}
