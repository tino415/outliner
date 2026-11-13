import { describe, expect, it } from "vitest";
import { Doc, ItemId, toggleCompleted } from "../src/model";
import { parseIndentedText } from "../src/transfer";
import { countLabel } from "../src/counts";

function idOf(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

describe("countLabel", () => {
  const outline = parseIndentedText("Page\n  a\n    deep\n    deeper\n  b\n  c");
  const page = outline.items[idOf(outline, "Page")];

  it("counts the direct children only", () => {
    expect(countLabel(outline, page.children)).toBe("3");
  });

  it("says how many are done once one is", () => {
    const done = toggleCompleted(outline, idOf(outline, "b"));
    expect(countLabel(done, page.children)).toBe("1/3 done");
  });
});
