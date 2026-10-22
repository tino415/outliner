import { describe, expect, it } from "vitest";
import { byDate, byParent, groupingOf, parseQuery, queryMatches, queryOf } from "../src/query";
import { Doc, ROOT, setFlags, setItemProperty } from "../src/model";
import { parseIndentedText } from "../src/transfer";

const MONDAY = "2026-10-19";

const OUTLINE = [
  "Projects",
  "  Outliner",
  "    Query views #feature",
  "    Crash on paste #bug",
  "    Agenda #feature",
  "  Garden",
  "    Fence #todo 2026-10-15",
  "    Seeds #todo 2026-10-21",
  "Inbox",
  "  Draft #feature",
  "  Call mum",
].join("\n");

function outline(text = OUTLINE, change: (doc: Doc, idOf: (text: string) => string) => Doc = (doc) => doc): Doc {
  const doc = parseIndentedText(text);
  return change(doc, (wanted) => Object.values(doc.items).find((item) => item.text === wanted)!.id);
}

function found(doc: Doc, query: string, showCompleted = true): string[] {
  return queryMatches(doc, ROOT, parseQuery(query, MONDAY), { showCompleted }).map((id) => doc.items[id].text);
}

describe("the query language", () => {
  it("finds tagged items anywhere, in reading order", () => {
    expect(found(outline(), "#feature")).toEqual(["Query views #feature", "Agenda #feature", "Draft #feature"]);
  });

  it("needs every word of an alternative, and any one alternative", () => {
    expect(found(outline(), "#feature query")).toEqual(["Query views #feature"]);
    expect(found(outline(), "#bug OR call")).toEqual(["Crash on paste #bug", "Call mum"]);
  });

  it("leaves out items with a word written after a minus", () => {
    expect(found(outline(), "#feature -draft -agenda")).toEqual(["Query views #feature"]);
  });

  it("keeps items below a path, given whole or by its last parts", () => {
    expect(found(outline(), 'under:"Projects/Outliner" #feature')).toEqual(["Query views #feature", "Agenda #feature"]);
    expect(found(outline(), "under:garden")).toEqual(["Fence #todo 2026-10-15", "Seeds #todo 2026-10-21"]);
    expect(found(outline(), "under:Projects/Garden")).toEqual(["Fence #todo 2026-10-15", "Seeds #todo 2026-10-21"]);
    expect(found(outline(), "under:Inbox/Outliner")).toEqual([]);
  });

  it("tells open items from done ones", () => {
    const doc = outline(OUTLINE, (doc, idOf) => setFlags(doc, idOf("Agenda #feature"), { completed: true }));
    expect(found(doc, "#feature is:open")).toEqual(["Query views #feature", "Draft #feature"]);
    expect(found(doc, "#feature is:done")).toEqual(["Agenda #feature"]);
  });

  it("filters by the date words of search", () => {
    expect(found(outline(), "is:overdue")).toEqual(["Fence #todo 2026-10-15"]);
    expect(found(outline(), "#todo date:>=today")).toEqual(["Seeds #todo 2026-10-21"]);
    expect(found(outline(), "date:this-week")).toEqual(["Seeds #todo 2026-10-21"]);
  });

  it("finds items with a property set", () => {
    const doc = outline(OUTLINE, (doc, idOf) => setItemProperty(doc, idOf("Call mum"), "effort", "15m"));
    expect(found(doc, "has:effort")).toEqual(["Call mum"]);
  });

  it("does not look into what the Show completed switch hides", () => {
    const doc = outline(OUTLINE, (doc, idOf) => setFlags(doc, idOf("Garden"), { completed: true }));
    expect(found(doc, "#todo", false)).toEqual([]);
    expect(found(doc, "#todo", true)).toEqual(["Fence #todo 2026-10-15", "Seeds #todo 2026-10-21"]);
  });

  it("matches nothing when empty", () => {
    expect(found(outline(), "  ")).toEqual([]);
    expect(found(outline(), "OR")).toEqual([]);
  });
});

describe("a query item", () => {
  it("is an item with a :query:, grouped by parent unless :group: says date", () => {
    const doc = outline("Features\nPlain", (doc, idOf) => setItemProperty(setItemProperty(doc, idOf("Features"), "query", "#feature"), idOf("Features"), "group", "Date"));
    const features = Object.values(doc.items).find((item) => item.text === "Features")!;
    const plain = Object.values(doc.items).find((item) => item.text === "Plain")!;
    expect(queryOf(features)).toBe("#feature");
    expect(groupingOf(features)).toBe("date");
    expect(queryOf(plain)).toBeNull();
    expect(groupingOf(plain)).toBe("parent");
  });

  it("does not list itself", () => {
    const doc = outline("Features #feature\nAgenda #feature");
    const view = Object.values(doc.items).find((item) => item.text === "Features #feature")!.id;
    expect(queryMatches(doc, ROOT, parseQuery("#feature"), { showCompleted: true }, view).map((id) => doc.items[id].text)).toEqual(["Agenda #feature"]);
  });

  it("groups by parent in the order the parents first appear", () => {
    const doc = outline();
    const ids = queryMatches(doc, ROOT, parseQuery("#feature OR #todo"), { showCompleted: true });
    expect(byParent(doc, ids).map(({ section, ids }) => [doc.items[section].text, ids.map((id) => doc.items[id].text)])).toEqual([
      ["Outliner", ["Query views #feature", "Agenda #feature"]],
      ["Garden", ["Fence #todo 2026-10-15", "Seeds #todo 2026-10-21"]],
      ["Inbox", ["Draft #feature"]],
    ]);
  });

  it("groups by date: overdue, each day, undated, then done items dated earlier", () => {
    const doc = outline("Old 2026-10-01\nLater 2026-10-30\nSoon 2026-10-20\nUndated\nFinished 2026-10-02", (doc, idOf) => setFlags(doc, idOf("Finished 2026-10-02"), { completed: true }));
    const ids = queryMatches(doc, ROOT, parseQuery("-nothing"), { showCompleted: true });
    expect(byDate(doc, ids, MONDAY).map(({ section, ids }) => [section.kind === "day" ? section.day : section.kind, ids.map((id) => doc.items[id].text)])).toEqual([
      ["overdue", ["Old 2026-10-01"]],
      ["2026-10-20", ["Soon 2026-10-20"]],
      ["2026-10-30", ["Later 2026-10-30"]],
      ["undated", ["Undated"]],
      ["past", ["Finished 2026-10-02"]],
    ]);
  });
});
