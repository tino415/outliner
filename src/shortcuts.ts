import { Doc, ItemId, ROOT } from "./model";

/*
 * Shortcuts set in the outline (doc/adr/0039): an item with `shortcuts: on`
 * holds one property per command, its keys separated by commas, `none`
 * to unbind it. A setting replaces the command's default keys and takes
 * them from any other command that had them.
 */

export const COMMAND_NAMES = [
  "toggle-note",
  "new-first-child",
  "complete",
  "move-up",
  "move-down",
  "move-left",
  "move-right",
  "fold",
  "collapse",
  "expand",
  "up-to-parent",
  "zoom-in",
  "zoom-out",
  "delete-item",
  "duplicate",
  "move-to",
  "bold",
  "italic",
  "code",
  "code-block",
  "tag",
  "property",
  "kind",
  "link",
  "date",
  "attach",
  "make-private",
  "undo",
  "redo",
  "select-all",
  "search-all",
  "run-command",
  "jump-to-item",
  "search",
  "help",
  "toggle-completed",
  "toggle-columns",
  "toggle-board",
  "agenda",
  "capture",
] as const;

export type CommandName = (typeof COMMAND_NAMES)[number];

export interface Bound {
  name?: CommandName;
  context: string;
  keys: string[];
}

export interface Refusal {
  name: string;
  keys: string;
  reason: string;
}

export interface LostKeys {
  name: CommandName;
  keys: string;
  to: CommandName;
}

export interface ChosenShortcuts {
  keys: Map<CommandName, string[]>;
  refused: Refusal[];
}

export const PREFIX = "Mod+j";
export const SETTINGS_KEY = "shortcuts";
const UNBOUND = "none";
const CLIPBOARD_KEYS = ["Mod+c", "Mod+x", "Mod+v"];
const BROWSER_KEYS = ["n", "t", "w"].flatMap((letter) => ["Mod", "Ctrl"].flatMap((mod) => [`${mod}+${letter}`, `${mod}+Shift+${letter}`]));

export function shortcutSettingsIn(doc: Doc): [string, string][] {
  const written: [string, string][] = [];
  const walk = (id: ItemId) => {
    for (const child of doc.items[id].children) {
      const properties = doc.items[child].properties;
      if (properties[SETTINGS_KEY]?.trim().toLowerCase() === "on") {
        written.push(...Object.entries(properties).filter(([key]) => key !== SETTINGS_KEY));
      }
      walk(child);
    }
  };
  walk(ROOT);
  return written;
}

/** `fixedKeys` belong to typing and the caret, which no setting may take. */
export function chooseShortcuts(written: [string, string][], fixedKeys: string[]): ChosenShortcuts {
  const keys = new Map<CommandName, string[]>();
  const refused: Refusal[] = [];
  const claimedBy = new Map<string, CommandName>();
  for (const [name, value] of written) {
    if (!isCommandName(name)) {
      refused.push({ name, keys: value, reason: "no command has this name" });
      continue;
    }
    if (keys.has(name)) continue;
    if (value.trim().toLowerCase() === UNBOUND) {
      keys.set(name, []);
      continue;
    }
    const chosen: string[] = [];
    for (const each of value.split(",").map((part) => part.trim()).filter(Boolean)) {
      const read = readKeys(each);
      if ("reason" in read) {
        refused.push({ name, keys: each, reason: read.reason });
        continue;
      }
      const reason = refusalOf(read.keys, fixedKeys, claimedBy.get(read.keys));
      if (reason) refused.push({ name, keys: each, reason });
      else if (!chosen.includes(read.keys)) {
        chosen.push(read.keys);
        claimedBy.set(read.keys, name);
      }
    }
    if (chosen.length) keys.set(name, chosen);
  }
  return { keys, refused };
}

function isCommandName(name: string): name is CommandName {
  return (COMMAND_NAMES as readonly string[]).includes(name);
}

function refusalOf(keys: string, fixedKeys: string[], claimedBy: CommandName | undefined): string | null {
  if (claimedBy) return `already set for ${claimedBy}`;
  if (keys === PREFIX) return "stays the prefix for the keys after it";
  if (keys.startsWith(`${PREFIX} `)) return keys.endsWith(" Escape") ? "Escape cancels the prefix" : null;
  if (keys.includes(" ")) return `only ${PREFIX} can start a sequence`;
  if (!/^(Mod|Ctrl)\+/.test(keys)) return "types a character; add Mod or Ctrl";
  if (/\+Alt\+(Shift\+)?.$/.test(keys)) return "Alt with a letter types a character on some keyboards (⌥ on a Mac, AltGr on Windows)";
  if (BROWSER_KEYS.includes(keys)) return "the browser keeps it for windows and tabs";
  if (CLIPBOARD_KEYS.includes(keys)) return "copy, cut and paste use it";
  if (fixedKeys.includes(keys)) return "typing or moving the caret uses it";
  return null;
}

