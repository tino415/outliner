import { describe, expect, it } from "vitest";
import { Doc, ItemId, ROOT } from "../src/model";
import { setNoteAsTyped as setNote } from "./typed";
import { parseIndentedText } from "../src/transfer";
import { INBOX, capture, captureRequest, captureTemplates, goToTarget } from "../src/capture";
import { subtreesAsText } from "../src/transfer";

function idOf(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

const DAY = new Date(2026, 9, 9);

function withTemplates(): Doc {
  let doc = parseIndentedText("Templates\n  Meal\n  Idea\nFood\n  Monday");
  doc = setNote(doc, idOf(doc, "Meal"), ":capture: Food/Monday\n:ask: kcal, protein\n:key: m");
  doc = setNote(doc, idOf(doc, "Idea"), ":capture: Journal/{date}\n:at: top");
  return doc;
}

describe("capture templates", () => {
  it("are items with a :capture: property, anywhere in the outline", () => {
    const doc = withTemplates();
    expect(captureTemplates(doc)).toEqual([
      { id: idOf(doc, "Meal"), name: "Meal", target: "Food/Monday", ask: ["kcal", "protein"], key: "m" },
      { id: idOf(doc, "Idea"), name: "Idea", target: "Journal/{date}", ask: [], at: "top", key: "" },
    ]);
  });

  it("fall back to an Inbox at the top when there are none", () => {
    expect(captureTemplates(parseIndentedText("a"))).toEqual([INBOX]);
  });
});

describe("capturing", () => {
  it("files the item under the target with the asked properties", () => {
    const doc = withTemplates();
    const [meal] = captureTemplates(doc);
    const result = capture(doc, meal, "Oats", { kcal: "300 kcal", protein: "" }, DAY);
    expect(result.target).toBe(idOf(doc, "Monday"));
    expect(result.doc.items[result.id]).toMatchObject({ text: "Oats", note: "", properties: { kcal: "300 kcal" }, parent: idOf(doc, "Monday") });
  });

  it("files under the page of {tomorrow}", () => {
    let doc = parseIndentedText("Plan\nDay");
    doc = setNote(doc, idOf(doc, "Day"), ":capture: Plan/{tomorrow}");
    const [day] = captureTemplates(doc);
    const result = capture(doc, day, "call", {}, DAY);
    expect(subtreesAsText(result.doc, [idOf(doc, "Plan")])).toBe("- Plan\n  - 2026-10-10\n    - call");
  });

  it("creates dated pages on the way and files at the top when asked", () => {
    let doc = withTemplates();
    const idea = captureTemplates(doc)[1];
    doc = capture(doc, idea, "first", {}, DAY).doc;
    doc = capture(doc, idea, "second", {}, DAY).doc;
    expect(subtreesAsText(doc, [idOf(doc, "Journal")])).toBe("- Journal\n  - 2026-10-09\n    - second\n    - first");
  });

  it("files at the top of a page with :new: top, unless the template says :at: bottom", () => {
    let doc = withTemplates();
    doc = setNote(doc, idOf(doc, "Food"), ":new: top");
    doc = setNote(doc, idOf(doc, "Meal"), ":capture: Food");
    doc = capture(doc, captureTemplates(doc)[0], "Oats", {}, DAY).doc;
    doc = setNote(doc, idOf(doc, "Meal"), ":capture: Food\n:at: bottom");
    doc = capture(doc, captureTemplates(doc)[0], "Soup", {}, DAY).doc;
    expect(subtreesAsText(doc, [idOf(doc, "Food")])).toBe("- Food\n  :new: top\n  - Oats\n  - Monday\n  - Soup");
  });

  it("does not file under a template whose name is its own target", () => {
    const base = parseIndentedText("Inbox");
    const doc = setNote(base, idOf(base, "Inbox"), ":capture: Inbox");
    const [inbox] = captureTemplates(doc);
    const result = capture(doc, inbox, "call mum", {}, DAY);
    expect(result.target).not.toBe(idOf(doc, "Inbox"));
    expect(subtreesAsText(result.doc, result.doc.items[ROOT].children)).toBe("- Inbox\n  :capture: Inbox\n- Inbox\n  - call mum");
  });

  it("files into an Inbox it creates", () => {
    const result = capture(parseIndentedText("a"), INBOX, "call mum", {}, DAY);
    expect(result.doc.items[result.target].text).toBe("Inbox");
    expect(result.doc.items[ROOT].children).toHaveLength(2);
  });
});

describe("capture requests from the address", () => {
  it("read a share target's title, text and url, and a chosen template", () => {
    expect(captureRequest("?title=Article&text=Article&url=https%3A%2F%2Fa.b")).toEqual({ template: "", text: "Article https://a.b", go: false });
    expect(captureRequest("?capture=Meal")).toEqual({ template: "Meal", text: "", go: false });
    expect(captureRequest("?other=1")).toBeNull();
  });

  it("ask to go to the target with &go", () => {
    expect(captureRequest("?capture=Meal&go")).toEqual({ template: "Meal", text: "", go: true });
  });
});

describe("going to a target", () => {
  it("finds the page and files nothing", () => {
    const doc = withTemplates();
    const [meal] = captureTemplates(doc);
    const result = goToTarget(doc, meal, DAY);
    expect(result.doc).toBe(doc);
    expect(result.target).toBe(idOf(doc, "Monday"));
  });

  it("creates the day of {date} under a parent, after its siblings", () => {
    const doc = withTemplates();
    const idea = captureTemplates(doc)[1];
    const result = goToTarget(doc, idea, DAY);
    expect(result.doc.items[result.target].text).toBe("2026-10-09");
    expect(result.doc.items[result.doc.items[result.target].parent!].text).toBe("Journal");
  });

  it.each([
    [new Date(2026, 9, 9), "2026-10-10"],
    [new Date(2026, 9, 31), "2026-11-01"],
    [new Date(2026, 11, 31), "2027-01-01"],
    [new Date(2028, 1, 28), "2028-02-29"],
  ])("creates the day after %s for {tomorrow}", (today, tomorrow) => {
    let doc = parseIndentedText("Day");
    doc = setNote(doc, idOf(doc, "Day"), ":capture: Journal/{tomorrow}");
    const [day] = captureTemplates(doc);
    const result = goToTarget(doc, day, today);
    expect(result.doc.items[result.target].text).toBe(tomorrow);
    expect(result.doc.items[result.doc.items[result.target].parent!].text).toBe("Journal");
  });

  it("resolves {date} and {tomorrow} in one target", () => {
    let doc = parseIndentedText("Day");
    doc = setNote(doc, idOf(doc, "Day"), ":capture: Plan/{date}/before {tomorrow}");
    const [day] = captureTemplates(doc);
    const result = goToTarget(doc, day, DAY);
    expect(subtreesAsText(result.doc, [idOf(result.doc, "Plan")])).toBe("- Plan\n  - 2026-10-09\n    - before 2026-10-10");
  });

  it("puts the day it creates first when its parent keeps new items on top", () => {
    let doc = parseIndentedText("Plan\n  2026-10-08\nDay");
    doc = setNote(doc, idOf(doc, "Plan"), ":new: top");
    doc = setNote(doc, idOf(doc, "Day"), ":capture: Plan/{date}");
    const [day] = captureTemplates(doc);
    const result = goToTarget(doc, day, DAY);
    expect(result.doc.items[idOf(doc, "Plan")].children[0]).toBe(result.target);
  });
});

describe("a template's children fill the page its target creates", () => {
  function withDayTemplate(): Doc {
    let doc = parseIndentedText("Day\n  Plan {date}\n  Review\n    Wins\nPlans");
    doc = setNote(doc, idOf(doc, "Day"), ":capture: Plans/{date}\n:key: d\n:ask: mood\n:at: top\n:view: board");
    doc = setNote(doc, idOf(doc, "Plan {date}"), "Written {date}\n:due: {date}");
    return doc;
  }

  it("copies the children with their notes and properties, and {date} in them", () => {
    const doc = withDayTemplate();
    const [day] = captureTemplates(doc);
    const result = goToTarget(doc, day, DAY);
    expect(subtreesAsText(result.doc, [result.target])).toBe(
      "- 2026-10-09\n  :view: board\n  - Plan 2026-10-09\n    :due: 2026-10-09\n    Written 2026-10-09\n  - Review\n    - Wins",
    );
  });

  it("keeps capture, key, ask and at off the page", () => {
    const doc = withDayTemplate();
    const result = goToTarget(doc, captureTemplates(doc)[0], DAY);
    expect(Object.keys(result.doc.items[result.target].properties)).toEqual(["view"]);
  });

  it("leaves a page that already exists alone, even when it is empty", () => {
    const bare = parseIndentedText("Day\n  Child\nPlans\n  2026-10-09");
    const doc = setNote(bare, idOf(bare, "Day"), ":capture: Plans/{date}");
    const result = goToTarget(doc, captureTemplates(doc)[0], DAY);
    expect(result.doc).toBe(doc);
  });

  it("keeps private, plugin and approved off the page", () => {
    let doc = withDayTemplate();
    doc = setNote(doc, idOf(doc, "Day"), ":capture: Plans/{date}\n:view: board\n:plugin: x\n:approved: y\n:private: personal");
    const result = goToTarget(doc, captureTemplates(doc)[0], DAY);
    expect(Object.keys(result.doc.items[result.target].properties)).toEqual(["view"]);
  });

  it("leaves the pages made on the way bare", () => {
    const doc = withDayTemplate();
    const result = goToTarget(doc, captureTemplates(doc)[0], DAY);
    expect(result.doc.items[idOf(doc, "Plans")].properties).toEqual({});
    expect(result.doc.items[idOf(doc, "Plans")].children).toEqual([result.target]);
  });

  it("fills nothing for the Inbox fallback or an item id target", () => {
    const inbox = goToTarget(parseIndentedText("a"), INBOX, DAY);
    expect(inbox.doc.items[inbox.target].children).toEqual([]);
    const doc = withDayTemplate();
    const byId = { ...captureTemplates(doc)[0], target: idOf(doc, "Plans") };
    expect(goToTarget(doc, byId, DAY).doc).toBe(doc);
  });

  it("leaves a sealed child out", () => {
    let doc = withDayTemplate();
    doc = setNote(doc, idOf(doc, "Review"), `🔒private:1:personal:${"A".repeat(40)}`);
    const result = goToTarget(doc, captureTemplates(doc)[0], DAY);
    expect(result.doc.items[result.target].children.map((id) => result.doc.items[id].text)).toEqual(["Plan 2026-10-09"]);
  });

  it("files a capture at the top of the filled page with :at: top", () => {
    const doc = withDayTemplate();
    const result = capture(doc, captureTemplates(doc)[0], "mood note", {}, DAY);
    expect(subtreesAsText(result.doc, [result.target])).toMatch(/^- 2026-10-09\n {2}:view: board\n {2}- mood note\n {2}- Plan 2026-10-09/);
  });
});
