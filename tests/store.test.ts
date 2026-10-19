import { afterEach, describe, expect, it, vi } from "vitest";
import { ROOT, setText } from "../src/model";
import { History } from "../src/store";
import { parseIndentedText } from "../src/transfer";

const start = parseIndentedText("a");
const a = start.items[ROOT].children[0];

afterEach(() => vi.useRealTimers());

describe("undo history", () => {
  it("treats a burst of typing in one item as one step", () => {
    vi.useFakeTimers();
    const history = new History(start);
    history.commit(setText(history.doc, a, "ab"), { id: a, offset: 1 }, a);
    vi.advanceTimersByTime(300);
    history.commit(setText(history.doc, a, "abc"), { id: a, offset: 2 }, a);
    expect(history.undo(null)).toEqual({ id: a, offset: 1 });
    expect(history.doc.items[a].text).toBe("a");
  });

  it("starts a new step after a pause in typing", () => {
    vi.useFakeTimers();
    const history = new History(start);
    history.commit(setText(history.doc, a, "ab"), { id: a, offset: 1 }, a);
    vi.advanceTimersByTime(2000);
    history.commit(setText(history.doc, a, "abc"), { id: a, offset: 2 }, a);
    history.undo(null);
    expect(history.doc.items[a].text).toBe("ab");
  });

  it("redoes what was undone, and a new change clears the redo stack", () => {
    const history = new History(start);
    history.commit(setText(history.doc, a, "x"), null);
    history.undo({ id: a, offset: 1 });
    expect(history.redo(null)).toEqual({ id: a, offset: 1 });
    expect(history.doc.items[a].text).toBe("x");
    history.undo(null);
    history.commit(setText(history.doc, a, "y"), null);
    expect(history.redo(null)).toBeUndefined();
  });

  it("reports nothing to undo at the start", () => {
    expect(new History(start).undo(null)).toBeUndefined();
  });

  it("ignores commits that change nothing", () => {
    const history = new History(start);
    history.commit(history.doc, null);
    expect(history.undo(null)).toBeUndefined();
  });

  it("joins a change into the newest step only while nothing came after the change it follows", () => {
    const history = new History(start);
    history.commit(setText(history.doc, a, "moved"), null);
    const afterMove = history.version;
    history.commitJoining(setText(history.doc, a, "moved, done"), afterMove);
    history.undo(null);
    expect(history.doc.items[a].text).toBe("a");

    history.commit(setText(history.doc, a, "moved"), null);
    const later = history.version;
    history.commit(setText(history.doc, a, "typed"), null);
    history.commitJoining(setText(history.doc, a, "typed, done"), later);
    history.undo(null);
    expect(history.doc.items[a].text).toBe("typed");
  });
});
