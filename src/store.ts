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
  version = 0;

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
    this.become(next);
  }

  /** Folds `next` into the newest undo step if the document is still at `version`; otherwise it is a step of its own. */
  commitJoining(next: Doc, version: number): void {
    if (next === this.doc) return;
    if (version !== this.version || this.past.length === 0) return this.commit(next, null);
    this.future = [];
    this.become(next);
  }

  replaceFromElsewhere(next: Doc): void {
    this.commit(next, null);
    this.lastTypingKey = null;
  }

  /** Starts over from `next` with no undo history, so an undo can never revert what another device wrote. */
  reset(next: Doc): void {
    this.past = [];
    this.future = [];
    this.lastTypingKey = null;
    this.become(next);
  }

  undo(caretNow: Caret | null): Caret | null | undefined {
    const previous = this.past.pop();
    if (!previous) return undefined;
    this.future.push({ doc: this.doc, caret: caretNow });
    this.become(previous.doc);
    this.lastTypingKey = null;
    return previous.caret;
  }

  redo(caretNow: Caret | null): Caret | null | undefined {
    const next = this.future.pop();
    if (!next) return undefined;
    this.past.push({ doc: this.doc, caret: caretNow });
    this.become(next.doc);
    this.lastTypingKey = null;
    return next.caret;
  }

  private become(next: Doc): void {
    this.doc = next;
    this.version++;
  }
}
