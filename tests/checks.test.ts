import { describe, expect, it } from "vitest";
import { Doc, ItemId, ROOT, appendChild, emptyDoc, liftNoteProperties, setItemProperty, setNote } from "../src/model";
import { checksFor, ensureChecks, problemInCheckRow, problemWith, problemsInChecks, startsAValidType } from "../src/checks";
import { bookmarksIn } from "../src/bookmarks";
import { BOOKMARKS, withSettingsItems } from "../src/model";

function add(doc: Doc, parent: ItemId, text: string, properties: Record<string, string> = {}): { doc: Doc; id: ItemId } {
  const created = appendChild(doc, parent, text);
  const written = Object.entries(properties).reduce((next, [key, value]) => setItemProperty(next, created.id, key, value), created.doc);
  return { doc: written, id: created.id };
}

/** TODO: with a Checks: child holding `checks` (a check's values listed after it) and an item under TODO:. */
function board(checks: [string, ...string[]][]): { doc: Doc; todo: ItemId; item: ItemId; checksId: ItemId } {
  let { doc, id: todo } = add(emptyDoc(), ROOT, "TODO:");
  const checksId = add(doc, todo, "Checks:");
  doc = checksId.doc;
  for (const [text, ...values] of checks) {
    const check = add(doc, checksId.id, text);
    doc = values.reduce((next, value) => add(next, check.id, value).doc, check.doc);
  }
  const item = add(doc, todo, "Fix it");
  return { doc: item.doc, todo, item: item.id, checksId: checksId.id };
}

describe("checksFor", () => {
  it("reads each kind of check under the item's ancestors", () => {
    const { doc, item } = board([["effort: one of", "low", "medium"], ["estimate: unique integer"], ["deadline: date"], ["start: time"], ["note: text"]]);
    const checks = checksFor(doc, item);
    expect([...checks.keys()]).toEqual(["effort", "estimate", "deadline", "start", "note"]);
    expect(checks.get("estimate")?.unique).toBe(true);
    expect(checks.get("effort")?.type).toEqual({ kind: "oneOf", values: ["low", "medium"] });
  });

  it("lets the nearest Checks: decide a key", () => {
    const { doc, todo } = board([["effort: one of", "low", "high"]]);
    const inner = add(doc, todo, "Inner");
    const innerChecks = add(inner.doc, inner.id, "Checks:");
    const innerEffort = add(innerChecks.doc, innerChecks.id, "effort: one of");
    const deep = add(add(innerEffort.doc, innerEffort.id, "tiny").doc, inner.id, "Deep");
    expect(problemWith(deep.doc, deep.id, "effort", "tiny")).toBeNull();
    expect(problemWith(deep.doc, deep.id, "effort", "low")).toContain("one of tiny");
  });

  it("ignores an unreadable check and checks nothing there", () => {
    const { doc, item, checksId } = board([["estimat: integr"], ["effort: one of"]]);
    expect(checksFor(doc, item).size).toBe(0);
    expect([...problemsInChecks(doc, checksId).values()].map((problem) => problem.split(";")[0])).toHaveLength(2);
  });

  it("flags a key checked twice, children under anything but one of, and a value listed twice", () => {
    const { doc, checksId } = board([["effort: integer"], ["effort: text"], ["size: integer", "x"], ["kind: one of", "bug", "Bug"]]);
    const problems = problemsInChecks(doc, checksId);
    const texts = [...problems].map(([id, problem]) => `${doc.items[id].text} -> ${problem}`);
    expect(texts.some((line) => line.startsWith("size: integer"))).toBe(true);
    expect(texts.some((line) => line.includes("already checked above"))).toBe(true);
    expect(texts.some((line) => line.includes("listed twice"))).toBe(true);
  });

  it("does not check the Checks: item itself", () => {
    const { doc, checksId } = board([["effort: integer"]]);
    expect(checksFor(doc, checksId).size).toBe(0);
  });
});

