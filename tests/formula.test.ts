import { describe, expect, it } from "vitest";
import { Doc, ItemId, ROOT, toggleCompleted } from "../src/model";
import { setNoteAsTyped as setNote } from "./typed";
import { parseIndentedText } from "../src/transfer";
import { Cell, columnCells, declaredColumns, inferredColumns } from "../src/properties";
import { FormulaError, parseFormula } from "../src/formula";
import { FORMULA_EXAMPLES } from "../src/formulaHelp";

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

  it("starts each item after the durations before it, up to the page (a day's time plan)", () => {
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
    const rows = Array.from({ length: 3000 }, (_, i) => `  - task ${i}\n    :effort: 10m`);
    const doc = parseIndentedText(["- Day", "  :start: 9:00", "  :columns: effort start{=clock(parent.start + before(effort))}", ...rows].join("\n"));
    const started = performance.now();
    const cells = column(doc, "Day", "start");
    expect(performance.now() - started).toBeLessThan(400);
    expect(cells["task 2999"]).toBe("4:50");
  }, 30_000);
});

describe("the examples in the formula help", () => {
  it.each(FORMULA_EXAMPLES.map((example) => [example.title, example] as const))("%s computes every cell", (_, example) => {
    const doc = parseIndentedText(example.outline);
    const page = doc.items[ROOT].children[0];
    const columns = declaredColumns(doc, page)!;
    const cells = columnCells(doc, page, columns);
    for (const row of doc.items[page].children) {
      for (const column of columns.filter((column) => column.formula)) {
        const cell = cells.get(row)?.get(column.key);
        expect(cell?.error, `${doc.items[row].text} ${column.key}`).toBeUndefined();
        expect(cell?.text, `${doc.items[row].text} ${column.key}`).toBeTruthy();
      }
    }
  });

  it("plans the example day", () => {
    const doc = parseIndentedText(FORMULA_EXAMPLES[0].outline);
    expect(column(doc, "Example: Monday", "start").Lunch).toBe("11:15");
    expect(column(doc, "Example: Monday", "end").Lunch).toBe("12:15");
  });

  it("follows the example portions to their ingredient", () => {
    const doc = parseIndentedText(FORMULA_EXAMPLES[3].outline);
    expect(column(doc, "Example: Portions", "kcal")).toMatchObject({ "Example porridge": "227.4", "Example half porridge": "113.7" });
  });
});

describe("a formula that reads the item a link property points to", () => {
  const KCAL = ":columns: kcal{=grams * food.kcal / food.grams}";
  const FOOD = [
    `Food | ${KCAL}`,
    "  Skyr vanilla | :kcal: 74; :grams: 100",
    "  Skyr cup | :food: [[Skyr vanilla]]; :grams: 140",
    "  Half a cup | :food: [[Skyr cup]]; :grams: 70",
  ];

  function kcalCells(doc: Doc, page: string, filter = { showCompleted: true }): Record<string, Cell> {
    const top = idOf(doc, page);
    const cells = columnCells(doc, top, declaredColumns(doc, top)!, filter);
    return Object.fromEntries(Object.values(doc.items).flatMap((item) => (cells.get(item.id)?.get("kcal") ? [[item.text, cells.get(item.id)!.get("kcal")!]] : [])));
  }

  it("computes a portion from the ingredient it links", () => {
    expect(column(outline(FOOD.join("\n")), "Food", "kcal")["Skyr cup"]).toBe("103.6");
  });

  it("follows a chain: an entry links a portion, which links an ingredient", () => {
    expect(column(outline(FOOD.join("\n")), "Food", "kcal")["Half a cup"]).toBe("51.8");
  });

  it("names why a link leads nowhere", () => {
    const doc = outline(
      [
        `Food | ${KCAL}`,
        "  Rye bread | :food: Rye; :grams: 50",
        "  Oats | :food: [[id:gone]]; :grams: 40",
        "  Loop A | :food: [[Loop B]]; :grams: 10",
        "  Loop B | :food: [[Loop A]]; :grams: 10",
      ].join("\n"),
    );
    const errors = Object.fromEntries(Object.entries(kcalCells(doc, "Food")).map(([text, cell]) => [text, cell.error]));
    expect(errors).toEqual({
      "Rye bread": "food is not a link",
      Oats: "food links an item that is not here",
      "Loop A": "kcal depends on itself",
      "Loop B": "kcal depends on itself",
    });
  });

  it("leaves the cell of an item with no link empty", () => {
    const doc = outline([...FOOD, "  A note to self"].join("\n"));
    expect(kcalCells(doc, "Food")["A note to self"]).toBeUndefined();
  });

  it("does not compute a linked item outside the tree that declares the formula", () => {
    const doc = outline(["Pantry", "  Skyr jar | :food: [[Skyr vanilla]]; :grams: 100", ...FOOD, "  Spoon | :food: [[Skyr jar]]; :grams: 10"].join("\n"));
    expect(kcalCells(doc, "Food").Spoon).toBeUndefined();
  });

  it("reads a completed linked item while completed items are hidden", () => {
    const shown = outline(FOOD.join("\n"));
    const doc = toggleCompleted(shown, idOf(shown, "Skyr vanilla"));
    expect(kcalCells(doc, "Food", { showCompleted: false })["Skyr cup"].text).toBe("103.6");
  });

  it("counts a hidden linked item from the shown sibling above it", () => {
    const shown = outline(["Day | :columns: end{=previous.end + 1h} seen{=food.end}", "  First | :end: 9:00", "  Done", "  Later | :food: [[Done]]"].join("\n"));
    const doc = toggleCompleted(shown, idOf(shown, "Done"));
    const top = idOf(doc, "Day");
    const cells = columnCells(doc, top, declaredColumns(doc, top)!, { showCompleted: false });
    expect(cells.get(idOf(doc, "Later"))!.get("seen")!.text).toBe("10:00");
  });

  it("reads a meal's grams as the sum of its lines", () => {
    const doc = outline(["Day | :columns: weight{=food.grams}", "  Bowl", "    Skyr | :grams: 150", "    Oats | :grams: 250", "  Lunch | :food: [[Bowl]]"].join("\n"));
    expect(column(doc, "Day", "weight").Lunch).toBe("400");
  });

  it("still reads parent. and previous.", () => {
    const doc = outline(["Day | :start: 9:00; :columns: effort start{=parent.start} end{=start + effort} after{=previous.end}", "  A | :effort: 1h", "  B | :effort: 30m"].join("\n"));
    expect(column(doc, "Day", "end")).toEqual({ A: "10:00", B: "9:30" });
    expect(column(doc, "Day", "after")).toEqual({ B: "10:00" });
  });
});

