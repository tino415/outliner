import { describe, expect, it } from "vitest";
import { Doc, ItemId, ROOT, appendChild, emptyDoc, setItemProperty } from "../src/model";
import { InsertHow, InsertList, NOT_READ, detailOf, ensureInsertLists, insertListsFor, insertPick, picksOf, readInsert } from "../src/insertLists";

class Outline {
  doc: Doc = emptyDoc();

  add(parent: ItemId, text: string, properties: Record<string, string> = {}): ItemId {
    const created = appendChild(this.doc, parent, text);
    this.doc = Object.entries(properties).reduce((next, [key, value]) => setItemProperty(next, created.id, key, value), created.doc);
    return created.id;
  }

  titles(parent: ItemId): string[] {
    return this.doc.items[parent].children.map((child) => this.doc.items[child].text);
  }
}

/** Food with its lists, a database of portions and meals, and a journal day with a Breakfast. */
function food() {
  const outline = new Outline();
  const foodPage = outline.add(ROOT, "Food", { columns: "kcal protein" });
  const settings = outline.add(foodPage, "_settings");
  const insert = outline.add(settings, "Insert");
  const foods = outline.add(insert, "Foods", { query: 'under:"Food/Database" has:grams', insert: "link into food with grams" });
  const days = outline.add(insert, "Earlier days", { query: 'under:"Food/Journal" -has:grams', insert: "copy contents, last first" });
  const database = outline.add(foodPage, "Database");
  const portions = outline.add(database, "Portions");
  const cup = outline.add(portions, "Greek yoghurt, cup", { grams: "120", kcal: "116", protein: "11" });
  const meals = outline.add(database, "Meals");
  const bowl = outline.add(meals, "Yoghurt bowl");
  outline.add(bowl, "Oats", { grams: "150" });
  outline.add(bowl, "Milk", { grams: "250" });
  const journal = outline.add(foodPage, "Journal");
  const day = outline.add(journal, "2026-11-26");
  const breakfast = outline.add(day, "Breakfast");
  return { outline, foodPage, insert, foods, days, database, cup, bowl, journal, day, breakfast };
}

function listsAt(doc: Doc, id: ItemId): InsertList[] {
  const lists = insertListsFor(doc, id);
  if (!lists) throw new Error("no lists");
  return lists;
}

function how(list: InsertList): InsertHow {
  if ("problem" in list.how) throw new Error(list.how.problem);
  return list.how;
}

describe("readInsert", () => {
  it("reads a link with the keys a line starts with", () => {
    expect(readInsert("link into food with grams")).toEqual({ kind: "link", into: "food", with: ["grams"], lastFirst: false });
  });

  it("reads copy", () => {
    expect(readInsert("copy")).toEqual({ kind: "copy", lastFirst: false });
  });

  it("reads copy contents listing the last match first", () => {
    expect(readInsert("copy contents, last first")).toEqual({ kind: "contents", lastFirst: true });
  });

  it("refuses a link into a key that sets up the line", () => {
    expect(readInsert("link into private")).toEqual({ problem: NOT_READ });
    expect(readInsert("link into food with query")).toEqual({ problem: NOT_READ });
  });

  it("gives the problem text for anything else", () => {
    expect(readInsert("mirror")).toEqual({ problem: NOT_READ });
    expect(NOT_READ).toBe("insert is not “link into KEY”, “copy” or “copy contents”");
  });
});

