import { Doc, ItemId } from "./model";

export interface Caret {
  id: ItemId;
  offset: number;
  inNote?: boolean;
}

interface Snapshot {
  doc: Doc;
  caret: Caret | null;
}

const HISTORY_LIMIT = 300;
const TYPING_PAUSE_MS = 1200;

/**
 * Holds the current document and its undo history. Typing into one item is
 * coalesced into a single undo step until the user pauses or moves elsewhere.
 */
export class History {
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private lastTypingKey: string | null = null;
  private lastTypingAt = 0;

  constructor(public doc: Doc) {}

  commit(next: Doc, caretBefore: Caret | null, typingKey: string | null = null): void {
    if (next === this.doc) return;
    const now = Date.now();
    const continuesTyping =
      typingKey !== null && typingKey === this.lastTypingKey && now - this.lastTypingAt < TYPING_PAUSE_MS;
    if (!continuesTyping) {
      this.past.push({ doc: this.doc, caret: caretBefore });
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.lastTypingKey = typingKey;
    this.lastTypingAt = now;
    this.future = [];
    this.doc = next;
  }

  replaceFromElsewhere(next: Doc): void {
    this.commit(next, null);
    this.lastTypingKey = null;
  }

  undo(caretNow: Caret | null): Caret | null | undefined {
    const previous = this.past.pop();
    if (!previous) return undefined;
    this.future.push({ doc: this.doc, caret: caretNow });
    this.doc = previous.doc;
    this.lastTypingKey = null;
    return previous.caret;
  }

  redo(caretNow: Caret | null): Caret | null | undefined {
    const next = this.future.pop();
    if (!next) return undefined;
    this.past.push({ doc: this.doc, caret: caretNow });
    this.doc = next.doc;
    this.lastTypingKey = null;
    return next.caret;
  }
}
