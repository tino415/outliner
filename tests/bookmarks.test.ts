import { describe, expect, it } from "vitest";
import {
  BOOKMARKS,
  BOOKMARKS_ABOUT,
  Doc,
  ROOT,
  appendChild,
  buildDoc,
  completeAll,
  contradictsBookmarks,
  duplicate,
  indent,
  insertChild,
  isAboutItem,
  mergeInto,
  moveTo,
  outdent,
  readOnlyNotice,
  remove,
  removeAll,
  removeCompleted,
  setCollapsed,
  setFlags,
  setItemProperty,
  setNote,
  setText,
  split,
  toggleCompleted,
  withBookmarksItem,
  withBookmarksParts,
  withoutBookmarksAbout,
} from "../src/model";
import { bookmarkForDigit, bookmarkPage, bookmarksIn } from "../src/bookmarks";
import { History } from "../src/store";

function outline() {
  const ids: Record<string, string> = {};
  const doc = buildDoc((root, append) => {
    for (const name of ["Garden", "Shed"]) ids[name] = append(root, name).id;
  });
  return { doc: withBookmarksItem(doc), ids };
}

const filter = { showCompleted: true };
const firstLine = `${BOOKMARKS_ABOUT}-1`;
const nestedLine = `${BOOKMARKS_ABOUT}-1-1`;

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

  it("is never in a saved or synced document", () => {
    const { doc } = outline();
    const saved = withoutBookmarksAbout(doc);
    expect(Object.keys(saved.items).filter(isAboutItem)).toEqual([]);
    expect(saved.items[BOOKMARKS].children).toEqual([]);
    expect(withBookmarksItem(saved).items[BOOKMARKS].children[0]).toBe(BOOKMARKS_ABOUT);
  });

  it("is put back whole after a garbled line, a deleted line or a line moved away", () => {
    const { doc } = outline();
    const garbled = { items: { ...doc.items, [firstLine]: { ...doc.items[firstLine], text: "garbled" }, [nestedLine]: undefined as never } };
    const restored = withBookmarksParts(garbled);
    expect(restored.items[firstLine].text).toBe("Add a bookmark");
    expect(restored.items[nestedLine].text).toBe("Add an item here with a link to a page or a web address");
    const moved = { items: { ...doc.items, [firstLine]: { ...doc.items[firstLine], parent: BOOKMARKS } } };
    expect(withBookmarksParts(moved).items[firstLine].parent).toBe(BOOKMARKS_ABOUT);
  });

  it("keeps its folding", () => {
    const unfolded = setCollapsed(outline().doc, BOOKMARKS_ABOUT, false);
    expect(withBookmarksParts(unfolded)).toBe(unfolded);
  });

  it("is refused deletion, nesting, merging and leaving Bookmarks", () => {
    const { doc, ids } = outline();
    expect(remove(doc, BOOKMARKS_ABOUT)).toBe(doc);
    expect(remove(doc, firstLine)).toBe(doc);
    expect(removeAll(doc, [ids.Garden, BOOKMARKS_ABOUT])).toBe(doc);
    expect(moveTo(doc, BOOKMARKS_ABOUT, ROOT, 0)).toBe(doc);
    expect(outdent(doc, BOOKMARKS_ABOUT, ROOT)).toBe(doc);
    expect(outdent(doc, nestedLine, ROOT)).toBe(doc);
    expect(moveTo(doc, ids.Garden, BOOKMARKS_ABOUT, 0)).toBe(doc);
    expect(mergeInto(doc, BOOKMARKS_ABOUT, ids.Shed).doc).toBe(doc);
    expect(mergeInto(doc, ids.Shed, BOOKMARKS_ABOUT).doc).toBe(doc);
    expect(removeCompleted(toggleCompleted(doc, BOOKMARKS_ABOUT), ROOT).count).toBe(0);
  });

  it("is not a parent for the bookmark after it", () => {
    const { doc, id } = withChild(outline().doc, "Plan");
    expect(indent(doc, id, filter)).toBe(doc);
  });

  it("stays first when a bookmark is added or moved to the top", () => {
    const { doc, id } = withChild(outline().doc, "Plan");
    expect(withBookmarksParts(insertChild(doc, BOOKMARKS, 0).doc).items[BOOKMARKS].children[0]).toBe(BOOKMARKS_ABOUT);
    expect(withBookmarksParts(moveTo(doc, id, BOOKMARKS, 0)).items[BOOKMARKS].children).toEqual([BOOKMARKS_ABOUT, id]);
  });
});

