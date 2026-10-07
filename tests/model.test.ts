import { describe, expect, it } from "vitest";
import {
  Doc,
  ItemId,
  ROOT,
  indent,
  mergeInto,
  moveDown,
  moveTo,
  moveUp,
  outdent,
  remove,
  setFlags,
  split,
  visibleOrder,
} from "../src/model";
import { parseIndentedText } from "../src/transfer";
import { search } from "../src/search";

const all = { showCompleted: true };

function outline(text: string): Doc {
  return parseIndentedText(text);
}

function idOf(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

function render(doc: Doc, top: ItemId = ROOT, depth = 0): string {
  return doc.items[top].children
    .map((id) => {
      const item = doc.items[id];
      const line = "  ".repeat(depth) + item.text + (item.completed ? " [x]" : "");
      const below = render(doc, id, depth + 1);
      return below ? `${line}\n${below}` : line;
    })
    .join("\n");
}

function consistent(doc: Doc): void {
  for (const item of Object.values(doc.items)) {
    for (const child of item.children) expect(doc.items[child].parent).toBe(item.id);
    if (item.parent) expect(doc.items[item.parent].children).toContain(item.id);
  }
}

describe("split", () => {
  it("moves the text after the caret into a new next sibling", () => {
    const doc = outline("hello world\nnext");
    const result = split(doc, idOf(doc, "hello world"), 5, all);
    expect(render(result.doc)).toBe("hello\n world\nnext");
    expect(result.doc.items[result.focus].text).toBe(" world");
    consistent(result.doc);
  });

  it("opens a blank item above when the caret is at the start", () => {
    const doc = outline("hello");
    const result = split(doc, idOf(doc, "hello"), 0, all);
    expect(render(result.doc)).toBe("\nhello");
    expect(result.focus).toBe(idOf(doc, "hello"));
  });

  it("creates a first child when the item's children are shown", () => {
    const doc = outline("parent\n  child");
    const result = split(doc, idOf(doc, "parent"), 6, all);
    expect(render(result.doc)).toBe("parent\n  \n  child");
  });

  it("creates a sibling after a collapsed item", () => {
    let doc = outline("parent\n  child\nafter");
    doc = setFlags(doc, idOf(doc, "parent"), { collapsed: true });
    const result = split(doc, idOf(doc, "parent"), 6, all);
    expect(render(result.doc)).toBe("parent\n  child\n\nafter");
  });
});

describe("indent and outdent", () => {
  it("indents under the previous sibling, at the end of its children", () => {
    const doc = outline("a\n  a1\nb");
    expect(render(indent(doc, idOf(doc, "b"), all))).toBe("a\n  a1\n  b");
  });

  it("does nothing for a first child", () => {
    const doc = outline("a\nb");
    expect(indent(doc, idOf(doc, "a"), all)).toBe(doc);
  });

  it("skips hidden completed siblings when choosing the new parent", () => {
    let doc = outline("a\nb\nc");
    doc = setFlags(doc, idOf(doc, "b"), { completed: true });
    const next = indent(doc, idOf(doc, "c"), { showCompleted: false });
    expect(render(next)).toBe("a\n  c\nb [x]");
  });

  it("outdents to just after the parent", () => {
    const doc = outline("a\n  a1\n  a2\nb");
    expect(render(outdent(doc, idOf(doc, "a1"), ROOT))).toBe("a\n  a2\na1\nb");
  });

  it("does not outdent past the zoomed item", () => {
    const doc = outline("a\n  a1");
    expect(outdent(doc, idOf(doc, "a1"), idOf(doc, "a"))).toBe(doc);
  });
});

describe("moving", () => {
  it("swaps with siblings", () => {
    const doc = outline("a\nb\nc");
    expect(render(moveUp(doc, idOf(doc, "c"), all))).toBe("a\nc\nb");
    expect(render(moveDown(doc, idOf(doc, "a"), all))).toBe("b\na\nc");
  });

  it("stays put at the edges", () => {
    const doc = outline("a\nb");
    expect(moveUp(doc, idOf(doc, "a"), all)).toBe(doc);
    expect(moveDown(doc, idOf(doc, "b"), all)).toBe(doc);
  });

  it("moves an item into another parent, accounting for its own old slot", () => {
    const doc = outline("a\nb\nc\n  c1");
    expect(render(moveTo(doc, idOf(doc, "a"), ROOT, 2))).toBe("b\na\nc\n  c1");
    expect(render(moveTo(doc, idOf(doc, "a"), idOf(doc, "c"), 1))).toBe("b\nc\n  c1\n  a");
  });

  it("refuses to move an item into its own subtree", () => {
    const doc = outline("a\n  b");
    expect(moveTo(doc, idOf(doc, "a"), idOf(doc, "b"), 0)).toBe(doc);
  });
});

describe("merging and removing", () => {
  it("joins text with the item above and reports the seam", () => {
    const doc = outline("hello\nworld");
    const merged = mergeInto(doc, idOf(doc, "world"), idOf(doc, "hello"));
    expect(render(merged.doc)).toBe("helloworld");
    expect(merged.offset).toBe(5);
    consistent(merged.doc);
  });

  it("keeps the children of a merged first child in place under the parent", () => {
    const doc = outline("parent\n  first\n    deep\n  second");
    const merged = mergeInto(doc, idOf(doc, "first"), idOf(doc, "parent"));
    expect(render(merged.doc)).toBe("parentfirst\n  deep\n  second");
    consistent(merged.doc);
  });

  it("hands children to the item above when merging siblings", () => {
    const doc = outline("a\nb\n  b1");
    const merged = mergeInto(doc, idOf(doc, "b"), idOf(doc, "a"));
    expect(render(merged.doc)).toBe("ab\n  b1");
  });

  it("removes a whole subtree", () => {
    const doc = outline("a\n  a1\n    a2\nb");
    const next = remove(doc, idOf(doc, "a"));
    expect(render(next)).toBe("b");
    expect(Object.keys(next.items)).toHaveLength(2);
  });
});

describe("reading order and search", () => {
  it("skips collapsed and hidden completed items", () => {
    let doc = outline("a\n  a1\nb\n  b1\nc");
    doc = setFlags(doc, idOf(doc, "a"), { collapsed: true });
    doc = setFlags(doc, idOf(doc, "c"), { completed: true });
    const order = visibleOrder(doc, ROOT, { showCompleted: false }).map((id) => doc.items[id].text);
    expect(order).toEqual(["a", "b", "b1"]);
  });

  it("finds items containing every term and keeps their ancestors", () => {
    const doc = outline("projects\n  garden plan\n  kitchen\nshopping\n  plan b");
    const result = search(doc, ROOT, "PLAN garden", all);
    const names = (ids: Set<ItemId>) => [...ids].map((id) => doc.items[id].text).sort();
    expect(names(result.matches)).toEqual(["garden plan"]);
    expect(names(result.shown)).toEqual(["garden plan", "projects"]);
  });
});
