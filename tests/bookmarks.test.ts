import { describe, expect, it } from "vitest";
import { BOOKMARKS, BOOKMARKS_ABOUT, Doc, ROOT, appendChild, buildDoc, indent, mergeInto, moveTo, outdent, remove, removeAll, removeCompleted, setItemProperty, setText, toggleCompleted, withBookmarksItem } from "../src/model";
import { bookmarkForDigit, bookmarkPage, bookmarksIn } from "../src/bookmarks";
import { History } from "../src/store";

function outline() {
  const ids: Record<string, string> = {};
  const doc = buildDoc((root, append) => {
    for (const name of ["Garden", "Shed"]) ids[name] = append(root, name).id;
  });
  return { doc: withBookmarksItem(doc), ids };
}

function withoutAbout(doc: Doc): Doc {
  const items = Object.fromEntries(Object.entries(doc.items).filter(([id]) => !id.startsWith(BOOKMARKS_ABOUT)));
  return { items: { ...items, [BOOKMARKS]: { ...doc.items[BOOKMARKS], children: [] } } };
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
    expect(mergeInto(doc, ids.Shed, BOOKMARKS).doc).toBe(doc);
    expect(moveTo(doc, BOOKMARKS, ROOT, 0).items[ROOT].children[0]).toBe(BOOKMARKS);
  });
});

describe("the About Bookmarks item", () => {
  it("is the collapsed first child of Bookmarks, with the explanation as its lines", () => {
    const { doc } = outline();
    const about = doc.items[BOOKMARKS_ABOUT];
    expect(about).toMatchObject({ text: "About Bookmarks", parent: BOOKMARKS, collapsed: true });
    expect(doc.items[BOOKMARKS].children[0]).toBe(BOOKMARKS_ABOUT);
    const lines = (id: string, depth = 0): string[] =>
      doc.items[id].children.flatMap((child) => ["  ".repeat(depth) + doc.items[child].text, ...lines(child, depth + 1)]);
    expect(lines(BOOKMARKS_ABOUT)).toEqual([
      "Add a bookmark",
      "  Add an item here with a link to a page or a web address",
      "  Open the page, tap ⋯ and tap Bookmark this page",
      "Tap or click a bookmark's link to open its page; a web address opens in a new tab",
      "To give a bookmark a shortcut, write a digit from 1 to 9 in its key column",
    ]);
  });

  it("is not a bookmark", () => {
    expect(bookmarksIn(outline().doc)).toEqual([]);
  });

  it("is made again when missing, and so is only made once per outline", () => {
    const { doc } = outline();
    const lacking = withBookmarksItem(withoutAbout(doc));
    expect(lacking.items[BOOKMARKS_ABOUT]).toBeDefined();
    expect(withBookmarksItem(lacking)).toBe(lacking);
  });

  it("is refused deletion, nesting, merging and leaving Bookmarks", () => {
    const { doc, ids } = outline();
    expect(remove(doc, BOOKMARKS_ABOUT)).toBe(doc);
    expect(removeAll(doc, [ids.Garden, BOOKMARKS_ABOUT])).toBe(doc);
    expect(moveTo(doc, BOOKMARKS_ABOUT, ROOT, 0)).toBe(doc);
    expect(outdent(doc, BOOKMARKS_ABOUT, ROOT)).toBe(doc);
    expect(moveTo(doc, ids.Garden, BOOKMARKS_ABOUT, 0)).toBe(doc);
    expect(mergeInto(doc, BOOKMARKS_ABOUT, ids.Shed).doc).toBe(doc);
    expect(mergeInto(doc, ids.Shed, BOOKMARKS_ABOUT).doc).toBe(doc);
    expect(removeCompleted(toggleCompleted(doc, BOOKMARKS_ABOUT), ROOT).count).toBe(0);
  });

  it("is not a parent for the bookmark after it", () => {
    const { doc, id } = withChild(outline().doc, "Plan");
    expect(indent(doc, id, { showCompleted: true })).toBe(doc);
  });
});

describe("the key column of Bookmarks", () => {
  it("is set when the About item is made", () => {
    expect(outline().doc.items[BOOKMARKS].properties.columns).toBe("key");
  });

  it("stays removed once the About item exists", () => {
    const { doc } = outline();
    const cleared = setItemProperty(doc, BOOKMARKS, "columns", "");
    expect(withBookmarksItem(cleared).items[BOOKMARKS].properties.columns).toBeUndefined();
  });

  it("keeps columns the user already chose when the About item is made", () => {
    const { doc } = outline();
    const chosen = setItemProperty(withoutAbout(doc), BOOKMARKS, "columns", "key due");
    expect(withBookmarksItem(chosen).items[BOOKMARKS].properties.columns).toBe("key due");
  });

  it("is added to an existing Bookmarks that has no About item", () => {
    const { doc } = outline();
    const old = setItemProperty(withoutAbout(doc), BOOKMARKS, "columns", "");
    expect(old.items[BOOKMARKS].properties.columns).toBeUndefined();
    expect(withBookmarksItem(old).items[BOOKMARKS].properties.columns).toBe("key");
  });
});

describe("the bookmarks in the list", () => {
  it("adds a page as a link at the end, and says so when it is there already", () => {
    const { doc, ids } = outline();
    const first = bookmarkPage(doc, ids.Garden);
    expect(first.outcome).toBe("added");
    expect(first.doc.items[first.doc.items[BOOKMARKS].children.at(-1)!].text).toBe(`[[id:${ids.Garden}][Garden]]`);
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
