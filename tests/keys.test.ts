import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/editing", () => ({ actions: {} }));
vi.mock("../src/selection", () => ({ selectionActions: {} }));
vi.mock("../src/chrome", () => ({ globalActions: {} }));
const view = vi.hoisted(() => ({ shown: "tree" }));

vi.mock("../src/board", () => ({ shownView: () => view.shown, toggleBoard: () => {} }));
vi.mock("../src/agenda", () => ({ openAgenda: () => {} }));
vi.mock("../src/links", () => ({ copyLink: () => {}, copyLinkToPage: () => {} }));

const { bindingFor, bindingForKeys, describeKeys, extendSequence, isPrefix, keyCommands, keyString, sequenceContinues } = await import("../src/keys");

interface Press {
  key: string;
  code?: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
}

function press({ key, code, ctrl = false, meta = false, alt = false, shift = false }: Press): KeyboardEvent {
  const physical = code ?? (/^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key);
  return { key, code: physical, ctrlKey: ctrl, metaKey: meta, altKey: alt, shiftKey: shift } as KeyboardEvent;
}

const ctrl = (key: string, code?: string) => press({ key, code, ctrl: true });
const command = (key: string) => press({ key, meta: true });

describe("Ctrl on Linux and Windows, where Ctrl is Mod", () => {
  it("gives a Ctrl key to the Mod binding that wants it", () => {
    expect(bindingFor(ctrl("b"), "editor", "other")?.label).toBe("Bold");
    expect(bindingFor(ctrl("e"), "editor", "other")?.label).toBe("Code");
    expect(bindingFor(ctrl("a"), "editor", "other")?.label).toBe("Select all items (press twice)");
  });

  it("leaves Ctrl-F to the global search instead of moving the caret", () => {
    expect(bindingFor(ctrl("f"), "editor", "other")).toBeNull();
    expect(bindingFor(ctrl("f"), "global", "other")?.label).toBe("Search");
  });

  it("gives the Emacs binding the Ctrl keys no Mod binding wants", () => {
    expect(bindingFor(ctrl("n"), "editor", "other")?.label).toBe("Next item");
  });
});

describe("Ctrl and ⌘ on a Mac", () => {
  it("gives the Ctrl key itself to the Emacs bindings", () => {
    expect(bindingFor(ctrl("a"), "editor", "mac")?.label).toBe("Start of the item");
    expect(bindingFor(ctrl("e"), "editor", "mac")?.label).toBe("End of the item");
    expect(bindingFor(ctrl("f"), "editor", "mac")?.label).toBe("Forward a character");
    expect(bindingFor(ctrl("b"), "editor", "mac")?.label).toBe("Back a character");
  });

  it("keeps ⌘ for the Mod bindings", () => {
    expect(bindingFor(command("a"), "editor", "mac")?.label).toBe("Select all items (press twice)");
    expect(bindingFor(command("b"), "editor", "mac")?.label).toBe("Bold");
    expect(bindingFor(command("f"), "global", "mac")?.label).toBe("Search");
  });

  it("falls back to the Mod binding for a Ctrl key with no Emacs binding", () => {
    expect(bindingFor(ctrl("z"), "editor", "mac")?.label).toBe("Undo");
  });
});

describe("the Ctrl-J prefix", () => {
  it("is Ctrl-J or ⌘J", () => {
    expect(isPrefix(ctrl("j"))).toBe(true);
    expect(isPrefix(command("j"))).toBe(true);
    expect(isPrefix(press({ key: "j" }))).toBe(false);
  });

  it("keeps waiting while a longer sequence can follow, and runs the date on Mod+j i d", () => {
    expect(sequenceContinues("Mod+j i")).toBe(true);
    expect(sequenceContinues("Mod+j i d")).toBe(false);
    expect(bindingForKeys("Mod+j i", "editor")).toBeNull();
    expect(bindingForKeys("Mod+j i d", "editor")?.label).toBe("Insert a date…");
    expect(extendSequence("Mod+j i", press({ key: "d" }))).toBe("Mod+j i d");
    expect(bindingForKeys("Mod+;", "editor")).toBeNull();
  });

  it("takes the next key with or without Ctrl held", () => {
    expect(extendSequence("Mod+j", press({ key: "d" }))).toBe("Mod+j d");
    expect(extendSequence("Mod+j", ctrl("d"))).toBe("Mod+j d");
    expect(bindingForKeys("Mod+j d", "editor")?.label).toBe("Duplicate item");
  });

  it("copies a link to the item being edited, or to the page when no field has the caret", () => {
    expect(bindingForKeys("Mod+j y", "editor")?.name).toBe("copy-link");
    expect(bindingForKeys("Mod+j y", "global")?.name).toBe("copy-link");
  });
});

