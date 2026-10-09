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

describe("computed columns, review round", () => {
  it("formats a negative duration", () => {
    const doc = outline("Day | :columns: effort spare{=2h - effort}\n  Task | :effort: 3h30m");
    expect(column(doc, "Day", "spare")).toEqual({ Task: "-1h 30m" });
  });

  it("starts the first item at the page's start when it has no effort of its own", () => {
    const doc = outline(["Monday | :start: 9:00; :columns: effort start{=parent.start + before(effort)}", "  Morning", "  Standup | :effort: 15m"].join("\n"));
    expect(column(doc, "Monday", "start")).toEqual({ Monday: "9:00", Morning: "9:00", Standup: "9:00" });
  });

  it("computes the same start for a row whether the view is zoomed into its parent or not", () => {
    const doc = outline(
      [
        "Monday | :start: 9:00; :columns: effort start{=clock(parent.start + before(effort))}",
        "  Standup | :effort: 15m",
        "  Deep work",
        "    Write | :effort: 1h30m",
      ].join("\n"),
    );
    expect(column(doc, "Monday", "start").Write).toBe("9:15");
    expect(column(doc, "Deep work", "start").Write).toBe("9:15");
  });

  it("marks both columns of a cycle as errors", () => {
    const doc = outline("P | :columns: a{=b} b{=a}\n  x");
    const top = idOf(doc, "P");
    const row = columnCells(doc, top, declaredColumns(doc, top)!).get(idOf(doc, "x"))!;
    expect(row.get("a")?.text).toBe("error");
    expect(row.get("b")?.text).toBe("error");
  });

  it("reads a minus between a key and a number as subtraction; a hyphen joins words only", () => {
    const doc = outline("P | :columns: effort left{=effort-15m} spent{=time-spent}\n  x | :effort: 1h; :time-spent: 20m");
    expect(column(doc, "P", "left")).toEqual({ x: "45m" });
    expect(column(doc, "P", "spent")).toEqual({ x: "20m" });
  });

  it.each(["parent.start + 1h 30m", "effort + 1H", "price + 5 Kč"])("reads amounts written as property values are: %s", (source) => {
    expect(() => parseFormula(source)).not.toThrow();
  });
});

describe("computed columns, smaller fixes", () => {
  it("a time plus a duration is a time whichever side it is on; a time minus a time is a duration", () => {
    const doc = outline("Day | :start: 9:00; :end: 17:00; :columns: effort a{=effort + parent.start} b{=parent.end - parent.start} c{=parent.end - effort}\n  Task | :effort: 15m");
    expect(column(doc, "Day", "a")).toEqual({ Task: "9:15" });
    expect(column(doc, "Day", "b")).toEqual({ Task: "8h" });
    expect(column(doc, "Day", "c")).toEqual({ Task: "16:45" });
  });

  it("refuses to add numbers in different units, and ignores the case of a unit", () => {
    const doc = outline("P | :columns: a b c{=a + b}\n  mixed | :a: 5 kg; :b: 3 lb\n  same | :a: 5 kg; :b: 3 KG\n  bare | :a: 5; :b: 3 kg");
    expect(column(doc, "P", "c")).toEqual({ mixed: "error", same: "8 kg", bare: "8 kg" });
  });

  it("computes before() over thousands of siblings in linear time", () => {
    const rows = Array.from({ length: 3000 }, (_, i) => `  task ${i} | :effort: 10m`);
    const doc = outline(["Day | :start: 9:00; :columns: effort start{=clock(parent.start + before(effort))}", ...rows].join("\n"));
    const started = performance.now();
    const cells = column(doc, "Day", "start");
    expect(performance.now() - started).toBeLessThan(400);
    expect(cells["task 2999"]).toBe("4:50");
  });
});

describe("parsing formulas", () => {
  it.each(["parent.start + before(effort)", "clock(9:00 + 1h30m)", "-(a - b) * 2 / 3", "previous.end", "max(effort)", "350 kcal + a"])(
    "reads %s",
    (source) => expect(() => parseFormula(source)).not.toThrow(),
  );

  it.each(["a +", "sum(1h)", "nope(a)", "grand.parent", "(a", "a b"])("refuses %s", (source) => expect(() => parseFormula(source)).toThrow(FormulaError));
});