describe("insertListsFor", () => {
  it("gives an item the lists of the nearest item above that has them, and only those", () => {
    const { outline, journal, day, breakfast } = food();
    const settings = outline.add(journal, "_settings");
    const insert = outline.add(settings, "insert");
    outline.add(insert, "Recent", { query: "#recent", insert: "copy" });
    expect(listsAt(outline.doc, breakfast).map((list) => list.title)).toEqual(["Recent"]);
    expect(listsAt(outline.doc, day).map((list) => list.title)).toEqual(["Recent"]);
  });

  it("looks past an Insert that lists nothing", () => {
    const { outline, day, breakfast } = food();
    outline.doc = ensureInsertLists(outline.doc, day).doc;
    expect(listsAt(outline.doc, breakfast).map((list) => list.title)).toEqual(["Foods", "Earlier days"]);
  });

  it("gives an item outside Food none", () => {
    const { outline } = food();
    const elsewhere = outline.add(ROOT, "Garden");
    expect(insertListsFor(outline.doc, elsewhere)).toBeNull();
  });

  it("reads nothing from an Insert item outside a _settings", () => {
    const outline = new Outline();
    const page = outline.add(ROOT, "Page");
    const insert = outline.add(page, "Insert");
    outline.add(insert, "Foods", { query: "has:grams", insert: "copy" });
    const item = outline.add(page, "Lunch");
    expect(insertListsFor(outline.doc, item)).toBeNull();
  });

  it("reads each list's title, query and insert", () => {
    const { outline, breakfast } = food();
    const [foods, days] = listsAt(outline.doc, breakfast);
    expect(foods).toMatchObject({ title: "Foods", query: 'under:"Food/Database" has:grams', how: { kind: "link", into: "food", with: ["grams"] } });
    expect(days).toMatchObject({ title: "Earlier days", how: { kind: "contents", lastFirst: true } });
  });
});

describe("picksOf", () => {
  it("lists what the query matches, narrowed to titles holding every typed word", () => {
    const { outline, breakfast, cup, bowl } = food();
    const [foods] = listsAt(outline.doc, breakfast);
    expect(picksOf(outline.doc, foods, breakfast, "")).toEqual([cup, ...outline.doc.items[bowl].children]);
    expect(picksOf(outline.doc, foods, breakfast, "YOG cup")).toEqual([cup]);
  });

  it("lists the last match first when the list says so", () => {
    const { outline, journal, breakfast } = food();
    const later = outline.add(journal, "2026-11-27");
    const lunch = outline.add(later, "Lunch");
    const [, days] = listsAt(outline.doc, lunch);
    const inOrder = picksOf(outline.doc, { ...days, how: { ...how(days), lastFirst: false } }, lunch, "");
    expect(picksOf(outline.doc, days, lunch, "")).toEqual([...inOrder].reverse());
    expect(inOrder).toContain(breakfast);
  });

  it("leaves out the item, the items above it and anything in a _settings", () => {
    const { outline, foodPage, journal, day, breakfast } = food();
    const everything = { id: "x", title: "All", query: "under:Food", how: readInsert("copy") } as InsertList;
    const picks = picksOf(outline.doc, everything, breakfast, "");
    expect(picks).not.toContain(breakfast);
    expect(picks).not.toContain(day);
    expect(picks).not.toContain(journal);
    expect(picks).not.toContain(foodPage);
    expect(picks.map((id) => outline.doc.items[id].text)).not.toContain("Insert");
    expect(picks.map((id) => outline.doc.items[id].text)).not.toContain("Foods");
    expect(picks.map((id) => outline.doc.items[id].text)).toContain("Database");
  });

  it("offers nothing from a list with no query", () => {
    const { outline, breakfast } = food();
    const [foods] = listsAt(outline.doc, breakfast);
    expect(picksOf(outline.doc, { ...foods, query: null }, breakfast, "")).toEqual([]);
  });

  it("leaves out what lies inside a private item when the line would land outside it", () => {
    const { outline, database, breakfast } = food();
    const secret = outline.add(database, "Secret recipes", { private: "home" });
    outline.add(secret, "Hidden stew", { grams: "300" });
    const [foods] = listsAt(outline.doc, breakfast);
    expect(picksOf(outline.doc, foods, breakfast, "stew")).toEqual([]);
  });

  it("leaves out a private item whose values a line would start from", () => {
    const { outline, database, breakfast } = food();
    const secret = outline.add(database, "Secret stew", { private: "home", grams: "300" });
    outline.add(secret, "Beans", { grams: "300" });
    const [foods] = listsAt(outline.doc, breakfast);
    expect(picksOf(outline.doc, foods, breakfast, "stew")).toEqual([]);
    expect(picksOf(outline.doc, { ...foods, how: readInsert("copy") }, breakfast, "stew")).toEqual([secret]);
  });
});

describe("detailOf", () => {
  it("shows the parent, the with keys and the declared columns", () => {
    const { outline, breakfast, cup } = food();
    const [foods] = listsAt(outline.doc, breakfast);
    expect(detailOf(outline.doc, foods, cup)).toBe("Portions · grams 120 · kcal 116 · protein 11");
  });

  it("leaves out a key with no value", () => {
    const { outline, breakfast, bowl } = food();
    const [foods] = listsAt(outline.doc, breakfast);
    expect(detailOf(outline.doc, foods, bowl)).toBe("Meals · grams 400");
  });
});

