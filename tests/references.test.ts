import { describe, expect, it } from "vitest";
import { Doc, ItemId, setText } from "../src/model";
import { setNoteAsTyped as setNote } from "./typed";
import { parseIndentedText } from "../src/transfer";
import { backlinks, privateHolderOf, referenceTo, resolveReference } from "../src/references";
import { renderInline } from "../src/inline";

function idOf(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

describe("references", () => {
  const base = parseIndentedText("Garden\n  Tomatoes\nPlans\n  water\nNotes");

  it("are written as org links to an id, with a label that cannot break the link", () => {
    expect(referenceTo("abc", "Plant [x]\nnow")).toBe("[[id:abc][Plant x now]]");
  });

  it("resolve by id, or by text in reading order", () => {
    const tomatoes = idOf(base, "Tomatoes");
    expect(resolveReference(base, `id:${tomatoes}`)).toBe(tomatoes);
    expect(resolveReference(base, "tomatoes")).toBe(tomatoes);
    expect(resolveReference(base, "id:gone")).toBeNull();
    expect(resolveReference(base, "nothing like it")).toBeNull();
  });

  it("are found from the item they point at", () => {
    const tomatoes = idOf(base, "Tomatoes");
    let doc = setText(base, idOf(base, "water"), `water the ${referenceTo(tomatoes, "Tomatoes")}`);
    doc = setText(doc, idOf(doc, "Notes"), "see [[Tomatoes]] and [[Garden]]");
    expect(backlinks(doc, tomatoes).map((id) => doc.items[id].text)).toEqual([`water the [[id:${tomatoes}][Tomatoes]]`, "see [[Tomatoes]] and [[Garden]]"]);
    expect(backlinks(doc, idOf(doc, "Plans"))).toEqual([]);
  });

  it("inside a code block are code, not links", () => {
    const doc = setNote(base, idOf(base, "Notes"), "```\nsee [[Tomatoes]]\n```");
    expect(backlinks(doc, idOf(doc, "Tomatoes"))).toEqual([]);
  });

  it("render the label and keep the raw text", () => {
    const html = renderInline("see [[id:abc][the garden]] or [[Plans]]");
    expect(html.replace(/<[^>]+>/g, "")).toBe("see [[id:abc][the garden]] or [[Plans]]");
    expect([...html.matchAll(/<span class="ref" data-ref="([^"]+)">([^<]+)</g)].map((match) => [match[2], match[1]])).toEqual([
      ["the garden", "id:abc"],
      ["Plans", "Plans"],
    ]);
  });
});

describe("links into private items", () => {
  it("name the private item they lead into when the item itself cannot be seen here", () => {
    let doc = parseIndentedText("Journal\nIndex");
    doc = setNote(doc, idOf(doc, "Journal"), `🔒private:1:personal:${"A".repeat(40)}`);
    const journal = idOf(doc, "Journal");
    expect(privateHolderOf(doc, `id:${journal}~abc`)).toBe(journal);
    expect(privateHolderOf(doc, "id:gone")).toBeNull();
    expect(privateHolderOf(doc, `id:${idOf(doc, "Index")}~abc`)).toBeNull();
    expect(privateHolderOf(doc, `id:${journal}`)).toBeNull();
  });
});