// ---- reading keys as written ------------------------------------------------------------

const MODIFIERS: Record<string, string> = {
  mod: "Mod",
  cmd: "Mod",
  command: "Mod",
  "⌘": "Mod",
  meta: "Mod",
  ctrl: "Ctrl",
  control: "Ctrl",
  "⌃": "Ctrl",
  alt: "Alt",
  option: "Alt",
  opt: "Alt",
  "⌥": "Alt",
  shift: "Shift",
  "⇧": "Shift",
};

const NAMED_KEYS = [
  "Enter",
  "Escape",
  "Tab",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
];

const KEY_ALIASES: Record<string, string> = {
  return: "Enter",
  esc: "Escape",
  del: "Delete",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  "←": "ArrowLeft",
  "→": "ArrowRight",
};

const MODIFIER_ORDER = ["Mod", "Ctrl", "Alt", "Shift"];

export function readKeys(written: string): { keys: string } | { reason: string } {
  const chords = written.trim().split(/\s+/);
  if (chords.length > 2) return { reason: "at most two keys in a row" };
  const read = chords.map(readChord);
  const unreadable = read.find((chord) => "reason" in chord);
  if (unreadable) return unreadable;
  const [first, second] = read.map((chord) => (chord as { keys: string }).keys);
  if (second === undefined) return { keys: first };
  return { keys: `${first} ${second.replace(/^(Mod|Ctrl)\+/, "")}` };
}

function readChord(chord: string): { keys: string } | { reason: string } {
  const plus = chord.endsWith("++") ? chord.length - 2 : chord.lastIndexOf("+");
  const writtenKey = plus < 0 ? chord : chord.slice(plus + 1);
  const writtenModifiers = plus < 0 ? [] : chord.slice(0, plus).split("+");
  const modifiers = writtenModifiers.map((modifier) => MODIFIERS[modifier.toLowerCase()]);
  if (modifiers.some((modifier) => !modifier)) return { reason: `cannot read ${chord}: modifiers are Mod, Ctrl, Alt and Shift` };
  if (modifiers.includes("Mod") && modifiers.includes("Ctrl")) return { reason: "Mod is Ctrl outside a Mac; use one of them" };
  const key = keyNamed(writtenKey);
  if (!key) return { reason: `cannot read the key ${writtenKey}` };
  const isSymbol = key.length === 1 && !/[a-z0-9]/.test(key);
  if (isSymbol && modifiers.includes("Shift")) return { reason: "write the symbol Shift types instead of Shift, e.g. Mod+?" };
  const ordered = MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier));
  return { keys: [...ordered, key].join("+") };
}

function keyNamed(written: string): string | null {
  if ([...written].length === 1) return written.toLowerCase();
  const lower = written.toLowerCase();
  return KEY_ALIASES[lower] ?? NAMED_KEYS.find((name) => name.toLowerCase() === lower) ?? null;
}

// ---- putting the settings over the defaults -----------------------------------------------

export function applyShortcuts<B extends Bound>(defaults: readonly B[], chosen: Map<CommandName, string[]>, mac: boolean): { bindings: B[]; lost: LostKeys[] } {
  const bindings = defaults.map((binding) => ({ ...binding, keys: [...binding.keys] }));
  const lost: LostKeys[] = [];
  for (const [name, keys] of chosen) {
    const replaced = defaultKeysOf(defaults, name);
    const contextsGiven = new Set<string>();
    for (const binding of bindings.filter((each) => each.name === name)) {
      binding.keys = binding.keys.filter((each) => !replaced.includes(each));
      if (contextsGiven.has(binding.context)) continue;
      contextsGiven.add(binding.context);
      binding.keys.push(...keys);
    }
    for (const binding of bindings.filter((each) => each.name && each.name !== name)) {
      const taken = binding.keys.filter((each) => keys.some((set) => sameKeys(set, each, mac)));
      if (taken.length === 0) continue;
      binding.keys = binding.keys.filter((each) => !taken.includes(each));
      if (binding.context === "selection") continue;
      for (const each of taken) if (!lost.some((already) => already.name === binding.name && already.keys === each)) lost.push({ name: binding.name!, keys: each, to: name });
    }
  }
  return { bindings, lost };
}

function defaultKeysOf(defaults: readonly Bound[], name: CommandName): string[] {
  return defaults.filter((binding) => binding.name === name && binding.context !== "selection").flatMap((binding) => binding.keys);
}

/** Outside a Mac, Mod is the Ctrl key, so Ctrl+k and Mod+k are one key. */
function sameKeys(a: string, b: string, mac: boolean): boolean {
  if (a === b) return true;
  return !mac && a.replace(/^Ctrl\+/, "Mod+") === b.replace(/^Ctrl\+/, "Mod+");
}
