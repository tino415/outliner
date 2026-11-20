import { describe, expect, it } from "vitest";
import {
  BOOKMARKS,
  BOOKMARKS_ABOUT,
  CAPTURE_TEMPLATES,
  CAPTURE_TEMPLATES_ABOUT,
  Doc,
  ROOT,
  SETTINGS_ITEM,
  appendChild,
  buildDoc,
  contradictsKept,
  isReadOnly,
  keptNotice,
  moveDown,
  moveTo,
  moveUp,
  outdent,
  readOnlyNotice,
  remove,
  setCollapsed,
  setItemProperty,
  setText,
  split,
  withKeptParts,
  withPrivateIds,
  withSettingsItems,
  withoutKeptAbouts,
} from "../src/model";
import { captureTemplates } from "../src/capture";

function plainOutline(): { doc: Doc; garden: string } {
  let garden = "";
  const doc = buildDoc((root, append) => {
    garden = append(root, "Garden").id;
  });
  return { doc, garden };
}

function withBookmarksAtTopLevel(doc: Doc): Doc {
  const root = { ...doc.items[ROOT], children: [...doc.items[ROOT].children, BOOKMARKS] };
  const bookmarks = { ...doc.items[ROOT], id: BOOKMARKS, text: "Bookmarks", parent: ROOT, children: [], properties: { columns: "key" } };
  return { items: { ...doc.items, [ROOT]: root, [BOOKMARKS]: bookmarks } };
}

describe("Settings", () => {
  it("is made with Bookmarks first and Capture templates after it, each with its About", () => {
    const doc = withSettingsItems(plainOutline().doc);
    expect(doc.items[SETTINGS_ITEM]).toMatchObject({ text: "Settings", parent: ROOT, children: [BOOKMARKS, CAPTURE_TEMPLATES] });
    expect(doc.items[BOOKMARKS]).toMatchObject({ parent: SETTINGS_ITEM, children: [BOOKMARKS_ABOUT] });
    expect(doc.items[CAPTURE_TEMPLATES]).toMatchObject({ text: "Capture templates", parent: SETTINGS_ITEM, children: [CAPTURE_TEMPLATES_ABOUT] });
    expect(doc.items[CAPTURE_TEMPLATES].properties.columns).toBe("capture key");
    expect(doc.items[CAPTURE_TEMPLATES_ABOUT].text).toBe("About Capture templates");
    expect(withSettingsItems(doc)).toBe(doc);
  });

  it("takes Bookmarks from the top level once, where Bookmarks stood", () => {
    const old = withBookmarksAtTopLevel(plainOutline().doc);
    const doc = withSettingsItems(old);
    expect(doc.items[ROOT].children).toEqual([expect.any(String), SETTINGS_ITEM]);
    expect(doc.items[SETTINGS_ITEM].children).toEqual([BOOKMARKS, CAPTURE_TEMPLATES]);
    expect(doc.items[BOOKMARKS].parent).toBe(SETTINGS_ITEM);
    expect(doc.items[BOOKMARKS].properties.columns).toBe("key");
  });

  it("has no About of its own, and is put back when renamed or completed", () => {
    const doc = withSettingsItems(plainOutline().doc);
    expect(doc.items[SETTINGS_ITEM].children.filter((id) => id.startsWith("about-"))).toEqual([]);
    const renamed = { items: { ...doc.items, [SETTINGS_ITEM]: { ...doc.items[SETTINGS_ITEM], text: "Prefs", completed: true } } };
    expect(withKeptParts(renamed).items[SETTINGS_ITEM]).toMatchObject({ text: "Settings", completed: false });
  });

  it("keeps Bookmarks first and Capture templates second whatever is done to the order", () => {
    const doc = withSettingsItems(plainOutline().doc);
    const added = appendChild(doc, SETTINGS_ITEM, "Mine");
    const reordered = { items: { ...added.doc.items, [SETTINGS_ITEM]: { ...added.doc.items[SETTINGS_ITEM], children: [added.id, CAPTURE_TEMPLATES, BOOKMARKS] } } };
    expect(withKeptParts(reordered).items[SETTINGS_ITEM].children).toEqual([BOOKMARKS, CAPTURE_TEMPLATES, added.id]);
  });

  it("may be folded and moved among the top items", () => {
    const { doc, garden } = (() => {
      const plain = plainOutline();
      return { doc: withSettingsItems(plain.doc), garden: plain.garden };
    })();
    const folded = setCollapsed(doc, SETTINGS_ITEM, true);
    expect(folded.items[SETTINGS_ITEM].collapsed).toBe(true);
    expect(withKeptParts(folded)).toBe(folded);
    expect(moveTo(doc, SETTINGS_ITEM, ROOT, 0).items[ROOT].children).toEqual([SETTINGS_ITEM, garden]);
  });
});

