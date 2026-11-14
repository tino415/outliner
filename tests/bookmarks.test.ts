import { describe, expect, it } from "vitest";
import { BOOKMARKS, Doc, ROOT, appendChild, buildDoc, indent, mergeInto, moveTo, remove, removeAll, removeCompleted, setItemProperty, setText, toggleCompleted, withBookmarksItem } from "../src/model";
import { bookmarkForDigit, bookmarkPage, bookmarksIn } from "../src/bookmarks";
import { History } from "../src/store";

function outline() {
  const ids: Record<string, string> = {};
  const doc = buildDoc((root, append) => {
    for (const name of ["Garden", "Shed"]) ids[name] = append(root, name).id;
  });
  return { doc: withBookmarksItem(doc), ids };
}

function withChild(doc: Doc, text: string): { doc: Doc; id: string } {
  const added = appendChild(doc, BOOKMARKS, "");
  return { doc: setText(added.doc, added.id, text), id: added.id };
}

describe("the Bookmarks system item", () => {
  it("is made once, at the top level, with the fixed id", () => {
    const { doc } = outline();
    expect(doc.items[BOOKMARKS]).toMatchObject({ text: "Bookmarks", parent: ROOT });
    expect(doc.items[ROOT].children.filter((id) => id === BOOKMARKS)).toHaveLength(1);
    expect(withBookmarksItem(doc)).toBe(doc);
  });

  it("refuses to be deleted, nested or merged away, and may be moved among the top items", () => {
    const { doc, ids } = outline();
    expect(remove(doc, BOOKMARKS)).toBe(doc);
    expect(removeAll(doc, [ids.Garden, BOOKMARKS])).toBe(doc);
    expect(moveTo(doc, BOOKMARKS, ids.Garden, 0)).toBe(doc);
    expect(indent(doc, BOOKMARKS, { showCompleted: true })).toBe(doc);
    expect(mergeInto(doc, BOOKMARKS, ids.Shed).doc).toBe(doc);
    expect(moveTo(doc, BOOKMARKS, ROOT, 0).items[ROOT].children[0]).toBe(BOOKMARKS);
  });
});

describe("the bookmarks in the list", () => {
  it("adds a page as a link at the end, and says so when it is there already", () => {
    const { doc, ids } = outline();
    const first = bookmarkPage(doc, ids.Garden);
    expect(first.outcome).toBe("added");
    expect(first.doc.items[first.doc.items[BOOKMARKS].children[0]].text).toBe(`[[id:${ids.Garden}][Garden]]`);
    expect(bookmarkPage(first.doc, ids.Garden).outcome).toBe("already");
    expect(bookmarkPage(first.doc, BOOKMARKS).outcome).toBe("list");
    expect(bookmarkPage(first.doc, ROOT).outcome).toBe("home");
  });

  it("opens the item a link names, the URL a child holds, or the child itself", () => {
    const { doc, ids } = outline();
    const url = withChild(bookmarkPage(doc, ids.Garden).doc, "https://example.com/plan");
    const own = withChild(url.doc, "Payout plan");
    const byText = withChild(own.doc, "[[Shed]]");
    expect(bookmarksIn(byText.doc).map(({ destination }) => destination)).toEqual([
      { zoom: ids.Garden },
      { url: "https://example.com/plan" },
      { zoom: own.id },
      { zoom: ids.Shed },
    ]);
  });

  it("skips a link whose target is gone", () => {
    const { doc } = outline();
    expect(bookmarksIn(withChild(doc, "[[id:nothing][Gone]]").doc)).toEqual([]);
  });

  it("gives a child with key 1..9 its digit, and ignores other keys", () => {
    const { doc } = outline();
    const one = withChild(doc, "Plan");
    const two = withChild(one.doc, "Other");
    const keyed = setItemProperty(setItemProperty(two.doc, one.id, "key", "3"), two.id, "key", "12");
    expect(bookmarkForDigit(keyed, 3)?.child).toBe(one.id);
    expect(bookmarksIn(keyed).map(({ digit }) => digit)).toEqual([3, null]);
    expect(bookmarkForDigit(keyed, 4)).toBeUndefined();
  });
});

describe("what keeps the item", () => {
  it("survives Remove completed", () => {
    const { doc } = outline();
    const { doc: next, count } = removeCompleted(toggleCompleted(doc, BOOKMARKS), ROOT);
    expect(count).toBe(0);
    expect(next.items[BOOKMARKS]).toBeDefined();
  });

  it("comes back after an undo that went before its creation", () => {
    const bare = buildDoc(() => {});
    const history = new History(bare);
    history.commit(withBookmarksItem(bare), null);
    history.undo(null);
    history.keep(withBookmarksItem(history.doc));
    expect(history.doc.items[BOOKMARKS]).toBeDefined();
  });
});