describe("what is read-only in Bookmarks and About Bookmarks", () => {
  it("refuses a new title, note, completion and properties on About and its lines", () => {
    const { doc } = outline();
    for (const id of [BOOKMARKS_ABOUT, firstLine, nestedLine]) {
      expect(setText(doc, id, "x")).toBe(doc);
      expect(setNote(doc, id, "x")).toBe(doc);
      expect(toggleCompleted(doc, id)).toBe(doc);
      expect(completeAll(doc, [id])).toBe(doc);
      expect(setItemProperty(doc, id, "key", "1")).toBe(doc);
      expect(setFlags(doc, id, { completed: true })).toBe(doc);
      expect(setFlags(doc, id, { note: "x" })).toBe(doc);
      expect(setFlags(doc, id, { properties: { key: "1" } })).toBe(doc);
    }
  });

  it("refuses children added to About and its lines, by insert, split, indent, move and duplicate", () => {
    const { doc, id } = withChild(outline().doc, "Plan");
    const aboutFirst = doc.items[BOOKMARKS].children.indexOf(BOOKMARKS_ABOUT);
    expect(aboutFirst).toBe(0);
    expect(insertChild(doc, BOOKMARKS_ABOUT, 0).doc).toBe(doc);
    expect(insertChild(doc, firstLine, 0).doc).toBe(doc);
    expect(split(doc, firstLine, 3, filter).doc).toBe(doc);
    expect(split(doc, nestedLine, 0, filter).doc).toBe(doc);
    expect(moveTo(doc, id, firstLine, 0)).toBe(doc);
    expect(moveTo(doc, id, BOOKMARKS_ABOUT, 0)).toBe(doc);
    expect(duplicate(doc, nestedLine).doc).toBe(doc);
  });

  it("lets Enter at the end of About add a bookmark below it, even unfolded", () => {
    const { doc } = outline();
    const unfolded = setCollapsed(doc, BOOKMARKS_ABOUT, false);
    const result = split(unfolded, BOOKMARKS_ABOUT, "About Bookmarks".length, filter);
    expect(result.doc.items[BOOKMARKS].children).toEqual([BOOKMARKS_ABOUT, result.id]);
    expect(result.doc.items[BOOKMARKS_ABOUT].children).toEqual(doc.items[BOOKMARKS_ABOUT].children);
  });

  it("refuses a new title, note and completion on Bookmarks", () => {
    const { doc } = outline();
    expect(setText(doc, BOOKMARKS, "Pages")).toBe(doc);
    expect(setNote(doc, BOOKMARKS, "x")).toBe(doc);
    expect(toggleCompleted(doc, BOOKMARKS)).toBe(doc);
    expect(completeAll(doc, [BOOKMARKS])).toBe(doc);
    expect(setFlags(doc, BOOKMARKS, { completed: true })).toBe(doc);
    expect(split(doc, BOOKMARKS, 3, filter).doc).toBe(doc);
  });

  it("keeps Bookmarks' properties, folding and children editable", () => {
    const { doc } = outline();
    expect(setItemProperty(doc, BOOKMARKS, "columns", "").items[BOOKMARKS].properties.columns).toBeUndefined();
    expect(setItemProperty(doc, BOOKMARKS, "private", "k").items[BOOKMARKS].properties.private).toBe("k");
    expect(setCollapsed(doc, BOOKMARKS, true).items[BOOKMARKS].collapsed).toBe(true);
    const { doc: withPlan, id } = withChild(doc, "Plan");
    expect(setText(withPlan, id, "Renamed").items[id].text).toBe("Renamed");
    expect(toggleCompleted(withPlan, id).items[id].completed).toBe(true);
  });

  it("is put back in a document where Bookmarks was renamed or completed", () => {
    const { doc } = outline();
    const renamed = { items: { ...doc.items, [BOOKMARKS]: { ...doc.items[BOOKMARKS], text: "Pages", note: "x", completed: true } } };
    expect(withBookmarksParts(renamed).items[BOOKMARKS]).toMatchObject({ text: "Bookmarks", note: "", completed: false });
  });

  it("is not accepted from a sync write that differs, while a sealed note and the rest are", () => {
    expect(contradictsBookmarks(BOOKMARKS, "text", "Pages")).toBe(true);
    expect(contradictsBookmarks(BOOKMARKS, "text", "Bookmarks")).toBe(false);
    expect(contradictsBookmarks(BOOKMARKS, "note", "x")).toBe(true);
    expect(contradictsBookmarks(BOOKMARKS, "note", "🔒private:1:key:AAAA")).toBe(false);
    expect(contradictsBookmarks(BOOKMARKS, "completed", true)).toBe(true);
    expect(contradictsBookmarks(BOOKMARKS, "prop:columns", "key")).toBe(false);
    expect(contradictsBookmarks("other", "text", "Pages")).toBe(false);
  });

  it("has the notice that names it", () => {
    expect(readOnlyNotice(BOOKMARKS)).toBe("Bookmarks is read-only");
    expect(readOnlyNotice(nestedLine)).toBe("About Bookmarks is read-only");
  });
});

describe("the key column of Bookmarks", () => {
  it("is set when Bookmarks is made", () => {
    expect(outline().doc.items[BOOKMARKS].properties.columns).toBe("key");
  });

  it("stays removed once Bookmarks exists", () => {
    const { doc } = outline();
    const cleared = setItemProperty(doc, BOOKMARKS, "columns", "");
    expect(withBookmarksItem(cleared).items[BOOKMARKS].properties.columns).toBeUndefined();
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
