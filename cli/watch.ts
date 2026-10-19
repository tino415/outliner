import { Doc } from "../src/model";
import { OutlineEvent, eventsBetween } from "../src/events";
import { isSealed } from "../src/notes";
import { Endpoint, exchange } from "../src/sync/client";
import { Replica, materialize, merge } from "../src/sync/replica";

/*
 * `outline watch` (doc/adr/0039): asks the sync server for what is newer
 * every few seconds and prints what changed, in the shapes plugins get.
 * It starts from now; private items stay sealed to it and fire nothing.
 */

export interface Watching {
  print: (line: string) => void;
  signal?: AbortSignal;
  intervalMs: number;
  json: boolean;
}

export async function watch(endpoint: Endpoint, watching: Watching): Promise<void> {
  const replica: Replica = {};
  let { seq, changes } = await exchange(endpoint, { since: 0, changes: [] });
  merge(replica, changes);
  let doc = materialize(replica);
  while (!(await pause(watching.intervalMs, watching.signal))) {
    const newer = await exchange(endpoint, { since: seq, changes: [] });
    seq = Math.max(seq, newer.seq);
    if (newer.changes.length === 0) continue;
    merge(replica, newer.changes);
    const next = materialize(replica);
    for (const event of eventsBetween(doc, next).filter((each) => !isSealedIn(next, each))) watching.print(watching.json ? JSON.stringify(event) : describe(next, event));
    doc = next;
  }
}

function isSealedIn(doc: Doc, event: OutlineEvent): boolean {
  return isSealed(doc.items[event.id].note);
}

function describe(doc: Doc, event: OutlineEvent): string {
  const text = (id: string | null) => (id === null ? "" : (doc.items[id]?.text ?? id));
  const where = event.event === "moved" ? `  ${text(event.from)} → ${text(event.to)}` : event.event === "added" ? `  under ${text(event.to)}` : "";
  return `${event.event} ${event.id}  ${text(event.id)}${where}`;
}

/** Resolves true once `signal` aborts, false after `ms`. */
function pause(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stopped);
      resolve(false);
    }, ms);
    const stopped = () => {
      clearTimeout(timer);
      resolve(true);
    };
    signal?.addEventListener("abort", stopped, { once: true });
  });
}
