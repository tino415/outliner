import { describe, expect, it } from "vitest";
import { Doc, ItemId, ROOT, appendChild, remove, setItemProperty, setText, setCollapsed, toggleCompleted } from "../src/model";
import { exportMarkdown, parseIndentedText } from "../src/transfer";
import { isMirror, liveMirrorTarget, mirrorBulletTitle, mirrorHere, mirrorTargetOf, mirrorTextHtml, mirroredChildrenHtml } from "../src/mirrors";

function idOf(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

const all = { showCompleted: true };

describe("mirrors", () => {
  const outline = parseIndentedText("Projects\n  Garden\n    Tomatoes\n    Beans\nToday");
  const base = appendChild(outline, idOf(outline, "Today")).doc;

  it("are made from a blank item, which keeps its place", () => {
    const blank = base.items[idOf(base, "Today")].children[0];
    const made = mirrorHere(base, blank, idOf(base, "Garden"));
    expect(made.id).toBe(blank);
    expect(made.doc.items[blank].properties).toEqual({ mirror: idOf(base, "Garden") });
    expect(made.doc.items[blank].text).toBe("");
  });

  it("go below an item that has text, as its next sibling", () => {
    const tomatoes = idOf(base, "Tomatoes");
    const made = mirrorHere(base, tomatoes, idOf(base, "Today"));
    const garden = made.doc.items[idOf(base, "Garden")];
    expect(garden.children).toEqual([tomatoes, made.id, idOf(base, "Beans")]);
    expect(mirrorTargetOf(made.doc, made.id)).toBe(idOf(base, "Today"));
    expect(made.doc.items[tomatoes].properties).toEqual({});
  });

  it("show the target's text and children, live", () => {
    const blank = base.items[idOf(base, "Today")].children[0];
    let doc = mirrorHere(base, blank, idOf(base, "Garden")).doc;
    expect(mirrorTextHtml(doc, blank)).toContain(">Garden</div>");
    expect(mirroredChildrenHtml(doc, blank, all)).toMatch(/Tomatoes.*Beans/);
    doc = setText(doc, idOf(doc, "Beans"), "Peas #green");
    expect(mirroredChildrenHtml(doc, blank, all)).toContain(`Peas <span class="tag"`);
    expect(mirrorBulletTitle(doc, blank)).toBe("Mirror of Projects / Garden · click to go there");
  });

  it("leave out what the target hides: folded children, and completed ones when those are hidden", () => {
    const blank = base.items[idOf(base, "Today")].children[0];
    const doc = toggleCompleted(mirrorHere(base, blank, idOf(base, "Garden")).doc, idOf(base, "Beans"));
    expect(mirroredChildrenHtml(doc, blank, { showCompleted: false })).not.toContain("Beans");
    expect(mirroredChildrenHtml(setCollapsed(doc, idOf(doc, "Garden"), true), blank, all)).toBe("");
  });

  it("of a deleted item show as gone; deleting a mirror leaves the target", () => {
    const blank = base.items[idOf(base, "Today")].children[0];
    const doc = mirrorHere(base, blank, idOf(base, "Garden")).doc;
    const targetGone = remove(doc, idOf(doc, "Garden"));
    expect(isMirror(targetGone, blank)).toBe(true);
    expect(liveMirrorTarget(targetGone, blank)).toBeNull();
    expect(mirrorTextHtml(targetGone, blank)).toMatch(/class="text mirror-text gone".*>gone<\/div>$/);
    expect(mirroredChildrenHtml(targetGone, blank, all)).toBe("");
    expect(remove(doc, blank).items[idOf(doc, "Garden")].children).toHaveLength(2);
  });

  it("of an item above themselves end at the mirror inside the copy", () => {
    const blank = base.items[idOf(base, "Today")].children[0];
    const doc = mirrorHere(base, blank, idOf(base, "Today")).doc;
    const html = mirroredChildrenHtml(doc, blank, all);
    expect(html.match(/mirror-child"/g)).toHaveLength(1);
    expect(html).toContain("hollow");
  });

  it("are an ordinary item with a property in exported text", () => {
    const blank = base.items[idOf(base, "Today")].children[0];
    const doc = setItemProperty(base, blank, "mirror", idOf(base, "Garden"));
    expect(exportMarkdown(doc, ROOT)).toContain(`:mirror: ${idOf(base, "Garden")}`);
  });
});
