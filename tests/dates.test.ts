import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, dateFilter, dateLabel, datesOf, isOverdue, readTypedDate, readWrittenDate, weekdayOf } from "../src/dates";
import { Item, ROOT } from "../src/model";
import { renderInline } from "../src/inline";
import { parseAmount } from "../src/properties";
import { search } from "../src/search";
import { parseIndentedText } from "../src/transfer";

const MONDAY = "2026-10-19";

const item = (fields: Partial<Item>): Item => ({
  id: "x",
  text: "",
  note: "",
  properties: {},
  parent: null,
  children: [],
  collapsed: false,
  completed: false,
  updated: 0,
  ...fields,
});

describe("written dates", () => {
  it.each([
    ["2026-10-14", { day: "2026-10-14", time: null }],
    ["2026-10-14 9:00", { day: "2026-10-14", time: "9:00" }],
    ["2026-10-14 09:30", { day: "2026-10-14", time: "9:30" }],
    ["2024-02-29", { day: "2024-02-29", time: null }],
  ])("reads %s", (text, expected) => {
    expect(readWrittenDate(text)).toEqual(expected);
  });

  it.each(["2026-02-29", "2026-13-01", "2026-10-00", "2026-10-14 24:00", "14.10.2026", "2026-10-14 9"])("is not a date: %s", (text) => {
    expect(readWrittenDate(text)).toBeNull();
  });

  it("counts days across the end of daylight saving and of the year", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayOf(MONDAY)).toBe(0);
  });
});

describe("labels", () => {
  it.each([
    ["2026-10-19", "today"],
    ["2026-10-20", "tomorrow"],
    ["2026-10-18", "yesterday"],
    ["2026-10-23", "Fri 23 Oct"],
    ["2027-01-04", "Mon 4 Jan 2027"],
  ])("shows %s as %s", (day, label) => {
    expect(dateLabel({ day, time: null }, MONDAY)).toBe(label);
  });

  it("adds the time", () => {
    expect(dateLabel({ day: "2026-10-20", time: "9:00" }, MONDAY)).toBe("tomorrow 9:00");
  });
});

describe("what the picker understands", () => {
  it.each([
    ["today", "2026-10-19"],
    ["Tomorrow", "2026-10-20"],
    ["tom", "2026-10-20"],
    ["fri", "2026-10-23"],
    ["friday", "2026-10-23"],
    ["mon", "2026-10-19"],
    ["su", "2026-10-25"],
    ["+3d", "2026-10-22"],
    ["+3", "2026-10-22"],
    ["2w", "2026-11-02"],
    ["-1d", "2026-10-18"],
    ["+1m", "2026-11-19"],
    ["2026-11-02", "2026-11-02"],
    ["2026-1-2", "2026-01-02"],
    ["14.11.", "2026-11-14"],
    ["14.11", "2026-11-14"],
    ["14.10.", "2027-10-14"],
    ["14.10.2026", "2026-10-14"],
    ["3.1.27", "2027-01-03"],
    ["25", "2026-10-25"],
    ["5", "2026-11-05"],
    ["14 nov", "2026-11-14"],
    ["nov 14", "2026-11-14"],
    ["14 november 2028", "2028-11-14"],
  ])("reads %s", (typed, day) => {
    expect(readTypedDate(typed, MONDAY)).toEqual({ day, time: null });
  });

  it("reads a time after the day, or alone for today", () => {
    expect(readTypedDate("fri 9:00", MONDAY)).toEqual({ day: "2026-10-23", time: "9:00" });
    expect(readTypedDate("14:30", MONDAY)).toEqual({ day: MONDAY, time: "14:30" });
  });

  it.each(["", "soon", "31.2.", "fri 25:00", "t", "1x"])("does not read %s", (typed) => {
    expect(readTypedDate(typed, MONDAY)).toBeNull();
  });

  it("moves the 31st to the last day of a shorter month", () => {
    expect(readTypedDate("+1m", "2026-01-31")).toEqual({ day: "2026-02-28", time: null });
  });
});

describe("an item's dates", () => {
  it("are its scheduled and due properties and the dates in its text, not in code or its note", () => {
    const dated = item({ text: "Call 2026-10-20 or `2026-10-21`", note: "2026-10-22", properties: { due: "2026-10-23 9:00", scheduled: "soon" } });
    expect(datesOf(dated)).toEqual([
      { day: "2026-10-23", time: "9:00", role: "due" },
      { day: "2026-10-20", time: null, role: "text" },
    ]);
  });

  it("are overdue when every one has passed and the item is open", () => {
    expect(isOverdue(item({ text: "Pay 2026-10-18" }), MONDAY)).toBe(true);
    expect(isOverdue(item({ text: "Pay 2026-10-18", completed: true }), MONDAY)).toBe(false);
    expect(isOverdue(item({ text: "Pay 2026-10-18", properties: { due: "2026-10-19" } }), MONDAY)).toBe(false);
    expect(isOverdue(item({ text: "Pay" }), MONDAY)).toBe(false);
  });
});

describe("date words in a search", () => {
  const due = (day: string) => item({ properties: { due: day } });

  it.each([
    ["due:today", "2026-10-19", true],
    ["due:today", "2026-10-20", false],
    ["due:<+7d", "2026-10-25", true],
    ["due:<+7d", "2026-10-26", false],
    ["due:>=2026-10-20", "2026-10-20", true],
    ["due:this-week", "2026-10-25", true],
    ["due:this-week", "2026-10-26", false],
    ["due:next-week", "2026-10-26", true],
    ["scheduled:today", "2026-10-19", false],
    ["date:today", "2026-10-19", true],
  ])("%s on an item due %s: %s", (word, day, passes) => {
    expect(dateFilter(word, MONDAY)!(due(day))).toBe(passes);
  });

  it("leaves other words to the text search", () => {
    expect(dateFilter("due:someday", MONDAY)).toBeNull();
    expect(dateFilter("overdue", MONDAY)).toBeNull();
  });

  describe("in the outline", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 19, 12));
    });
    afterEach(() => vi.useRealTimers());

    it("narrows the matches and keeps date words out of the highlighted terms", () => {
      const doc = parseIndentedText("Bills\n  Pay rent 2026-10-15\n  Pay phone 2026-10-30\nCall mum 2026-10-01");
      const result = search(doc, ROOT, "pay is:overdue", { showCompleted: true });
      expect([...result.matches].map((id) => doc.items[id].text)).toEqual(["Pay rent 2026-10-15"]);
      expect(result.terms).toEqual(["pay"]);
    });
  });
});

describe("dates elsewhere", () => {
  it("are no amounts, so a due column does not sum years", () => {
    expect(parseAmount("2026-10-14")).toBeNull();
  });

  it("show as a chip with a label and the raw text inside", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 19, 12));
    try {
      expect(renderInline("pay 2026-10-18")).toContain('class="date past" data-date="2026-10-18" data-label="yesterday"');
      expect(renderInline("2026-10-19 9:00")).toContain('class="date today" data-date="2026-10-19 9:00" data-label="today 9:00"');
      expect(renderInline("2026-02-30")).not.toContain("class=");
      expect(renderInline("`2026-10-18`")).not.toContain("data-date");
    } finally {
      vi.useRealTimers();
    }
  });
});
