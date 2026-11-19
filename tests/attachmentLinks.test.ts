import { describe, expect, it } from "vitest";
import { Doc, ItemId } from "../src/model";
import { setNoteAsTyped as setNote } from "./typed";
import { parseIndentedText } from "../src/transfer";
import { attachmentsToChildren } from "../src/attachmentLinks";

const hash = "a".repeat(64);
const other = "b".repeat(64);

function idOf(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

describe("attachmentsToChildren", () => {
  const noted = (note: string) => {
    const base = parseIndentedText("Report");
    return setNote(base, idOf(base, "Report"), note);
  };

  it("moves a link alone on its line and a link in a sentence into children", () => {
    const doc = noted(`Before\n![shot.png](att:${hash})\nsee [the plan](att:${other}) here`);
    const { doc: lifted, lifted: ids } = attachmentsToChildren(doc);
    const report = lifted.items[idOf(lifted, "Report")];
    const titles = report.children.map((child) => lifted.items[child].text);
    expect(titles).toEqual([`![shot.png](att:${hash})`, `[the plan](att:${other})`]);
    expect(report.note).toBe(`Before\nsee [[id:${report.children[1]}][the plan]] here`);
    expect(ids).toEqual([report.id]);
  });

  it("leaves a link in a code fence, and a second run changes nothing", () => {
    const fenced = noted("```\n![x](att:" + hash + ")\n```");
    expect(attachmentsToChildren(fenced).lifted).toEqual([]);
    const once = attachmentsToChildren(noted(`![shot.png](att:${hash})`)).doc;
    expect(attachmentsToChildren(once).lifted).toEqual([]);
  });

  it("adds one child for a link that appears twice", () => {
    const { doc: lifted } = attachmentsToChildren(noted(`![s](att:${hash})\nagain ![s](att:${hash})`));
    expect(lifted.items[idOf(lifted, "Report")].children).toHaveLength(1);
  });
});
