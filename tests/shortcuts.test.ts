import { describe, expect, it } from "vitest";
import { Doc, ItemId, setItemProperty } from "../src/model";
import { parseIndentedText } from "../src/transfer";
import { Bound, CommandName, applyShortcuts, chooseShortcuts, readKeys, shortcutSettingsIn } from "../src/shortcuts";

function idOf(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

function withProperties(doc: Doc, text: string, properties: Record<string, string>): Doc {
  return Object.entries(properties).reduce((next, [key, value]) => setItemProperty(next, idOf(next, text), key, value), doc);
}

const FIXED = ["Enter", "Tab", "Ctrl+a", "Ctrl+e", "Ctrl+n"];

function chosen(written: Record<string, string>) {
  return chooseShortcuts(Object.entries(written), FIXED);
}

describe("the shortcuts item", () => {
  it("is any item with shortcuts: on, its other properties the settings", () => {
    let doc = parseIndentedText("Settings\n  Shortcuts\n  Columns");
    doc = withProperties(doc, "Shortcuts", { shortcuts: "on", tag: "Mod+j g" });
    doc = withProperties(doc, "Columns", { shortcuts: "off", bold: "Mod+g" });
    expect(shortcutSettingsIn(doc)).toEqual([["tag", "Mod+j g"]]);
  });
});

describe("reading keys", () => {
  it.each([
    ["Mod+j g", "Mod+j g"],
    ["mod+J G", "Mod+j g"],
    ["Mod+j Mod+g", "Mod+j g"],
    ["Cmd+Shift+K", "Mod+Shift+k"],
    ["⌘+⇧+K", "Mod+Shift+k"],
    ["shift+ctrl+x", "Ctrl+Shift+x"],
    ["control+]", "Ctrl+]"],
    ["Ctrl+]", "Ctrl+]"],
    ["Mod+Up", "Mod+ArrowUp"],
    ["Option+Mod+Return", "Mod+Alt+Enter"],
    ["Mod++", "Mod++"],
  ])("reads %s as %s", (written, keys) => {
    expect(readKeys(written)).toEqual({ keys });
  });

  it.each(["Hyper+k", "Mod+Wheel", "Mod+j g h", "Mod+Ctrl+k", "Mod+Shift+/"])("cannot read %s", (written) => {
    expect(readKeys(written)).toHaveProperty("reason");
  });
});

describe("choosing shortcuts", () => {
  it("takes several keys separated by commas", () => {
    expect(chosen({ "zoom-in": "Ctrl+], Mod+j z" }).keys).toEqual(new Map([["zoom-in", ["Ctrl+]", "Mod+j z"]]]));
  });

  it("unbinds a command set to none", () => {
    expect(chosen({ duplicate: "none" }).keys).toEqual(new Map([["duplicate", []]]));
  });

  it.each([
    ["g", "types a character"],
    ["Shift+g", "types a character"],
    ["Alt+Shift+k", "types a character"],
    ["Mod+Alt+k", "Alt with a letter"],
    ["Mod+n", "the browser keeps it"],
    ["Ctrl+Shift+t", "the browser keeps it"],
    ["Mod+w", "the browser keeps it"],
    ["Mod+j", "stays the prefix"],
    ["Mod+j Escape", "Escape cancels the prefix"],
    ["Mod+k Mod+g", "only Mod+j can start a sequence"],
    ["Mod+v", "copy, cut and paste"],
    ["Ctrl+a", "typing or moving the caret"],
  ])("refuses %s: %s", (keys, reason) => {
    const result = chosen({ tag: keys });
    expect(result.keys.has("tag")).toBe(false);
    expect(result.refused).toEqual([{ name: "tag", keys, reason: expect.stringContaining(reason) }]);
  });

  it("keeps the keys that can be used when others in the same setting are refused", () => {
    const result = chosen({ tag: "g, Mod+j g" });
    expect(result.keys.get("tag")).toEqual(["Mod+j g"]);
    expect(result.refused.map((each) => each.keys)).toEqual(["g"]);
  });

  it("lists unknown names and changes nothing for them", () => {
    const result = chosen({ "zoom-inn": "Ctrl+]" });
    expect(result.keys.size).toBe(0);
    expect(result.refused).toEqual([{ name: "zoom-inn", keys: "Ctrl+]", reason: "no command has this name" }]);
  });

  it("gives keys set twice to the first command that set them", () => {
    const result = chosen({ tag: "Mod+g", bold: "Mod+g" });
    expect(result.keys).toEqual(new Map([["tag", ["Mod+g"]]]));
    expect(result.refused).toEqual([{ name: "bold", keys: "Mod+g", reason: "already set for tag" }]);
  });
});

describe("putting settings over the defaults", () => {
  const defaults: Bound[] = [
    { context: "editor", name: "move-up", keys: ["Alt+Shift+ArrowUp", "Mod+Shift+ArrowUp"] },
    { context: "editor", name: "delete-item", keys: ["Mod+Shift+Backspace"] },
    { context: "editor", name: "undo", keys: ["Mod+z"] },
    { context: "editor", name: "up-to-parent", keys: ["Ctrl+u"] },
    { context: "editor", name: "tag", keys: ["Mod+j t"] },
    { context: "selection", name: "move-up", keys: ["Alt+Shift+ArrowUp", "Mod+Shift+ArrowUp"] },
    { context: "selection", name: "delete-item", keys: ["Backspace", "Delete", "Mod+Shift+Backspace"] },
    { context: "global", name: "search", keys: ["Mod+f"] },
    { context: "global", name: "search", keys: ["/"] },
    { context: "global", name: "undo", keys: ["Mod+z"] },
  ];

  function keysOf(bindings: Bound[], context: string, name: CommandName): string[][] {
    return bindings.filter((each) => each.context === context && each.name === name).map((each) => each.keys);
  }

  it("replaces a command's keys, in selection mode too", () => {
    const { bindings } = applyShortcuts(defaults, new Map([["move-up", ["Mod+Alt+ArrowUp"]]]), false);
    expect(keysOf(bindings, "editor", "move-up")).toEqual([["Mod+Alt+ArrowUp"]]);
    expect(keysOf(bindings, "selection", "move-up")).toEqual([["Mod+Alt+ArrowUp"]]);
  });

  it("keeps the keys selection mode has of its own", () => {
    const { bindings } = applyShortcuts(defaults, new Map([["delete-item", ["Mod+Shift+x"]]]), false);
    expect(keysOf(bindings, "selection", "delete-item")).toEqual([["Backspace", "Delete", "Mod+Shift+x"]]);
  });

  it("replaces every default key of a command and puts the new ones on its first binding", () => {
    const { bindings } = applyShortcuts(defaults, new Map([["search", ["Mod+g"]]]), false);
    expect(keysOf(bindings, "global", "search")).toEqual([["Mod+g"], []]);
  });

  it("sets a command the same in the editor and outside it", () => {
    const { bindings } = applyShortcuts(defaults, new Map([["undo", ["Mod+u"]]]), true);
    expect(keysOf(bindings, "editor", "undo")).toEqual([["Mod+u"]]);
    expect(keysOf(bindings, "global", "undo")).toEqual([["Mod+u"]]);
  });

  it("unbinds a command set to no keys", () => {
    const { bindings } = applyShortcuts(defaults, new Map([["tag", []]]), false);
    expect(keysOf(bindings, "editor", "tag")).toEqual([[]]);
  });

  it("takes the keys from the command that had them and says so", () => {
    const { bindings, lost } = applyShortcuts(defaults, new Map([["tag", ["Mod+Shift+Backspace"]]]), false);
    expect(keysOf(bindings, "editor", "delete-item")).toEqual([[]]);
    expect(keysOf(bindings, "selection", "delete-item")).toEqual([["Backspace", "Delete"]]);
    expect(lost).toEqual([{ name: "delete-item", keys: "Mod+Shift+Backspace", to: "tag" }]);
  });

  it("outside a Mac, counts Ctrl and Mod as the same key", () => {
    const linux = applyShortcuts(defaults, new Map([["tag", ["Mod+u"]]]), false);
    expect(keysOf(linux.bindings, "editor", "up-to-parent")).toEqual([[]]);
    expect(linux.lost).toEqual([{ name: "up-to-parent", keys: "Ctrl+u", to: "tag" }]);
    const mac = applyShortcuts(defaults, new Map([["tag", ["Mod+u"]]]), true);
    expect(keysOf(mac.bindings, "editor", "up-to-parent")).toEqual([["Ctrl+u"]]);
    expect(mac.lost).toEqual([]);
  });

  it("leaves the defaults alone", () => {
    applyShortcuts(defaults, new Map([["move-up", ["Mod+Alt+ArrowUp"]]]), false);
    expect(defaults[0].keys).toEqual(["Alt+Shift+ArrowUp", "Mod+Shift+ArrowUp"]);
  });
});
