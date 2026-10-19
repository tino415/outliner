import { describe, expect, it } from "vitest";
import { Doc, ItemId, duplicate, moveTo, remove, setItemProperty, setText, toggleCompleted } from "../src/model";
import { parseIndentedText } from "../src/transfer";
import { eventsBetween } from "../src/events";

const board = parseIndentedText("Board\n  Doing\n    card\n      step\n  Done\n    old");

function id(doc: Doc, text: string): ItemId {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

describe("outline events", () => {
  it("names a move with the old and the new parent, and nothing for what moved along", () => {
    const moved = moveTo(board, id(board, "card"), id(board, "Done"), 0);
    expect(eventsBetween(board, moved)).toEqual([{ event: "moved", id: id(board, "card"), from: id(board, "Doing"), to: id(board, "Done") }]);
  });

  it("names an added item with its parent, once for a whole subtree", () => {
    const copied = duplicate(board, id(board, "card"));
    expect(eventsBetween(board, copied.doc)).toEqual([{ event: "added", id: copied.id, from: null, to: id(board, "Doing") }]);
  });

  it("names completing and reopening, and changes of text or properties", () => {
    const card = id(board, "card");
    expect(eventsBetween(board, toggleCompleted(board, card))).toEqual([{ event: "completed", id: card, from: null, to: null }]);
    expect(eventsBetween(board, setText(board, card, "card 2"))).toEqual([{ event: "changed", id: card, from: null, to: null }]);
    expect(eventsBetween(board, setItemProperty(board, card, "effort", "1h"))).toEqual([{ event: "changed", id: card, from: null, to: null }]);
  });

  it("says nothing of a reorder within one parent or a removal", () => {
    const step = id(board, "step");
    expect(eventsBetween(board, remove(board, step))).toEqual([]);
    expect(eventsBetween(board, moveTo(board, id(board, "Done"), id(board, "Board"), 0))).toEqual([]);
  });
});