describe("keyboard layouts", () => {
  it("follows the letter on QWERTZ, where Z and Y swap places", () => {
    expect(keyString(ctrl("z", "KeyY"))).toBe("Mod+z");
    expect(keyString(ctrl("y", "KeyZ"))).toBe("Mod+y");
  });

  it("follows the key's position when it types no Latin letter, as on Cyrillic", () => {
    expect(keyString(ctrl("я", "KeyZ"))).toBe("Mod+z");
    expect(bindingFor(ctrl("я", "KeyZ"), "editor", "other")?.label).toBe("Undo");
  });

  it("takes a bracket from its position when the layout has a letter there", () => {
    expect(bindingFor(ctrl("ü", "BracketLeft"), "editor", "other")?.label).toBe("Zoom out");
  });

  it("does not add Shift to a symbol that needs it", () => {
    expect(keyString(press({ key: "?", code: "Slash", shift: true }))).toBe("?");
    expect(bindingFor(press({ key: "?", code: "Slash", shift: true }), "global", "other")?.label).toBe("Show shortcuts");
  });

  it("reads Ctrl-Shift-. as the period key whatever the layout types with Shift there", () => {
    const shiftedPeriod = (key: string) => press({ key, code: "Period", ctrl: true, shift: true });
    expect(keyString(shiftedPeriod(">"))).toBe("Mod+Shift+.");
    expect(bindingFor(shiftedPeriod(">"), "editor", "other")?.name).toBe("fold-inside");
    expect(bindingFor(shiftedPeriod(":"), "editor", "other")?.name).toBe("fold-inside");
    expect(bindingFor(shiftedPeriod(">"), "editor", "mac")?.name).toBe("fold-inside");
    expect(bindingFor(ctrl(".", "Period"), "editor", "other")?.name).toBe("fold");
  });
});

describe("the view shown", () => {
  const tab = press({ key: "Tab" });
  const shiftTab = press({ key: "Tab", shift: true });
  const editing = {} as Parameters<typeof keyCommands>[0];

  afterEach(() => {
    view.shown = "tree";
  });

  it("makes Tab indent in the outline and move a card to the next column on a board", () => {
    expect(bindingFor(tab, "editor", "other")?.label).toBe("Indent");
    expect(bindingFor(shiftTab, "editor", "other")?.label).toBe("Outdent");
    view.shown = "board";
    expect(bindingFor(tab, "editor", "other")?.label).toBe("To the column on the right");
    expect(bindingFor(shiftTab, "editor", "other")?.label).toBe("To the column on the left");
  });

  it("folds in both views and leaves the column keys to the board", () => {
    expect(bindingFor(ctrl("."), "editor", "other")?.label).toBe("Fold / unfold");
    expect(bindingFor(press({ key: "ArrowRight", alt: true, shift: true }), "editor", "other")).toBeNull();
    view.shown = "board";
    expect(bindingFor(ctrl("."), "editor", "other")?.label).toBe("Fold / unfold");
    expect(bindingFor(press({ key: "ArrowRight", alt: true, shift: true }), "editor", "other")?.label).toBe("To the column on the right");
  });

  it("offers in the palette and the help only what applies there", () => {
    const labels = () => keyCommands(editing).map((command) => command.label);
    expect(labels()).toContain("Indent");
    expect(labels()).toContain("Show / hide columns");
    expect(labels()).not.toContain("To the column on the right");
    view.shown = "board";
    expect(labels()).toEqual(expect.arrayContaining(["To the column on the right", "To the column on the left"]));
    expect(labels()).not.toEqual(expect.arrayContaining(["Indent"]));
    expect(labels()).toContain("Fold / unfold");
    expect(labels()).not.toContain("Show / hide columns");
    expect(describeKeys()).toContain("To the column on the right");
    expect(describeKeys()).not.toContain("Indent");
  });

  it("lists Tab and Alt-Shift-→ for the move on a board, with the command's name", () => {
    view.shown = "board";
    const row = describeKeys().split(`<div class="help-label">`).find((each) => each.startsWith("To the column on the right"))!;
    expect(row).toContain("move-right");
    expect(row).toContain("<kbd>Tab</kbd>");
    expect(row).toContain("<kbd>→</kbd>");
  });
});
