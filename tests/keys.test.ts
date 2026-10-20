import { describe, expect, it, vi } from "vitest";

vi.mock("../src/editing", () => ({ actions: {} }));
vi.mock("../src/selection", () => ({ selectionActions: {} }));
vi.mock("../src/chrome", () => ({ globalActions: {} }));
vi.mock("../src/board", () => ({ moveSideways: () => {}, toggleBoard: () => {} }));
vi.mock("../src/agenda", () => ({ openAgenda: () => {} }));

const { bindingFor, bindingForKeys, isPrefix, keyString, sequenceAfterPrefix } = await import("../src/keys");

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

  it("takes the next key with or without Ctrl held", () => {
    expect(sequenceAfterPrefix(press({ key: "d" }))).toBe("Mod+j d");
    expect(sequenceAfterPrefix(ctrl("d"))).toBe("Mod+j d");
    expect(bindingForKeys("Mod+j d", "editor")?.label).toBe("Duplicate item");
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
});
