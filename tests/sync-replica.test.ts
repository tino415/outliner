import { describe, expect, it } from "vitest";
import {
  Doc,
  ItemId,
  ROOT,
  emptyDoc,
  indent,
  insertChild,
  moveDown,
  moveTo,
  moveUp,
  outdent,
  remove,
  setFlags,
  setText,
  split,
} from "../src/model";
import { parseIndentedText } from "../src/transfer";
import { Clock } from "../src/sync/clock";
import { Change, Replica, diff, materialize, merge } from "../src/sync/replica";
import { seeded } from "./random";

const all = { showCompleted: true };

/** The outline as indented text with flags, which is what two replicas must agree on. */
function shape(doc: Doc, id: ItemId = ROOT, depth = 0): string {
  const item = doc.items[id];
  const line = `${"  ".repeat(depth)}${item.text}${item.completed ? " [x]" : ""}${item.collapsed ? " [-]" : ""}${item.note ? ` (${item.note})` : ""}`;
  return [line, ...item.children.map((child) => shape(doc, child, depth + 1))].join("\n");
}

function consistent(doc: Doc): void {
  for (const item of Object.values(doc.items)) {
    for (const child of item.children) expect(doc.items[child].parent).toBe(item.id);
    if (item.parent) expect(doc.items[item.parent].children).toContain(item.id);
  }
}

class Device {
  replica: Replica = {};
  outbox: Change[] = [];
  doc: Doc;

  constructor(
    readonly clock: Clock,
    shared: Change[],
  ) {
    merge(this.replica, shared);
    this.doc = materialize(this.replica);
  }

  edit(change: (doc: Doc) => Doc): void {
    const next = change(this.doc);
    const changes = diff(this.doc, next, this.replica, () => this.clock.tick());
    merge(this.replica, changes);
    this.outbox.push(...changes);
    expect(shape(materialize(this.replica))).toBe(shape(next));
    this.doc = next;
  }

  receive(changes: Change[]): void {
    for (const change of changes) this.clock.observe(change.clock);
    merge(this.replica, changes);
    this.doc = materialize(this.replica, this.doc);
  }
}

function seedChanges(text: string): Change[] {
  const clock = new Clock("seed", () => 1);
  return diff(emptyDoc(), parseIndentedText(text), {}, () => clock.tick());
}

describe("round trip", () => {
  it("rebuilds the document its changes describe", () => {
    const text = "a\n  a1\n  a2\nb\n  b1\n    b2";
    const replica: Replica = {};
    merge(replica, seedChanges(text));
    expect(shape(materialize(replica))).toBe(shape(parseIndentedText(text)));
  });

  it("sends nothing for a document that did not change", () => {
    const device = new Device(new Clock("a"), seedChanges("a\nb"));
    device.edit((doc) => doc);
    expect(device.outbox).toEqual([]);
  });

  it("reuses unchanged items when rebuilding", () => {
    const device = new Device(new Clock("a"), seedChanges("a\nb"));
    const before = device.doc;
    const a = before.items[ROOT].children[0];
    device.receive([{ item: before.items[ROOT].children[1], field: "text", value: "B", clock: "zzzzzzzzzzz-00000-x" }]);
    expect(device.doc.items[a]).toBe(before.items[a]);
  });
});

