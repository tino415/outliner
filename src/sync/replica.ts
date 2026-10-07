import { Doc, Item, ItemId, ROOT } from "../model";
import { positionBetween } from "./position";

export type Field = "text" | "note" | "parent" | "position" | "collapsed" | "completed" | "deleted";
export type FieldValue = string | boolean | null;

export interface Change {
  item: ItemId;
  field: Field;
  value: FieldValue;
  clock: string;
}

interface Written {
  value: FieldValue;
  clock: string;
}

/** Every field of every item ever seen, each with the clock of the change that last wrote it. */
export type Replica = Record<ItemId, Partial<Record<Field, Written>>>;

/** Applies changes whose clocks beat what the replica has; returns the ones that won. */
export function merge(replica: Replica, changes: Change[]): Change[] {
  const accepted: Change[] = [];
  for (const change of changes) {
    const fields = (replica[change.item] ??= {});
    const current = fields[change.field];
    if (current && current.clock >= change.clock) continue;
    fields[change.field] = { value: change.value, clock: change.clock };
    accepted.push(change);
  }
  return accepted;
}

export function allChanges(replica: Replica): Change[] {
  return Object.entries(replica).flatMap(([item, fields]) =>
    Object.entries(fields).map(([field, written]) => ({ item, field: field as Field, ...written! })),
  );
}

// ---- from documents to changes ----------------------------------------------------

/**
 * The field changes that turn `before` into `after`, stamped by `stamp`. Only
 * items whose object changed are compared, and only against what the
 * replica holds, so a change that is already known is not sent again.
 */
export function diff(before: Doc, after: Doc, replica: Replica, stamp: () => string): Change[] {
  const changes: Change[] = [];
  const write = (item: ItemId, field: Field, value: FieldValue) => {
    if (read(replica, item, field) !== value) changes.push({ item, field, value, clock: stamp() });
  };

  for (const [id, item] of Object.entries(after.items)) {
    if (before.items[id] === item) continue;
    write(id, "text", item.text);
    write(id, "note", item.note);
    write(id, "collapsed", item.collapsed);
    write(id, "completed", item.completed);
    if (id === ROOT) continue;
    write(id, "deleted", false);
    write(id, "parent", item.parent);
  }
  for (const id of Object.keys(before.items)) {
    if (!after.items[id]) write(id, "deleted", true);
  }

  for (const [id, item] of Object.entries(after.items)) {
    if (before.items[id]?.children === item.children) continue;
    const moved = new Set(item.children.filter((child) => before.items[child]?.parent !== id));
    changes.push(...reposition(item.children, moved, replica, stamp));
  }
  return changes;
}

/**
 * Gives positions to children whose order is new: items that arrived in this
 * parent, and any item whose old position no longer sorts after the one
 * before it. Items already in order keep their position.
 */
function reposition(children: ItemId[], moved: Set<ItemId>, replica: Replica, stamp: () => string): Change[] {
  const changes: Change[] = [];
  const kept = (id: ItemId, after: string | null) => {
    const position = read(replica, id, "position") as string | undefined;
    return !moved.has(id) && position !== undefined && (after === null || position > after) ? position : null;
  };
  let last: string | null = null;
  children.forEach((id, index) => {
    const position = kept(id, last);
    if (position !== null) {
      last = position;
      return;
    }
    const next = children.slice(index + 1).map((later) => kept(later, last)).find((found) => found !== null) ?? null;
    last = positionBetween(last, next);
    changes.push({ item: id, field: "position", value: last, clock: stamp() });
  });
  return changes;
}

function read(replica: Replica, item: ItemId, field: Field): FieldValue | undefined {
  return replica[item]?.[field]?.value;
}

// ---- from a replica to a document ---------------------------------------------------

/**
 * The outline a replica describes. Deterministic, so every replica holding
 * the same fields shows the same tree. Items under a deleted or unknown
 * parent are left out. Items that crossing moves left in a cycle are put
 * under the root: the cycle member whose parent was changed last moves.
 * Items equal to ones in `previous` are reused, which keeps row reuse working.
 */
export function materialize(replica: Replica, previous?: Doc): Doc {
  const parents = effectiveParents(replica);
  const childrenOf = new Map<ItemId, ItemId[]>();
  for (const [id, parent] of parents) {
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(id);
  }
  const position = (id: ItemId) => (read(replica, id, "position") as string | undefined) ?? "";
  for (const children of childrenOf.values()) {
    children.sort((a, b) => (position(a) < position(b) ? -1 : position(a) > position(b) ? 1 : a < b ? -1 : 1));
  }

  const items: Record<ItemId, Item> = {};
  const visit = (id: ItemId, parent: ItemId | null) => {
    const children = childrenOf.get(id) ?? [];
    items[id] = reuse(previous?.items[id], {
      id,
      text: (read(replica, id, "text") as string) ?? "",
      note: (read(replica, id, "note") as string) ?? "",
      parent,
      children,
      collapsed: read(replica, id, "collapsed") === true,
      completed: read(replica, id, "completed") === true,
      updated: 0,
    });
    for (const child of children) visit(child, id);
  };
  visit(ROOT, null);
  return { items };
}

/** Parent of every live item, after cycles from crossing moves are broken. */
function effectiveParents(replica: Replica): Map<ItemId, ItemId> {
  const parents = new Map<ItemId, ItemId>();
  for (const id of Object.keys(replica)) {
    const parent = read(replica, id, "parent");
    if (id !== ROOT && read(replica, id, "deleted") !== true && typeof parent === "string") parents.set(id, parent);
  }
  for (const id of parents.keys()) {
    const cycle = cycleThrough(id, parents);
    if (!cycle) continue;
    const latest = cycle.reduce((a, b) => ((replica[a].parent!.clock > replica[b].parent!.clock ? a : b)));
    parents.set(latest, ROOT);
  }
  return parents;
}

function cycleThrough(start: ItemId, parents: Map<ItemId, ItemId>): ItemId[] | null {
  const path: ItemId[] = [];
  for (let current: ItemId | undefined = start; current !== undefined && current !== ROOT; current = parents.get(current)) {
    const seen = path.indexOf(current);
    if (seen !== -1) return path.slice(seen);
    path.push(current);
  }
  return null;
}

function reuse(previous: Item | undefined, next: Item): Item {
  if (!previous) return next;
  const same =
    previous.text === next.text &&
    previous.note === next.note &&
    previous.parent === next.parent &&
    previous.collapsed === next.collapsed &&
    previous.completed === next.completed &&
    previous.children.length === next.children.length &&
    previous.children.every((child, i) => child === next.children[i]);
  return same ? previous : next;
}
