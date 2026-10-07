import { EditorContext, actions } from "./app";
import { escape } from "./inline";

export interface Binding {
  keys: string[];
  label: string;
  context: "editor" | "global";
  run: (c: EditorContext) => boolean | void;
  id?: string;
  /** Global binding that only applies when nothing editable has focus. */
  typing?: boolean;
  hidden?: boolean;
}

const editor = (keys: string[], label: string, run: Binding["run"], hidden = false): Binding => ({
  keys,
  label,
  context: "editor",
  run,
  hidden,
});

const global = (keys: string[], label: string, id: string, typing = false, hidden = false): Binding => ({
  keys,
  label,
  context: "global",
  run: () => undefined,
  id,
  typing,
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
  editor(["Mod+b"], "Bold", (c) => actions.bold(c)),
  editor(["Mod+i"], "Italic", (c) => actions.italic(c)),
  editor(["Mod+e"], "Code", (c) => actions.code(c)),
  editor(["Mod+z"], "Undo", () => actions.undo()),
  editor(["Mod+Shift+z", "Mod+y"], "Redo", () => actions.redo()),
  editor(["Escape"], "Stop editing", (c) => actions.blur(c)),
  editor(["ArrowUp"], "", (c) => actions.arrowUp(c), true),
  editor(["ArrowDown"], "", (c) => actions.arrowDown(c), true),
  editor(["ArrowLeft"], "", (c) => actions.arrowLeft(c), true),
  editor(["ArrowRight"], "", (c) => actions.arrowRight(c), true),

  global(["/"], "Search", "search", true),
  global(["Mod+f"], "Search", "search"),
  global(["?"], "Show shortcuts", "help", true),
  global(["Mod+/"], "Show shortcuts", "help"),
  global(["Mod+o"], "Show / hide completed", "toggle-completed"),
  global(["Mod+z"], "Undo", "undo", false, true),
  global(["Mod+Shift+z", "Mod+y"], "Redo", "redo", false, true),
  global(["Escape"], "Clear search", "escape", true, true),
  global(["Enter", "ArrowDown"], "Start editing", "focus-first", true, true),
  global(["Alt+ArrowLeft", "Mod+["], "Zoom out", "zoom-out", true, true),
];

export function bindingFor(event: KeyboardEvent, context: Binding["context"]): Binding | null {
  const pressed = keyString(event);
  return bindings.find((binding) => binding.context === context && binding.keys.includes(pressed)) ?? null;
}

function keyString(event: KeyboardEvent): string {
  const key = baseKey(event);
  const isSymbol = key.length === 1 && !/[a-z0-9]/.test(key);
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey && !isSymbol) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

function baseKey(event: KeyboardEvent): string {
  if (event.code.startsWith("Key")) return event.code.slice(3).toLowerCase();
  if (event.code === "BracketLeft") return "[";
  if (event.code === "BracketRight") return "]";
  if (event.code === "Slash" && !event.shiftKey) return "/";
  return event.key;
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function pretty(keys: string): string {
  return keys
    .split("+")
    .map((part) => {
      const label =
        {
          Mod: isMac ? "⌘" : "Ctrl",
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
