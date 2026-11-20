import { describe, expect, it } from "vitest";
import { Doc, ItemId, ROOT, setItemProperty, withSettingsItems } from "../src/model";
import { parseIndentedText } from "../src/transfer";
import { search } from "../src/search";
import { itemLink, itemNamedBy, linkBaseIn, mayShareTitle } from "../src/itemLink";

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

describe("the item a search names", () => {
  const doc = parseIndentedText("a\n  deep\nb");
  const deep = idOf(doc, "deep");

  it("is the item whose whole id was typed", () => {
    expect(itemNamedBy(doc, deep)).toBe(deep);
  });

  it("is the item a pasted link points at, spaces around it ignored", () => {
    expect(itemNamedBy(doc, `  https://example.test/app/#/${encodeURIComponent(deep)} `)).toBe(deep);
  });

  it("is the item a private id names", () => {
    const privateId = "root~abc";
    const withPrivate = { ...doc, items: { ...doc.items, [privateId]: { ...doc.items[deep], id: privateId } } };
    expect(itemNamedBy(withPrivate, `#/${encodeURIComponent(privateId)}`)).toBe(privateId);
  });

  it("is none for the fixed word ids typed bare, and the item for a link to one", () => {
    const withBookmarks = withSettingsItems(doc);
    expect(itemNamedBy(withBookmarks, "bookmarks")).toBeNull();
    expect(itemNamedBy(withBookmarks, "#/bookmarks")).toBe("bookmarks");
  });

  it("is none for an id no item has", () => {
    expect(itemNamedBy(doc, "nosuchitem")).toBeNull();
    expect(itemNamedBy(doc, "https://example.test/#/nosuchitem")).toBeNull();
  });

  it("is none for a part of an id, which searches as text", () => {
    expect(itemNamedBy(doc, deep.slice(0, -1))).toBeNull();
  });

  it("is none for an empty query or a link with a broken escape", () => {
    expect(itemNamedBy(doc, "  ")).toBeNull();
    expect(itemNamedBy(doc, "#/%E0%A4%A")).toBeNull();
  });
});

describe("searching for an id", () => {
  const doc = parseIndentedText("page\n  child\n    leaf\nother");
  const [page, child, leaf, other] = ["page", "child", "leaf", "other"].map((text) => idOf(doc, text));
  const open = { showCompleted: false };
  const completed = (id: ItemId): Doc => ({ ...doc, items: { ...doc.items, [id]: { ...doc.items[id], completed: true } } });

  it("matches an item under the page and shows its ancestors below the page", () => {
    const result = search(doc, page, leaf, open);
    expect([...result.matches]).toEqual([leaf]);
    expect([...result.shown]).toEqual([child, leaf]);
    expect(result.terms).toEqual([]);
    expect(result.elsewhere).toBeNull();
  });

  it("names an item outside the page as elsewhere", () => {
    const result = search(doc, page, other, open);
    expect(result.matches.size).toBe(0);
    expect(result.elsewhere).toBe(other);
  });

  it("does not call the page itself elsewhere", () => {
    expect(search(doc, page, page, open).elsewhere).toBeNull();
  });

  it("names a completed item elsewhere while completed items are hidden", () => {
    expect(search(completed(leaf), page, leaf, open).elsewhere).toBe(leaf);
    expect([...search(completed(leaf), page, leaf, { showCompleted: true }).matches]).toEqual([leaf]);
  });

  it("matches under a completed page, which only hides what is above it", () => {
    expect([...search(completed(page), child, leaf, open).matches]).toEqual([leaf]);
  });
});