describe("insertPick", () => {
  it("adds a last line linking the pick and starting with its grams", () => {
    const { outline, breakfast, cup } = food();
    const [foods] = listsAt(outline.doc, breakfast);
    outline.add(breakfast, "Coffee");
    const added = insertPick(outline.doc, how(foods), breakfast, cup)!;
    expect(added.doc.items[breakfast].children.at(-1)).toBe(added.id);
    expect(added.doc.items[added.id].text).toBe("Greek yoghurt, cup");
    expect(added.doc.items[added.id].properties).toEqual({ food: `[[id:${cup}][Greek yoghurt, cup]]`, grams: "120" });
  });

  it("starts a line of a meal with no grams of its own at what its lines add up to", () => {
    const { outline, breakfast, bowl } = food();
    const [foods] = listsAt(outline.doc, breakfast);
    const added = insertPick(outline.doc, how(foods), breakfast, bowl)!;
    expect(added.doc.items[added.id].properties.grams).toBe("400");
  });

  it("copies a pick with its lines and leaves the pick as it was", () => {
    const { outline, day } = food();
    const lunch = outline.add(day, "Lunch");
    outline.add(lunch, "Soup", { grams: "300" });
    outline.add(lunch, "Bread", { grams: "60" });
    const tomorrow = outline.add(outline.doc.items[day].parent!, "2026-11-27");
    const before = outline.doc.items[lunch];
    const added = insertPick(outline.doc, readInsert("copy") as InsertHow, tomorrow, lunch)!;
    outline.doc = added.doc;
    expect(outline.titles(tomorrow)).toEqual(["Lunch"]);
    expect(outline.titles(added.id)).toEqual(["Soup", "Bread"]);
    expect(added.doc.items[added.doc.items[added.id].children[0]].properties).toEqual({ grams: "300" });
    expect(added.doc.items[lunch]).toBe(before);
  });

  it("copies what is in a pick after the item's own children, and no pick itself", () => {
    const { outline, day } = food();
    const lunch = outline.add(day, "Lunch");
    outline.add(lunch, "Soup", { grams: "300" });
    outline.add(lunch, "Bread", { grams: "60" });
    const tomorrow = outline.add(outline.doc.items[day].parent!, "2026-11-27");
    const emptyLunch = outline.add(tomorrow, "Lunch");
    const added = insertPick(outline.doc, readInsert("copy contents") as InsertHow, emptyLunch, lunch)!;
    outline.doc = added.doc;
    expect(outline.titles(emptyLunch)).toEqual(["Soup", "Bread"]);
    expect(outline.titles(tomorrow)).toEqual(["Lunch"]);
    expect(added.id).toBe(added.doc.items[emptyLunch].children[0]);
  });

  it("adds nothing for the contents of a pick with no children", () => {
    const { outline, day, breakfast } = food();
    const lunch = outline.add(day, "Lunch");
    expect(insertPick(outline.doc, readInsert("copy contents") as InsertHow, lunch, breakfast)).toBeNull();
  });

  it("unfolds the item it adds under", () => {
    const { outline, breakfast, cup } = food();
    outline.add(breakfast, "Coffee");
    outline.doc = { items: { ...outline.doc.items, [breakfast]: { ...outline.doc.items[breakfast], collapsed: true } } };
    const [foods] = listsAt(outline.doc, breakfast);
    expect(insertPick(outline.doc, how(foods), breakfast, cup)!.doc.items[breakfast].collapsed).toBe(false);
  });
});

describe("ensureInsertLists", () => {
  it("makes _settings and Insert under the page, and finds them the next time", () => {
    const outline = new Outline();
    const page = outline.add(ROOT, "Food");
    const made = ensureInsertLists(outline.doc, page);
    outline.doc = made.doc;
    expect(outline.titles(page)).toEqual(["_settings"]);
    expect(made.doc.items[made.id].text).toBe("Insert");
    expect(ensureInsertLists(made.doc, page)).toEqual({ doc: made.doc, id: made.id });
  });
});