describe("Capture templates", () => {
  it("is refused deletion and leaving Settings", () => {
    const doc = withSettingsItems(plainOutline().doc);
    expect(remove(doc, CAPTURE_TEMPLATES)).toBe(doc);
    expect(moveTo(doc, CAPTURE_TEMPLATES, ROOT, 0)).toBe(doc);
    expect(outdent(doc, CAPTURE_TEMPLATES, ROOT)).toBe(doc);
    expect(keptNotice(CAPTURE_TEMPLATES)).toBe("Capture templates stays; empty it instead");
  });

  it("has a title, note and completion that code holds, and a sync write that differs is dropped", () => {
    expect(isReadOnly(CAPTURE_TEMPLATES, "title")).toBe(true);
    expect(isReadOnly(CAPTURE_TEMPLATES, "children")).toBe(false);
    expect(contradictsKept(CAPTURE_TEMPLATES, "text", "Templates")).toBe(true);
    expect(contradictsKept(SETTINGS_ITEM, "text", "Settings")).toBe(false);
    expect(contradictsKept(SETTINGS_ITEM, "completed", true)).toBe(true);
  });

  it("holds a read-only About that is never saved or synced", () => {
    const doc = withSettingsItems(plainOutline().doc);
    const nested = `${CAPTURE_TEMPLATES_ABOUT}-2-1`;
    expect(isReadOnly(nested, "title")).toBe(true);
    expect(readOnlyNotice(nested)).toBe("About Capture templates is read-only");
    expect(doc.items[CAPTURE_TEMPLATES_ABOUT].collapsed).toBe(true);
    expect(doc.items[nested].text).toMatch(/^capture: where items go/);
    const saved = withoutKeptAbouts(doc);
    expect(saved.items[CAPTURE_TEMPLATES_ABOUT]).toBeUndefined();
    expect(saved.items[CAPTURE_TEMPLATES].children).toEqual([]);
    expect(saved.items[BOOKMARKS_ABOUT]).toBeUndefined();
    expect(withSettingsItems(saved).items[nested]).toBeDefined();
  });

  it("shows a template under it and one elsewhere in the Capture dialog", () => {
    const base = withSettingsItems(plainOutline().doc);
    const home = appendChild(base, CAPTURE_TEMPLATES, "Meal");
    const elsewhere = appendChild(setText(home.doc, home.id, "Meal"), ROOT, "Walk");
    const marked = setItemProperty(setItemProperty(elsewhere.doc, home.id, "capture", "Food/{date}"), elsewhere.id, "capture", "Walks");
    expect(captureTemplates(marked).map((template) => template.name)).toEqual(["Meal", "Walk"]);
  });
});

describe("what is done to the kept items", () => {
  const filter = { showCompleted: true };

  it("leaves their ids alone when Settings is made private", () => {
    const doc = setItemProperty(withSettingsItems(plainOutline().doc), SETTINGS_ITEM, "private", "personal");
    expect(withPrivateIds(doc).renamed.size).toBe(0);
  });

  it("lets Enter at the end of About Capture templates open the first template", () => {
    const doc = withSettingsItems(plainOutline().doc);
    const result = split(doc, CAPTURE_TEMPLATES_ABOUT, "About Capture templates".length, filter);
    expect(result.doc.items[CAPTURE_TEMPLATES].children).toEqual([CAPTURE_TEMPLATES_ABOUT, result.id]);
  });

  it("refuses to move a kept heading past another or an item above it", () => {
    const base = withSettingsItems(plainOutline().doc);
    const added = appendChild(base, SETTINGS_ITEM, "Mine");
    expect(moveUp(added.doc, CAPTURE_TEMPLATES, filter)).toBe(added.doc);
    expect(moveDown(added.doc, BOOKMARKS, filter)).toBe(added.doc);
    expect(moveUp(added.doc, added.id, filter)).toBe(added.doc);
  });
});