describe("parsing formulas", () => {
  it.each(["parent.start + before(effort)", "clock(9:00 + 1h30m)", "-(a - b) * 2 / 3", "previous.end", "max(effort)", "350 kcal + a", "grams * food.kcal / food.grams"])(
    "reads %s",
    (source) => expect(() => parseFormula(source)).not.toThrow(),
  );

  it.each(["a +", "sum(1h)", "nope(a)", "food.food.kcal", "(a", "a b"])("refuses %s", (source) => expect(() => parseFormula(source)).toThrow(FormulaError));

  it.each([
    ["parnet.start", "parnet looks like parent: write parent.start"],
    ["parents.start", "parents looks like parent: write parent.start"],
    ["prevous.end", "prevous looks like previous: write previous.end"],
    ["pervious.end", "pervious looks like previous: write previous.end"],
  ])("warns that %s is a slip of parent or previous", (source, warning) => expect(() => parseFormula(source)).toThrow(new FormulaError(warning)));

  it.each(["food.kcal", "parcel.grams", "prev.end"])("reads %s as a link property", (source) => expect(parseFormula(source)).toMatchObject({ kind: "value", of: { link: source.split(".")[0] } }));
});

describe("a slip of parent in a column", () => {
  it("shows the warning in every row instead of empty cells", () => {
    const doc = outline("Day | :start: 9:00; :columns: begin{=parnet.start}\n  Task");
    const top = idOf(doc, "Day");
    const cell = columnCells(doc, top, declaredColumns(doc, top)!).get(idOf(doc, "Task"))!.get("begin")!;
    expect(cell).toMatchObject({ text: "error", error: "parnet looks like parent: write parent.start" });
  });
});

describe("a formula as an item's own value", () => {
  const DAY = [
    "Day | :start: 0:00; :columns: effort start{=clock(parent.start + before(effort))}",
    "  Sleep | :effort: 7h",
    "  Work | :effort: 9h30m",
    "  Evening | :effort: 3h",
    "  Sleep again | :effort: =24:00 - start",
  ].join("\n");

  it("fills the rest of the day from the item's own start, and counts in the totals", () => {
    const doc = outline(DAY);
    expect(column(doc, "Day", "effort")).toMatchObject({ "Sleep again": "4h 30m", Day: "24h" });
    const top = idOf(doc, "Day");
    const cell = columnCells(doc, top, declaredColumns(doc, top)!).get(idOf(doc, "Sleep again"))!.get("effort")!;
    expect(cell.computed).toBe(true);
  });

  it("shows an error instead of looping when a value depends on itself", () => {
    const doc = outline("Day | :columns: effort\n  Loop | :effort: =effort + 1h");
    const top = idOf(doc, "Day");
    const cell = columnCells(doc, top, declaredColumns(doc, top)!).get(idOf(doc, "Loop"))!.get("effort")!;
    expect(cell).toMatchObject({ text: "error", error: expect.stringContaining("depends on itself") });
  });

  it("works on a page without columns", () => {
    const doc = outline("Shopping\n  Apples | :count: 3; :price: =count * 2");
    const top = idOf(doc, "Shopping");
    const cells = columnCells(doc, top, inferredColumns(doc, top));
    expect(cells.get(idOf(doc, "Apples"))!.get("price")!.text).toBe("6");
  });
});
