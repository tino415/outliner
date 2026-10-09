import { describe, expect, it } from "vitest";
import { Doc, ItemId, ROOT, setNote } from "../src/model";
import { parseIndentedText } from "../src/transfer";
import { INBOX, capture, captureRequest, captureTemplates } from "../src/capture";
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
    expect(captureTemplates(withTemplates())).toEqual([
      { name: "Meal", target: "Food/Monday", ask: ["kcal", "protein"], atTop: false, key: "m" },
      { name: "Idea", target: "Journal/{date}", ask: [], atTop: true, key: "" },
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
    expect(result.doc.items[result.id]).toMatchObject({ text: "Oats", note: ":kcal: 300 kcal", parent: idOf(doc, "Monday") });
  });

  it("creates dated pages on the way and files at the top when asked", () => {
    let doc = withTemplates();
    const idea = captureTemplates(doc)[1];
    doc = capture(doc, idea, "first", {}, DAY).doc;
    doc = capture(doc, idea, "second", {}, DAY).doc;
    expect(subtreesAsText(doc, [idOf(doc, "Journal")])).toBe("- Journal\n  - 2026-10-09\n    - second\n    - first");
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
    expect(captureRequest("?title=Article&text=Article&url=https%3A%2F%2Fa.b")).toEqual({ template: "", text: "Article https://a.b" });
    expect(captureRequest("?capture=Meal")).toEqual({ template: "Meal", text: "" });
    expect(captureRequest("?other=1")).toBeNull();
  });
});
