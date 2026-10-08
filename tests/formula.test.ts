import { describe, expect, it } from "vitest";
import { Doc, ItemId, setNote } from "../src/model";
import { parseIndentedText } from "../src/transfer";
import { columnCells, declaredColumns } from "../src/properties";
import { FormulaError, parseFormula } from "../src/formula";

function idOf(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

/** An outline whose notes come after a "|" on each line, lines of a note split by "; ". */
function outline(text: string): Doc {
  const lines = text.split("\n");
  let doc = parseIndentedText(lines.map((line) => line.split(" | ")[0]).join("\n"));
  for (const line of lines) {
    const [label, note] = line.trim().split(" | ");
    if (note) doc = setNote(doc, idOf(doc, label), note.replaceAll("; ", "\n"));
  }
  return doc;
}

function column(doc: Doc, page: string, key: string): Record<string, string> {
  const top = idOf(doc, page);
  const cells = columnCells(doc, top, declaredColumns(doc, top)!);
  return Object.fromEntries(Object.values(doc.items).flatMap((item) => (cells.get(item.id)?.get(key) ? [[item.text, cells.get(item.id)!.get(key)!.text]] : [])));
}

describe("computed columns", () => {
  const MONDAY = [
    "Monday | :start: 9:00; :columns: effort start{=clock(parent.start + before(effort))}",
    "  Standup | :effort: 15m",
    "  Deep work",
    "    Write | :effort: 1h30m",
    "    Review | :effort: 45m",
    "  Lunch | :effort: 1h",
    "  Calls | :start: 14:00; :effort: 30m",
    "  Email | :effort: 20m",
  ].join("\n");

  it("starts each item after the durations before it, up to the page (Martin's time plan)", () => {
    expect(column(outline(MONDAY), "Monday", "start")).toEqual({
      Monday: "9:00",
      Standup: "9:00",
      "Deep work": "9:15",
      Write: "9:15",
      Review: "10:45",
      Lunch: "11:30",
      Calls: "14:00",
      Email: "13:00",
    });
  });

  it("an item's own value wins over the formula, a computed value is marked as such", () => {
    const doc = outline(MONDAY);
    const top = idOf(doc, "Monday");
    const cells = columnCells(doc, top, declaredColumns(doc, top)!);
    expect(cells.get(idOf(doc, "Calls"))!.get("start")!.computed).toBeFalsy();
    expect(cells.get(idOf(doc, "Email"))!.get("start")!.computed).toBe(true);
  });

  it("does arithmetic on numbers with units and on durations", () => {
    const doc = outline(
      [
        "Day | :columns: kcal kj{=kcal * 4.184} left{=2000 - sum(kcal)} share{=kcal / parent.kcal * 100}",
        "  Oats | :kcal: 300 kcal",
        "  Soup | :kcal: 200 kcal",
      ].join("\n"),
    );
    expect(column(doc, "Day", "kj")).toEqual({ Oats: "1255.2 kcal", Soup: "836.8 kcal" });
    expect(column(doc, "Day", "share")).toEqual({ Oats: "60", Soup: "40" });
  });

  it("shows an error in the cell instead of failing the view", () => {
    const doc = outline("P | :columns: a b{=a +}\n  x | :a: 1");
    const top = idOf(doc, "P");
    const cell = columnCells(doc, top, declaredColumns(doc, top)!).get(idOf(doc, "x"))!.get("b")!;
    expect(cell.text).toBe("error");
    expect(cell.error).toMatch(/ends too soon/);
  });

  it("reports a column that depends on itself", () => {
    const doc = outline("P | :columns: a{=b} b{=a}\n  x");
    const top = idOf(doc, "P");
    const cell = columnCells(doc, top, declaredColumns(doc, top)!).get(idOf(doc, "x"))!.get("b")!;
    expect(cell.error).toMatch(/depends on itself/);
  });

  it("rejects adding a duration to a number", () => {
    const doc = outline("P | :columns: a b{=a + 1h}\n  x | :a: 3");
    expect(column(doc, "P", "b")).toEqual({ x: "error" });
  });
});

describe("parsing formulas", () => {
  it.each(["parent.start + before(effort)", "clock(9:00 + 1h30m)", "-(a - b) * 2 / 3", "previous.end", "max(effort)", "350 kcal + a"])(
    "reads %s",
    (source) => expect(() => parseFormula(source)).not.toThrow(),
  );

  it.each(["a +", "sum(1h)", "nope(a)", "grand.parent", "(a", "a b"])("refuses %s", (source) => expect(() => parseFormula(source)).toThrow(FormulaError));
});
