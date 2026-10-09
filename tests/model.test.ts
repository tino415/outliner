import { describe, expect, it } from "vitest";
import {
  Doc,
  ItemId,
  ROOT,
  completeAll,
  indentAll,
  moveAllDown,
  moveAllUp,
  outdentAll,
  selectionRoots,
  duplicate,
  indent,
  removeCompleted,
  mergeInto,
  moveDown,
  moveTo,
  moveUp,
  outdent,
  remove,
  setFlags,
  split,
  visibleOrder,
  childrenInOrder,
  newChildIndex,
  setNote,
  shownChildren,
  insertChild,
  withPrivateIds,
} from "../src/model";
import { parseIndentedText, subtreesAsText } from "../src/transfer";
import { findItems, search } from "../src/search";

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

describe("order of children", () => {
  function withCompleted(note: string): Doc {
    let doc = outline("Tasks\n  old\n  open one\n  older\n  open two\n    done inside\n    open inside\nElsewhere\n  done\n  open");
    doc = setNote(doc, idOf(doc, "Tasks"), note);
    for (const text of ["old", "older", "done inside", "done"]) doc = setFlags(doc, idOf(doc, text), { completed: true });
    return doc;
  }

  const texts = (doc: Doc, ids: ItemId[]) => ids.map((id) => doc.items[id].text);

  it("puts completed children last under a page with :completed: last, and below it", () => {
    const doc = withCompleted(":completed: last");
    expect(texts(doc, childrenInOrder(doc, idOf(doc, "Tasks")))).toEqual(["open one", "open two", "old", "older"]);
    expect(texts(doc, childrenInOrder(doc, idOf(doc, "open two")))).toEqual(["open inside", "done inside"]);
    expect(texts(doc, childrenInOrder(doc, idOf(doc, "Elsewhere")))).toEqual(["done", "open"]);
    expect(texts(doc, shownChildren(doc, idOf(doc, "Tasks"), all))).toEqual(["open one", "open two", "old", "older"]);
  });

  it("keeps the written order without it", () => {
    const doc = withCompleted("");
    expect(texts(doc, childrenInOrder(doc, idOf(doc, "Tasks")))).toEqual(["old", "open one", "older", "open two"]);
  });

  it("reads reading order, moves and indents in the shown order", () => {
    const doc = withCompleted(":completed: last");
    const tasks = idOf(doc, "Tasks");
    expect(texts(doc, visibleOrder(doc, tasks, all)).slice(0, 3)).toEqual(["open one", "open two", "open inside"]);
    const indented = indent(doc, idOf(doc, "open two"), all);
    expect(indented.items[idOf(doc, "open two")].parent).toBe(idOf(doc, "open one"));
    const moved = moveUp(doc, idOf(doc, "open two"), all);
    expect(texts(moved, childrenInOrder(moved, tasks))).toEqual(["open two", "open one", "old", "older"]);
  });

  it("files new children first under a page with :new: top, and last otherwise", () => {
    const doc = withCompleted(":new: top");
    expect(newChildIndex(doc, idOf(doc, "Tasks"))).toBe(0);
    expect(newChildIndex(doc, idOf(doc, "Elsewhere"))).toBe(2);
    expect(newChildIndex(doc, idOf(doc, "open two"))).toBe(2);
  });
});

describe("ids inside a private item", () => {
  it("are made under the private item", () => {
    let doc = outline("Journal\n  day one");
    doc = setNote(doc, idOf(doc, "Journal"), ":private: personal");
    const journal = idOf(doc, "Journal");
    const created = insertChild(doc, journal, 0, "new");
    expect(created.id.startsWith(`${journal}~`)).toBe(true);
    expect(insertChild(created.doc, created.id, 0, "deeper").id.startsWith(`${journal}~`)).toBe(true);
    expect(insertChild(doc, ROOT, 0, "public").id).not.toContain("~");
  });

  it("are given to items that were there before, and links follow", () => {
    let doc = outline("Journal\n  day one\n    detail\nIndex");
    const [journal, dayOne, index] = [idOf(doc, "Journal"), idOf(doc, "day one"), idOf(doc, "Index")];
    doc = setNote(doc, index, `see [[id:${dayOne}][day one]]`);
    doc = setNote(doc, journal, ":private: personal");
    const { doc: named, renamed } = withPrivateIds(doc);
    expect(renamed.get(dayOne)).toBe(`${journal}~${dayOne}`);
    expect(named.items[journal].children).toEqual([`${journal}~${dayOne}`]);
    expect(named.items[`${journal}~${dayOne}`].children).toEqual([`${journal}~${idOf(doc, "detail")}`]);
    expect(named.items[index].note).toBe(`see [[id:${journal}~${dayOne}][day one]]`);
    expect(named.items[dayOne]).toBeUndefined();
    consistent(named);
    expect(withPrivateIds(named).doc).toBe(named);
  });
});

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