describe("concurrent edits", () => {
  it("keeps edits to different items from both devices", () => {
    const shared = seedChanges("a\nb");
    const one = new Device(new Clock("one"), shared);
    const two = new Device(new Clock("two"), shared);
    const [a, b] = one.doc.items[ROOT].children;
    one.edit((doc) => setText(doc, a, "a from one"));
    two.edit((doc) => setText(doc, b, "b from two"));
    two.edit((doc) => insertChild(doc, ROOT, 2, "c from two").doc);
    one.receive(two.outbox);
    two.receive(one.outbox);
    expect(shape(one.doc)).toBe(shape(two.doc));
    expect(shape(one.doc)).toBe("\n  a from one\n  b from two\n  c from two");
  });

  it("lets the later edit of the same text win on both devices", () => {
    const shared = seedChanges("a");
    let now = 1000;
    const one = new Device(new Clock("one", () => now), shared);
    const two = new Device(new Clock("two", () => now), shared);
    const a = one.doc.items[ROOT].children[0];
    one.edit((doc) => setText(doc, a, "first"));
    now = 2000;
    two.edit((doc) => setText(doc, a, "second"));
    one.receive(two.outbox);
    two.receive(one.outbox);
    expect(one.doc.items[a].text).toBe("second");
    expect(two.doc.items[a].text).toBe("second");
  });

  it("breaks a cycle from crossing moves the same way on both devices", () => {
    const shared = seedChanges("a\nb");
    const one = new Device(new Clock("one"), shared);
    const two = new Device(new Clock("two"), shared);
    const [a, b] = one.doc.items[ROOT].children;
    one.edit((doc) => moveTo(doc, a, b, 0));
    two.edit((doc) => moveTo(doc, b, a, 0));
    one.receive(two.outbox);
    two.receive(one.outbox);
    expect(shape(one.doc)).toBe(shape(two.doc));
    expect(Object.keys(one.doc.items)).toHaveLength(3);
    consistent(one.doc);
  });

  it("hides items added under something deleted elsewhere", () => {
    const shared = seedChanges("a\nb");
    const one = new Device(new Clock("one"), shared);
    const two = new Device(new Clock("two"), shared);
    const a = one.doc.items[ROOT].children[0];
    one.edit((doc) => remove(doc, a));
    two.edit((doc) => insertChild(doc, a, 0, "child of a").doc);
    one.receive(two.outbox);
    two.receive(one.outbox);
    expect(shape(one.doc)).toBe(shape(two.doc));
    expect(shape(one.doc)).toBe("\n  b");
  });

  it("converges after random concurrent edits on three devices", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = seeded(seed);
      const shared = seedChanges("a\n  a1\n  a2\nb\n  b1\nc\nd");
      const devices = ["one", "two", "three"].map((name) => new Device(new Clock(name), shared));
      for (let round = 0; round < 3; round++) {
        for (const device of devices) {
          for (let step = 0; step < 6; step++) device.edit((doc) => randomEdit(doc, random));
        }
        for (const device of devices) {
          for (const other of devices) if (other !== device) other.receive(device.outbox);
        }
        for (const device of devices) device.outbox = [];
        const shapes = devices.map((device) => shape(device.doc));
        expect(shapes[1], `seed ${seed} round ${round}`).toBe(shapes[0]);
        expect(shapes[2], `seed ${seed} round ${round}`).toBe(shapes[0]);
        devices.forEach((device) => consistent(device.doc));
      }
    }
  });
});

function randomEdit(doc: Doc, random: () => number): Doc {
  const ids = Object.keys(doc.items).filter((id) => id !== ROOT);
  const pick = () => ids[Math.floor(random() * ids.length)];
  if (ids.length === 0) return insertChild(doc, ROOT, 0, "fresh").doc;
  const id = pick();
  switch (Math.floor(random() * 9)) {
    case 0:
      return setText(doc, id, `${doc.items[id].text}+`);
    case 1:
      return indent(doc, id, all);
    case 2:
      return outdent(doc, id, ROOT);
    case 3:
      return moveUp(doc, id, all);
    case 4:
      return moveDown(doc, id, all);
    case 5:
      return split(doc, id, Math.floor(random() * (doc.items[id].text.length + 1)), all).doc;
    case 6:
      return ids.length > 3 ? remove(doc, id) : doc;
    case 7:
      return setFlags(doc, id, { completed: !doc.items[id].completed, collapsed: random() < 0.3 });
    default:
      return moveTo(doc, id, pick(), 0);
  }
}
