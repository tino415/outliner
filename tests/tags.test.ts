import { describe, expect, it } from "vitest";
import { Doc, ItemId, ROOT, appendChild, emptyDoc, liftTags, setNote, titleWithTags } from "../src/model";
import { subtreesAsText, parseIndentedText } from "../src/transfer";
import { parseQuery, queryMatches } from "../src/query";

function withItem(text: string, note = ""): { doc: Doc; id: ItemId } {
  const created = appendChild(emptyDoc(), ROOT, text);
  return { doc: setNote(created.doc, created.id, note), id: created.id };
}

function lifted(text: string, note = "") {
  const { doc, id } = withItem(text, note);
  const item = liftTags(doc).items[id];
  return { text: item.text, note: item.note, tags: item.properties.tags };
}

describe("liftTags", () => {
  it("moves a tag out of the middle of a title, leaving single spaces", () => {
    expect(lifted("Fix #bug the jump")).toEqual({ text: "Fix the jump", note: "", tags: "bug" });
  });

  it("keeps tags in first-written order without duplicates", () => {
    expect(lifted("#b a #c #B", "see #d #c").tags).toBe("b c d");
  });

  it("takes a tag out of a note line and drops a line that was only tags", () => {
    expect(lifted("a", "see #feature\n#more\nend")).toEqual({ text: "a", note: "see\nend", tags: "feature more" });
  });

  it("leaves a tag inside code, a link or a reference", () => {
    const text = "run `#x` and [[#y]] and [l](https://e.test/#z)";
    expect(lifted(text)).toEqual({ text, note: "", tags: undefined });
    expect(lifted("a", "```\n#x\n```").tags).toBeUndefined();
  });

  it("keeps a title that is only a tag", () => {
    expect(lifted("#bug")).toEqual({ text: "#bug", note: "", tags: undefined });
  });

  it("adds to the tags an item already has", () => {
    const { doc, id } = withItem("a #new");
    const tagged = { ...doc, items: { ...doc.items, [id]: { ...doc.items[id], properties: { tags: "old" } } } };
    expect(liftTags(tagged).items[id].properties.tags).toBe("old new");
  });

  it("returns the same document when there is nothing to lift", () => {
    const { doc } = withItem("plain");
    expect(liftTags(doc)).toBe(doc);
  });
});

describe("tags after the title", () => {
  it("prints the tags after the title and keeps them out of the note lines", () => {
    const { doc, id } = withItem("Fix the jump #bug #ui");
    const done = liftTags(doc);
    expect(titleWithTags(done.items[id])).toBe("Fix the jump #bug #ui");
    expect(subtreesAsText(done, [id])).toBe("- Fix the jump #bug #ui");
  });

  it("reads them back from an export", () => {
    const parsed = parseIndentedText("- Fix the jump #bug");
    const [id] = parsed.items[ROOT].children;
    expect(parsed.items[id].text).toBe("Fix the jump");
    expect(parsed.items[id].properties.tags).toBe("bug");
  });

  it("is found by a #tag query once lifted", () => {
    const { doc, id } = withItem("Fix the jump #Bug");
    expect(queryMatches(liftTags(doc), ROOT, parseQuery("#bug"), { showCompleted: true })).toEqual([id]);
  });
});

describe("edge cases", () => {
  it("leaves a tag in brackets, so no bracket is left behind", () => {
    expect(lifted("see (#todo) later").text).toBe("see (#todo) later");
  });

  it("names a tag once when the title still holds it", () => {
    const { doc, id } = withItem("#todo", "also #todo");
    expect(titleWithTags(liftTags(doc).items[id])).toBe("#todo");
  });
});