describe("duplicate and clean up", () => {
  it("duplicates a subtree right after the original with fresh ids", () => {
    const doc = outline("a\n  a1\nb");
    const result = duplicate(doc, idOf(doc, "a"));
    expect(render(result.doc)).toBe("a\n  a1\na\n  a1\nb");
    expect(result.id).not.toBe(idOf(doc, "a"));
    consistent(result.doc);
  });

  it("removes completed items and everything under them", () => {
    let doc = outline("a\n  a1\n  a2\nb\n  b1");
    doc = setFlags(doc, idOf(doc, "a1"), { completed: true });
    doc = setFlags(doc, idOf(doc, "b"), { completed: true });
    const result = removeCompleted(doc, ROOT);
    expect(render(result.doc)).toBe("a\n  a2");
    expect(result.count).toBe(2);
    expect(Object.keys(result.doc.items)).toHaveLength(3);
  });
});

describe("block operations on a selection", () => {
  const ids = (doc: Doc, ...texts: string[]) => texts.map((text) => idOf(doc, text));

  it("indents a block under the item above, keeping its order", () => {
    const doc = outline("a\nb\nc\nd");
    expect(render(indentAll(doc, ids(doc, "b", "c"), all))).toBe("a\n  b\n  c\nd");
  });

  it("does not indent any of a block whose first item cannot indent", () => {
    const doc = outline("a\nb");
    expect(indentAll(doc, ids(doc, "a", "b"), all)).toBe(doc);
  });

  it("outdents a block, keeping its order", () => {
    const doc = outline("p\n  a\n  b\n  c");
    expect(render(outdentAll(doc, ids(doc, "a", "b"), ROOT))).toBe("p\n  c\na\nb");
  });

  it("moves a block up and down as one", () => {
    const doc = outline("a\nb\nc\nd");
    expect(render(moveAllUp(doc, ids(doc, "c", "d"), all))).toBe("a\nc\nd\nb");
    expect(render(moveAllDown(doc, ids(doc, "a", "b"), all))).toBe("c\na\nb\nd");
    expect(moveAllDown(doc, ids(doc, "c", "d"), all)).toBe(doc);
  });

  it("does not move a block whose roots have different parents", () => {
    const doc = outline("a\n  a1\n  a2\nb\nc");
    expect(moveAllUp(doc, ids(doc, "a2", "b"), all)).toBe(doc);
    expect(moveAllDown(doc, ids(doc, "a2", "b"), all)).toBe(doc);
  });

  it("completes all, or uncompletes all when every one is already complete", () => {
    let doc = outline("a\nb");
    doc = setFlags(doc, idOf(doc, "a"), { completed: true });
    const once = completeAll(doc, ids(doc, "a", "b"));
    expect(render(once)).toBe("a [x]\nb [x]");
    expect(render(completeAll(once, ids(doc, "a", "b")))).toBe("a\nb");
  });

  it("keeps only the roots of a selection", () => {
    const doc = outline("a\n  a1\nb");
    expect(selectionRoots(doc, ids(doc, "a", "a1", "b"))).toEqual(ids(doc, "a", "b"));
  });

  it("copies subtrees as a markdown list that pastes back", () => {
    const doc = outline("a\n  a1\nb");
    const text = subtreesAsText(doc, ids(doc, "a"));
    expect(text).toBe("- a\n  - a1");
    expect(render(parseIndentedText(text))).toBe("a\n  a1");
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

  it("ranks prefix matches, then word starts, then shallow items", () => {
    const doc = outline("thread\n  reading list\nreading\nspread the word");
    const found = findItems(doc, "rea", 10).map((candidate) => candidate.text);
    expect(found).toEqual(["reading", "reading list", "thread", "spread the word"]);
    expect(findItems(doc, "list", 10)[0].path).toEqual(["thread"]);
  });

  it("finds items containing every term and keeps their ancestors", () => {
    const doc = outline("projects\n  garden plan\n  kitchen\nshopping\n  plan b");
    const result = search(doc, ROOT, "PLAN garden", all);
    const names = (ids: Set<ItemId>) => [...ids].map((id) => doc.items[id].text).sort();
    expect(names(result.matches)).toEqual(["garden plan"]);
    expect(names(result.shown)).toEqual(["garden plan", "projects"]);
  });
});
