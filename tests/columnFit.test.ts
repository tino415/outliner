import { describe, expect, it } from "vitest";
import { columnsWindow, fittedWidths } from "../src/columnFit";
import type { Cell } from "../src/properties";

const tenPerCharacter = { name: (key: string) => key.length * 6, value: (text: string) => text.length * 10 };

function cellsOf(...rows: Record<string, string>[]): Map<string, Map<string, Cell>> {
  return new Map(rows.map((row, index) => [`item${index}`, new Map(Object.entries(row).map(([key, text]) => [key, { text, rolled: false }]))]));
}

describe("fittedWidths", () => {
  it("makes a column as wide as its longest value plus 8 px", () => {
    expect(fittedWidths([{ key: "kcal" }], cellsOf({ kcal: "338" }, { kcal: "1718" }), tenPerCharacter)).toEqual([48]);
  });

  it("lets a name longer than every value set the width", () => {
    expect(fittedWidths([{ key: "protein" }], cellsOf({ protein: "122" }), tenPerCharacter)).toEqual([50]);
  });

  it("makes a column with no value as wide as its name", () => {
    expect(fittedWidths([{ key: "fat" }], cellsOf({}, {}), tenPerCharacter)).toEqual([26]);
  });

  it("measures values with every digit as 0, since cells use tabular numbers", () => {
    const measured: string[] = [];
    fittedWidths([{ key: "kcal" }], cellsOf({ kcal: "1718 kcal" }), { ...tenPerCharacter, value: (text) => (measured.push(text), 0) });
    expect(measured).toEqual(["0000 kcal"]);
  });
});

describe("columnsWindow", () => {
  it("fits four food columns on a 412 px screen without scrolling", () => {
    expect(columnsWindow([49, 47, 40, 29], 412)).toEqual({ needed: 181, window: 181, range: 0 });
  });

  it("scrolls six columns inside 55% of a 412 px screen", () => {
    expect(columnsWindow([49, 47, 40, 29, 35, 30], 412)).toEqual({ needed: 250, window: 226, range: 24 });
  });
});
