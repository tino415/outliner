import { describe, expect, it } from "vitest";
import { Doc, ItemId, ROOT, setItemProperty } from "../src/model";
import { setNoteAsTyped as setNote } from "./typed";
import { parseIndentedText } from "../src/transfer";
import {
  columnCells,
  declaredColumns,
  formatAmount,
  inferredColumns,
  parseAmount,
  parseColumns,
} from "../src/properties";
import { propertiesOf, splitPropertyLines } from "../src/notes";
import { parseDoc } from "../src/storage";
import { parseSyncRequest } from "../src/sync/protocol";

function idOf(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

/** An outline whose notes come after a "|" on each line: "Lunch | :calories: 600". */
function outline(text: string): Doc {
  const lines = text.split("\n");
  let doc = parseIndentedText(lines.map((line) => line.split(" | ")[0]).join("\n"));
  for (const line of lines) {
    const [label, note] = line.trim().split(" | ");
    if (note) doc = setNote(doc, idOf(doc, label), note.replaceAll("; ", "\n"));
  }
  return doc;
}

describe("property lines", () => {
  it("reads :key: value lines and ignores the rest of the note", () => {
    const properties = propertiesOf("Bought at the market\n:Calories: 350 kcal\n:effort:2h\nnot a: property");
    expect([...properties]).toEqual([
      ["calories", "350 kcal"],
      ["effort", "2h"],
    ]);
  });

  it("does not read property lines inside a code block", () => {
    expect([...propertiesOf("```yaml\n:key: in code\n```\n:real: 1")]).toEqual([["real", "1"]]);
  });

  it("lifts property lines out of a note, leaving code blocks and the other lines alone", () => {
    const { properties, rest } = splitPropertyLines("text\n:Effort: 1h\n```\n:effort: 5h\n```\nmore\n:effort: 2h\n");
    expect([...properties]).toEqual([["effort", "2h"]]);
    expect(rest).toBe("text\n```\n:effort: 5h\n```\nmore");
  });
});

describe("properties of an item", () => {
  const base = parseIndentedText("item");
  const id = base.items[ROOT].children[0];

  it("sets, changes and removes one property, keys in lower case", () => {
    const set = setItemProperty(base, id, "Effort", " 2h ");
    expect(set.items[id].properties).toEqual({ effort: "2h" });
    expect(setItemProperty(set, id, "effort", "2h")).toBe(set);
    expect(setItemProperty(set, id, "effort", "3h").items[id].properties).toEqual({ effort: "3h" });
    expect(setItemProperty(set, id, "effort", "").items[id].properties).toEqual({});
  });

  it("takes typed property lines from the note when it is left", () => {
    const typed = setNote(base, id, "remember\n:kcal: 300 kcal");
    expect(typed.items[id]).toMatchObject({ note: "remember", properties: { kcal: "300 kcal" } });
  });

  it("only takes keys the sync server accepts, so one odd key cannot stop syncing", () => {
    const long = `:${"a".repeat(65)}: x`;
    const typed = setNote(base, id, long);
    expect(typed.items[id]).toMatchObject({ note: long, properties: {} });
    expect(setItemProperty(base, id, "İd", "1").items[id].properties).toEqual({});
    const fields = Object.keys(setItemProperty(base, id, "a".repeat(64), "1").items[id].properties).map((key) => `prop:${key}`);
    expect(() => parseSyncRequest({ since: 0, changes: fields.map((field) => ({ item: id, field, value: "1", clock: "1" })) })).not.toThrow();
  });

  it("drops keys the sync server would refuse from an outline read from JSON, and lower-cases the rest", () => {
    const raw = JSON.stringify({ items: { ...base.items, [id]: { ...base.items[id], properties: { "my key": "1", effort: "2h", Kcal: "300" } } } });
    expect(parseDoc(raw).items[id].properties).toEqual({ effort: "2h", kcal: "300" });
  });
});

describe("amounts", () => {
  it.each([
    ["350", "350"],
    ["350 kcal", "350 kcal"],
    ["12,5 g", "12.5 g"],
    ["45m", "45m"],
    ["1h30m", "1h 30m"],
    ["1:30", "1:30"],
    ["2h", "2h"],
    ["1d", "24h"],
    ["0.5h", "30m"],
  ])("reads %s as %s", (raw, shown) => {
    expect(formatAmount(parseAmount(raw)!)).toBe(shown);
  });

  it("leaves text alone", () => {
    expect(parseAmount("high")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("columns", () => {
  it("parses org-style summaries", () => {
    expect(parseColumns("effort{+} calories{mean} weight{max} cost")).toEqual([
      { key: "effort", summary: "sum" },
      { key: "calories", summary: "mean" },
      { key: "weight", summary: "max" },
      { key: "cost", summary: "sum" },
    ]);
  });

  it("finds columns declared on the page or the nearest ancestor", () => {
    const doc = outline("Plan | :columns: effort{+}\n  Week\n    Task | :effort: 1h\nOther");
    expect(declaredColumns(doc, idOf(doc, "Week"))).toEqual([{ key: "effort", summary: "sum" }]);
    expect(declaredColumns(doc, idOf(doc, "Other"))).toBeNull();
  });

  it("infers columns from the properties under a page", () => {
    const doc = outline("a | :calories: 1; :protein: 2\nb | :effort: 1h");
    expect(inferredColumns(doc, ROOT).map((column) => column.key)).toEqual(["calories", "protein", "effort"]);
  });
});

describe("rollups", () => {
  const week = outline(
    [
      "Week 41",
      "  Monday",
      "    Breakfast",
      "      Oats | :calories: 300 kcal",
      "      Coffee | :calories: 20 kcal",
      "    Lunch",
      "      Soup | :calories: 250 kcal",
      "  Tuesday",
      "    Brunch | :calories: 400 kcal",
    ].join("\n"),
  );
  const calories = [{ key: "calories", summary: "sum" as const }];

  it("sums calories per meal, per day and per week", () => {
    const cells = columnCells(week, ROOT, calories);
    const shown = (text: string) => cells.get(idOf(week, text))!.get("calories");
    expect(shown("Oats")).toEqual({ text: "300 kcal", rolled: false });
    expect(shown("Breakfast")).toEqual({ text: "320 kcal", rolled: true });
    expect(shown("Monday")).toEqual({ text: "570 kcal", rolled: true });
    expect(shown("Tuesday")).toEqual({ text: "400 kcal", rolled: true });
    expect(shown("Week 41")).toEqual({ text: "970 kcal", rolled: true });
  });

  it("sums effort durations and takes means and maxima of children", () => {
    const plan = outline("Project\n  Design | :effort: 1h30m\n  Build | :effort: 2d\n  Test | :effort: 45m");
    const project = idOf(plan, "Project");
    expect(columnCells(plan, ROOT, [{ key: "effort", summary: "sum" }]).get(project)!.get("effort")!.text).toBe("50h 15m");
    expect(columnCells(plan, ROOT, [{ key: "effort", summary: "max" }]).get(project)!.get("effort")!.text).toBe("48h");
    expect(columnCells(plan, ROOT, [{ key: "effort", summary: "mean" }]).get(project)!.get("effort")!.text).toBe("16h 45m");
  });

  it("reads org's duration summaries {:min} {:max} {:mean}", () => {
    expect(parseColumns("effort{:max} a{:min} b{:mean} c{:}")).toEqual([
      { key: "effort", summary: "max" },
      { key: "a", summary: "min" },
      { key: "b", summary: "mean" },
      { key: "c", summary: "sum" },
    ]);
  });

  it("adds plain numbers to numbers with a unit, whatever their order", () => {
    const doc = outline("Day\n  a | :kcal: 200\n  b | :kcal: 300 kcal");
    expect(columnCells(doc, ROOT, [{ key: "kcal", summary: "sum" }]).get(idOf(doc, "Day"))!.get("kcal")!.text).toBe("500 kcal");
  });

  it("reads 1h30 as a duration and 1,200 as twelve hundred", () => {
    expect(formatAmount(parseAmount("1h30")!)).toBe("1h 30m");
    expect(formatAmount(parseAmount("1,200 kcal")!)).toBe("1200 kcal");
    expect(formatAmount(parseAmount("1,5 g")!)).toBe("1.5 g");
  });

  it("leaves hidden completed items out of the totals", () => {
    let doc = outline("Plan\n  a | :effort: 1h\n  b | :effort: 5h");
    doc = { items: { ...doc.items, [idOf(doc, "b")]: { ...doc.items[idOf(doc, "b")], completed: true } } };
    const effort = [{ key: "effort", summary: "sum" as const }];
    expect(columnCells(doc, ROOT, effort, { showCompleted: false }).get(idOf(doc, "Plan"))!.get("effort")!.text).toBe("1h");
    expect(columnCells(doc, ROOT, effort, { showCompleted: true }).get(idOf(doc, "Plan"))!.get("effort")!.text).toBe("6h");
  });

  it("shows text values as they are and leaves rows without values empty", () => {
    const doc = outline("a | :mood: great\nb");
    const cells = columnCells(doc, ROOT, [{ key: "mood", summary: "sum" }]);
    expect(cells.get(idOf(doc, "a"))!.get("mood")).toEqual({ text: "great", rolled: false });
    expect(cells.get(idOf(doc, "b"))!.get("mood")).toBeUndefined();
    expect(cells.get(ROOT)!.get("mood")).toBeUndefined();
  });
});
