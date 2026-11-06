import { describe, expect, it } from "vitest";
import { Doc, ItemId, ROOT, setItemProperty } from "../src/model";
import { parseIndentedText } from "../src/transfer";
import { itemLink, linkBaseIn, mayShareTitle } from "../src/itemLink";

function idOf(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

function withBase(doc: Doc, text: string, base: string): Doc {
  return setItemProperty(doc, idOf(doc, text), "link-base", base);
}

describe("finding link-base", () => {
  it("is none when no item sets it", () => {
    expect(linkBaseIn(parseIndentedText("a\nb"))).toBeNull();
  });

  it("is the property of an item anywhere in the outline", () => {
    const doc = withBase(parseIndentedText("a\n  deep\nb"), "deep", "https://example.test/app/");
    expect(linkBaseIn(doc)).toBe("https://example.test/app/");
  });

  it("is the first in outline order when several items set it", () => {
    let doc = parseIndentedText("a\n  inner\nb");
    doc = withBase(doc, "b", "https://later.test/");
    doc = withBase(doc, "inner", "https://first.test/");
    expect(linkBaseIn(doc)).toBe("https://first.test/");
  });
});

describe("the link to an item", () => {
  const opened = "https://opened.test/outliner/";

  it("is the address the app was opened at, then #/ and the id", () => {
    const doc = parseIndentedText("a");
    expect(itemLink(doc, idOf(doc, "a"), opened)).toBe(`${opened}#/${idOf(doc, "a")}`);
  });

  it("starts from the link-base setting when there is one", () => {
    const doc = withBase(parseIndentedText("a"), "a", "https://dev.example.test/");
    expect(itemLink(doc, idOf(doc, "a"), opened)).toBe(`https://dev.example.test/#/${idOf(doc, "a")}`);
  });

  it("encodes the id", () => {
    const doc = parseIndentedText("a");
    expect(itemLink(doc, "a b/c~1", opened)).toBe(`${opened}#/a%20b%2Fc~1`);
  });

  it("drops a hash the base already has", () => {
    const doc = withBase(parseIndentedText("a"), "a", "https://dev.example.test/#/old");
    expect(itemLink(doc, ROOT, opened)).toBe("https://dev.example.test/#/");
  });
});

describe("sharing the item's words", () => {
  it("is allowed for a public item", () => {
    const doc = parseIndentedText("open");
    expect(mayShareTitle(doc, idOf(doc, "open"))).toBe(true);
  });

  it("is refused for a private item", () => {
    const plain = parseIndentedText("secret");
    const doc = setItemProperty(plain, idOf(plain, "secret"), "private", "mine");
    expect(mayShareTitle(doc, idOf(doc, "secret"))).toBe(false);
  });
});
