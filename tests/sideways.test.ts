import { describe, expect, it, vi } from "vitest";
import { Doc, ItemId, setCollapsed } from "../src/model";
import { parseIndentedText } from "../src/transfer";

vi.mock("../src/app", () => ({ state: {}, doc: () => ({}), ui: {} }));
vi.mock("../src/board", () => ({ showPageAs: () => {} }));
vi.mock("../src/render", () => ({ itemElementFor: () => null }));
vi.mock("../src/agenda", () => ({ agendaShown: () => false }));
vi.mock("../src/queryView", () => ({ queryViewShown: () => false }));

const { nodeAcross } = await import("../src/sideways");

function idOf(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

const shownIn = (doc: Doc, page: ItemId) => (id: ItemId) => (id === page || !doc.items[id].collapsed ? doc.items[id].children : []);

function across(doc: Doc, from: string, way: "up" | "down" | "left" | "right"): string | null {
  const page = idOf(doc, "Page");
  const found = nodeAcross(doc, page, idOf(doc, from), way, shownIn(doc, page));
  return found === null ? null : doc.items[found].text;
}

const outline = parseIndentedText("Page\n  a\n    a1\n    a2\n  b\n  c\n    c1\n      deep\n  d\n    d1");

describe("nodeAcross", () => {
  it("goes down from the last child of one branch to the first child of the next branch", () => {
    expect(across(outline, "a2", "down")).toBe("c1");
    expect(across(outline, "c1", "up")).toBe("a2");
  });

  it("passes over a branch that is folded or has no item at that level", () => {
    const folded = setCollapsed(outline, idOf(outline, "c"), true);
    expect(across(folded, "a2", "down")).toBe("d1");
    expect(across(folded, "d1", "up")).toBe("a2");
  });

  it("stays in a level, and stops at its ends", () => {
    expect(across(outline, "a", "down")).toBe("b");
    expect(across(outline, "d", "down")).toBeNull();
    expect(across(outline, "a1", "up")).toBeNull();
  });

  it("goes down from the page to its first node, and up from that node to the page", () => {
    expect(across(outline, "Page", "down")).toBe("a");
    expect(across(outline, "a", "up")).toBe("Page");
    expect(across(outline, "Page", "up")).toBeNull();
  });

  it("goes nowhere from a node that is not shown", () => {
    const folded = setCollapsed(outline, idOf(outline, "c"), true);
    expect(across(folded, "c1", "down")).toBeNull();
    expect(across(folded, "c1", "up")).toBeNull();
  });

  it("goes left to the parent, and from a top-level node to the page", () => {
    expect(across(outline, "deep", "left")).toBe("c1");
    expect(across(outline, "b", "left")).toBe("Page");
    expect(across(outline, "Page", "left")).toBeNull();
  });

  it("goes right to the first child, and from a folded node nowhere", () => {
    expect(across(outline, "Page", "right")).toBe("a");
    expect(across(outline, "c", "right")).toBe("c1");
    expect(across(outline, "b", "right")).toBeNull();
    expect(across(setCollapsed(outline, idOf(outline, "a"), true), "a", "right")).toBeNull();
  });
});