describe("problemWith", () => {
  const { doc, item } = board([["effort: one of", "low", "medium", "epic"], ["estimate: integer"], ["start: time"], ["deadline: date"], ["scale: one of 1..9"]]);

  it("accepts a listed value in any case and refuses another", () => {
    expect(problemWith(doc, item, "effort", "Medium")).toBeNull();
    expect(problemWith(doc, item, "effort", "huge")).toBe('effort must be one of low, medium, epic (checked under "TODO:")');
  });

  it("checks integers, times and dates", () => {
    expect(problemWith(doc, item, "estimate", "-3")).toBeNull();
    expect(problemWith(doc, item, "estimate", "3h")).toContain("must be an integer");
    expect(problemWith(doc, item, "start", "9:30")).toBeNull();
    expect(problemWith(doc, item, "start", "25:00")).toContain("must be a time");
    expect(problemWith(doc, item, "deadline", "2026-11-19")).toBeNull();
    expect(problemWith(doc, item, "deadline", "soon")).toContain("must be a date");
  });

  it("writes an integer range without listing it", () => {
    expect(problemWith(doc, item, "scale", "9")).toBeNull();
    expect(problemWith(doc, item, "scale", "10")).toContain("one of 1..9");
  });

  it("lets an empty value, a formula and an unchecked key through", () => {
    expect(problemWith(doc, item, "estimate", "")).toBeNull();
    expect(problemWith(doc, item, "estimate", "=parent.estimate")).toBeNull();
    expect(problemWith(doc, item, "colour", "red")).toBeNull();
  });

  it("holds a unique value across the whole ruled subtree and names the holder", () => {
    const withUnique = board([["key: unique one of 1..9"]]);
    const first = add(withUnique.doc, withUnique.item, "Deep first", { key: "1" });
    const second = add(first.doc, withUnique.todo, "Second");
    expect(problemWith(second.doc, second.id, "key", "1")).toBe('key 1 is already on "Deep first" (unique under "TODO:")');
    expect(problemWith(second.doc, second.id, "key", "2")).toBeNull();
    expect(problemWith(second.doc, first.id, "key", "1")).toBeNull();
  });

  it("can hold a unique free text", () => {
    const withUnique = board([["code: unique text"]]);
    const first = add(withUnique.doc, withUnique.todo, "A", { code: "x" });
    const second = add(first.doc, withUnique.todo, "B");
    expect(problemWith(second.doc, second.id, "code", "x")).toContain("already on");
  });
});

describe("ensureChecks", () => {
  it("makes a folded Checks: child once", () => {
    const { doc, id } = add(emptyDoc(), ROOT, "Page");
    const made = ensureChecks(doc, id);
    expect(made.doc.items[made.id]).toMatchObject({ text: "Checks:", collapsed: true });
    expect(ensureChecks(made.doc, id)).toEqual({ doc: made.doc, id: made.id });
  });
});

describe("problemInCheckRow", () => {
  it("is empty for a good check and names the problem of a bad one", () => {
    const { doc, checksId } = board([["effort: integer"], ["estimat: integr"]]);
    const [good, bad] = doc.items[checksId].children;
    expect(problemInCheckRow(doc, good)).toBe("");
    expect(problemInCheckRow(doc, bad)).toContain("Unknown type");
  });
});

describe("startsAValidType", () => {
  it("accepts the start of every type, with or without unique", () => {
    for (const written of ["", "i", "int", "integer", "one", "one of", "unique ", "unique one of 1..9", "one of 1.", "t", "d"]) expect(startsAValidType(written)).toBe(true);
  });

  it("refuses text that starts no type", () => {
    for (const written of ["x", "intx", "integr", "one of x", "uniqe"]) expect(startsAValidType(written)).toBe(false);
  });
});

describe("a :key: line in a note", () => {
  it("stays in the note when its value is refused", () => {
    const { doc, item } = board([["effort: one of", "low"]]);
    const typed = setNote(doc, item, ":effort: huge\n:other: 1");
    const lifted = liftNoteProperties(typed, [item], (id, key, value) => problemWith(typed, id, key, value) !== null);
    expect(lifted.items[item]).toMatchObject({ note: ":effort: huge", properties: { other: "1" } });
  });
});

describe("Bookmarks with a Checks: child", () => {
  it("does not take the Checks: child for a bookmark", () => {
    const added = add(withSettingsItems(emptyDoc()), BOOKMARKS, "Checks:");
    expect(bookmarksIn(added.doc)).toEqual([]);
  });
});
