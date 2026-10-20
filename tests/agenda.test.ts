import { describe, expect, it } from "vitest";
import { agendaGroups } from "../src/agendaItems";
import { Doc, setFlags, setItemProperty } from "../src/model";
import { parseIndentedText } from "../src/transfer";

const MONDAY = "2026-10-19";

function outline(text: string, change: (doc: Doc, idOf: (text: string) => string) => Doc = (doc) => doc): Doc {
  const doc = parseIndentedText(text);
  const idOf = (wanted: string) => Object.values(doc.items).find((item) => item.text === wanted)!.id;
  return change(doc, idOf);
}

function shown(doc: Doc, showCompleted = false) {
  return agendaGroups(doc, MONDAY, { showCompleted }).map(({ section, ids }) => [
    section.kind === "day" ? section.day : section.kind,
    ids.map((id) => doc.items[id].text),
  ]);
}

describe("the agenda", () => {
  it("lists overdue items, then each day of the coming week, then undated #todo items", () => {
    const doc = outline(
      "Rent 2026-10-15\nGym 2026-10-21\nToday 2026-10-19\nPhone 2026-10-10\nLater 2026-10-27\nLast day 2026-10-26\nPaint the fence #todo\nJust a note\nUnder\n  Nested 2026-10-21",
    );
    expect(shown(doc)).toEqual([
      ["overdue", ["Phone 2026-10-10", "Rent 2026-10-15"]],
      ["2026-10-19", ["Today 2026-10-19"]],
      ["2026-10-21", ["Gym 2026-10-21", "Nested 2026-10-21"]],
      ["2026-10-26", ["Last day 2026-10-26"]],
      ["todo", ["Paint the fence #todo"]],
    ]);
  });

  it("puts an item on its next date, and counts due and scheduled", () => {
    const doc = outline("Report 2026-10-12\nTaxes", (doc, idOf) => setItemProperty(setItemProperty(doc, idOf("Report 2026-10-12"), "due", "2026-10-22"), idOf("Taxes"), "scheduled", "2026-10-20"));
    expect(shown(doc)).toEqual([
      ["2026-10-20", ["Taxes"]],
      ["2026-10-22", ["Report 2026-10-12"]],
    ]);
  });

  it("orders a day by the time written, untimed items last", () => {
    const doc = outline("Lunch 2026-10-19 12:30\nAll day 2026-10-19\nStandup 2026-10-19 9:15");
    expect(shown(doc)).toEqual([["2026-10-19", ["Standup 2026-10-19 9:15", "Lunch 2026-10-19 12:30", "All day 2026-10-19"]]]);
  });

  it("leaves out completed items and what is under them, unless completed items are shown, and never calls them overdue", () => {
    const doc = outline("Done 2026-10-20\nOld done 2026-10-01\nProject\n  Step 2026-10-20", (doc, idOf) =>
      [idOf("Done 2026-10-20"), idOf("Old done 2026-10-01"), idOf("Project")].reduce((each, id) => setFlags(each, id, { completed: true }), doc),
    );
    expect(shown(doc)).toEqual([]);
    expect(shown(doc, true)).toEqual([["2026-10-20", ["Done 2026-10-20", "Step 2026-10-20"]]]);
  });

  it("is empty for an outline without dates or #todo", () => {
    expect(agendaGroups(outline("a\nb"), MONDAY, { showCompleted: false })).toEqual([]);
  });
});
