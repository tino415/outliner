export type ItemId = string;

export interface Item {
  id: ItemId;
  text: string;
  note: string;
  parent: ItemId | null;
  children: ItemId[];
  collapsed: boolean;
  completed: boolean;
  updated: number;
}

export interface Doc {
  items: Readonly<Record<ItemId, Item>>;
}

export const ROOT: ItemId = "root";

export interface ViewFilter {
  showCompleted: boolean;
}

function newId(): ItemId {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyDoc(): Doc {
  return { items: { [ROOT]: blankItem(ROOT, null) } };
}

function blankItem(id: ItemId, parent: ItemId | null, text = ""): Item {
  return { id, text, note: "", parent, children: [], collapsed: false, completed: false, updated: Date.now() };
}

/**
 * Copy-on-write view of a document: items are cloned the first time they are
 * written, so untouched items stay shared with the previous snapshot.
 */
class Draft {
  private items: Record<ItemId, Item>;
  private cloned = new Set<ItemId>();

  constructor(doc: Doc) {
    this.items = { ...doc.items };
  }

  read(id: ItemId): Item {
    const item = this.items[id];
    if (!item) throw new Error(`no item ${id}`);
    return item;
  }

  write(id: ItemId): Item {
    if (!this.cloned.has(id)) {
      const item = this.read(id);
      this.items[id] = { ...item, children: [...item.children], updated: Date.now() };
      this.cloned.add(id);
    }
    return this.items[id];
  }

  create(parent: ItemId, index: number, text = ""): Item {
    const item = blankItem(newId(), parent, text);
    this.items[item.id] = item;
    this.cloned.add(item.id);
    this.write(parent).children.splice(index, 0, item.id);
    return item;
  }

  detach(id: ItemId): void {
    const parent = this.read(id).parent!;
    const siblings = this.write(parent).children;
    siblings.splice(siblings.indexOf(id), 1);
  }

  attach(id: ItemId, parent: ItemId, index: number): void {
    this.write(parent).children.splice(index, 0, id);
    this.write(id).parent = parent;
  }

  removeSubtree(id: ItemId): void {
    for (const child of this.read(id).children) this.removeSubtree(child);
    this.forget(id);
  }

  forget(id: ItemId): void {
    delete this.items[id];
  }

  done(): Doc {
    return { items: this.items };
  }
}

function edit(doc: Doc, change: (draft: Draft) => void): Doc {
  const draft = new Draft(doc);
  change(draft);
  return draft.done();
}

export function indexInParent(doc: Doc, id: ItemId): number {
  const parent = doc.items[id].parent;
  return parent ? doc.items[parent].children.indexOf(id) : 0;
}

function previousShownSibling(doc: Doc, id: ItemId, filter: ViewFilter): ItemId | null {
  const siblings = doc.items[doc.items[id].parent!].children;
  const before = siblings.slice(0, siblings.indexOf(id)).reverse();
  return before.find((sibling) => isShown(doc, sibling, filter)) ?? null;
}

function nextShownSibling(doc: Doc, id: ItemId, filter: ViewFilter): ItemId | null {
  const siblings = doc.items[doc.items[id].parent!].children;
  const after = siblings.slice(siblings.indexOf(id) + 1);
  return after.find((sibling) => isShown(doc, sibling, filter)) ?? null;
}

export function isBlank(item: Item): boolean {
  return item.text === "" && item.note === "" && item.children.length === 0;
}

export function ancestors(doc: Doc, id: ItemId): ItemId[] {
  const chain: ItemId[] = [];
  for (let current = doc.items[id]?.parent ?? null; current; current = doc.items[current].parent) chain.push(current);
  return chain.reverse();
}

export function isDescendant(doc: Doc, id: ItemId, ancestor: ItemId): boolean {
  return ancestors(doc, id).includes(ancestor);
}

export function isShown(doc: Doc, id: ItemId, filter: ViewFilter): boolean {
  return filter.showCompleted || !doc.items[id].completed;
}

export function shownChildren(doc: Doc, id: ItemId, filter: ViewFilter): ItemId[] {
  return doc.items[id].children.filter((child) => isShown(doc, child, filter));
}

export function isExpanded(doc: Doc, id: ItemId, filter: ViewFilter): boolean {
  return !doc.items[id].collapsed && shownChildren(doc, id, filter).length > 0;
}

/** Items in reading order under `top`, skipping collapsed subtrees. */
export function visibleOrder(doc: Doc, top: ItemId, filter: ViewFilter): ItemId[] {
  const order: ItemId[] = [];
  const walk = (id: ItemId) => {
    for (const child of shownChildren(doc, id, filter)) {
      order.push(child);
      if (!doc.items[child].collapsed) walk(child);
    }
  };
  walk(top);
  return order;
}

export function setText(doc: Doc, id: ItemId, text: string): Doc {
  if (doc.items[id].text === text) return doc;
  return edit(doc, (d) => {
    d.write(id).text = text;
  });
}

export function setNote(doc: Doc, id: ItemId, note: string): Doc {
  if (doc.items[id].note === note) return doc;
  return edit(doc, (d) => {
    d.write(id).note = note;
  });
}

export function setCollapsed(doc: Doc, id: ItemId, collapsed: boolean): Doc {
  if (doc.items[id].collapsed === collapsed) return doc;
  return edit(doc, (d) => {
    d.write(id).collapsed = collapsed;
  });
}

export function setCollapsedEverywhere(doc: Doc, top: ItemId, collapsed: boolean): Doc {
  return edit(doc, (d) => {
    const walk = (id: ItemId) => {
      for (const child of d.read(id).children) {
        if (d.read(child).children.length > 0 && d.read(child).collapsed !== collapsed) {
          d.write(child).collapsed = collapsed;
        }
        walk(child);
      }
    };
    walk(top);
  });
}

export function toggleCompleted(doc: Doc, id: ItemId): Doc {
  return edit(doc, (d) => {
    const item = d.write(id);
    item.completed = !item.completed;
  });
}

export function appendChild(doc: Doc, parent: ItemId, text = ""): { doc: Doc; id: ItemId } {
  return insertChild(doc, parent, doc.items[parent].children.length, text);
}

export function setFlags(doc: Doc, id: ItemId, flags: Partial<Pick<Item, "collapsed" | "completed" | "note">>): Doc {
  return edit(doc, (d) => {
    Object.assign(d.write(id), flags);
  });
}

export function insertChild(doc: Doc, parent: ItemId, index: number, text = ""): { doc: Doc; id: ItemId } {
  let id = "";
  const next = edit(doc, (d) => {
    d.write(parent).collapsed = false;
    id = d.create(parent, index, text).id;
  });
  return { doc: next, id };
}

/**
 * Enter inside an item. The text after the caret moves to a new item, which
 * becomes the first child when the item's children are on screen, otherwise
 * the next sibling. Enter at the very start of a non-empty item opens a blank
 * item above instead, so the text being typed keeps its identity.
 */
export function split(
  doc: Doc,
  id: ItemId,
  offset: number,
  filter: ViewFilter,
): { doc: Doc; id: ItemId; focus: ItemId } {
  const item = doc.items[id];
  const parent = item.parent!;
  const index = indexInParent(doc, id);

  if (offset === 0 && item.text.length > 0) {
    let created = "";
    const next = edit(doc, (d) => {
      created = d.create(parent, index).id;
    });
    return { doc: next, id: created, focus: id };
  }

  const head = item.text.slice(0, offset);
  const tail = item.text.slice(offset);
  let created = "";
  const next = edit(doc, (d) => {
    d.write(id).text = head;
    created = isExpanded(doc, id, filter)
      ? d.create(id, 0, tail).id
      : d.create(parent, index + 1, tail).id;
  });
  return { doc: next, id: created, focus: created };
}

export function indent(doc: Doc, id: ItemId, filter: ViewFilter): Doc {
  const newParent = previousShownSibling(doc, id, filter);
  if (!newParent) return doc;
  return edit(doc, (d) => {
    d.detach(id);
    d.write(newParent).collapsed = false;
    d.attach(id, newParent, d.read(newParent).children.length);
  });
}

export function outdent(doc: Doc, id: ItemId, top: ItemId): Doc {
  const parent = doc.items[id].parent!;
  if (parent === top) return doc;
  const grandparent = doc.items[parent].parent!;
  return edit(doc, (d) => {
    d.detach(id);
    d.attach(id, grandparent, d.read(grandparent).children.indexOf(parent) + 1);
  });
}

export function moveUp(doc: Doc, id: ItemId, filter: ViewFilter): Doc {
  const target = previousShownSibling(doc, id, filter);
  if (!target) return doc;
  return moveTo(doc, id, doc.items[id].parent!, indexInParent(doc, target));
}

export function moveDown(doc: Doc, id: ItemId, filter: ViewFilter): Doc {
  const target = nextShownSibling(doc, id, filter);
  if (!target) return doc;
  return moveTo(doc, id, doc.items[id].parent!, indexInParent(doc, target) + 1);
}

/** Move `id` so it sits at `index` among `parent`'s current children. */
export function moveTo(doc: Doc, id: ItemId, parent: ItemId, index: number): Doc {
  if (id === parent || isDescendant(doc, parent, id)) return doc;
  return edit(doc, (d) => {
    const oldParent = d.read(id).parent!;
    const oldIndex = d.read(oldParent).children.indexOf(id);
    const adjusted = oldParent === parent && oldIndex < index ? index - 1 : index;
    d.detach(id);
    d.attach(id, parent, adjusted);
  });
}

export function duplicate(doc: Doc, id: ItemId): { doc: Doc; id: ItemId } {
  let copyId = "";
  const next = edit(doc, (d) => {
    const copy = (sourceId: ItemId, parent: ItemId, index: number): ItemId => {
      const source = d.read(sourceId);
      const created = d.create(parent, index, source.text);
      Object.assign(created, { note: source.note, completed: source.completed, collapsed: source.collapsed });
      source.children.forEach((child, i) => copy(child, created.id, i));
      return created.id;
    };
    const original = d.read(id);
    copyId = copy(id, original.parent!, d.read(original.parent!).children.indexOf(id) + 1);
  });
  return { doc: next, id: copyId };
}

/** Copies every top-level item of `source`, with its subtree, into a new item at the end of `doc`. */
export function appendOutline(doc: Doc, source: Doc, title: string): { doc: Doc; id: ItemId } {
  let id = "";
  const next = edit(doc, (d) => {
    const copy = (sourceId: ItemId, parent: ItemId, index: number) => {
      const original = source.items[sourceId];
      const created = d.create(parent, index, original.text);
      Object.assign(created, { note: original.note, completed: original.completed, collapsed: original.collapsed });
      original.children.forEach((child, i) => copy(child, created.id, i));
    };
    const holder = d.create(ROOT, d.read(ROOT).children.length, title);
    source.items[ROOT].children.forEach((child, i) => copy(child, holder.id, i));
    id = holder.id;
  });
  return { doc: next, id };
}

export function removeCompleted(doc: Doc, top: ItemId): { doc: Doc; count: number } {
  let count = 0;
  const next = edit(doc, (d) => {
    const walk = (id: ItemId) => {
      for (const child of [...d.read(id).children]) {
        if (d.read(child).completed) {
          count += 1;
          d.detach(child);
          d.removeSubtree(child);
        } else {
          walk(child);
        }
      }
    };
    walk(top);
  });
  return { doc: count > 0 ? next : doc, count };
}

export function remove(doc: Doc, id: ItemId): Doc {
  return edit(doc, (d) => {
    d.detach(id);
    d.removeSubtree(id);
  });
}

/**
 * Backspace at the start of `id`: its text joins the end of `into`, its
 * children follow, and it disappears. Returns the caret offset inside `into`.
 */
export function mergeInto(doc: Doc, id: ItemId, into: ItemId): { doc: Doc; offset: number } {
  const source = doc.items[id];
  const offset = doc.items[into].text.length;
  const next = edit(doc, (d) => {
    const target = d.write(into);
    target.text += source.text;
    target.note = [target.note, source.note].filter(Boolean).join("\n");
    const intoIsParent = source.parent === into;
    const insertAt = intoIsParent ? target.children.indexOf(id) : target.children.length;
    d.detach(id);
    source.children.forEach((child, i) => d.attach(child, into, insertAt + i));
    if (source.children.length > 0) target.collapsed = false;
    d.forget(id);
  });
  return { doc: next, offset };
}

/*
 * Block operations act on the roots of a selection: selected items whose
 * ancestors are not selected, in reading order. A block moves as one, so if
 * its first (or, going down, last) item cannot move, nothing does.
 */

export function indentAll(doc: Doc, roots: ItemId[], filter: ViewFilter): Doc {
  if (roots.length === 0 || indent(doc, roots[0], filter) === doc) return doc;
  return roots.reduce((current, id) => indent(current, id, filter), doc);
}

export function outdentAll(doc: Doc, roots: ItemId[], top: ItemId): Doc {
  return [...roots].reverse().reduce((current, id) => outdent(current, id, top), doc);
}

export function moveAllUp(doc: Doc, roots: ItemId[], filter: ViewFilter): Doc {
  if (!areSiblings(doc, roots) || moveUp(doc, roots[0], filter) === doc) return doc;
  return roots.reduce((current, id) => moveUp(current, id, filter), doc);
}

export function moveAllDown(doc: Doc, roots: ItemId[], filter: ViewFilter): Doc {
  if (!areSiblings(doc, roots) || moveDown(doc, roots.at(-1)!, filter) === doc) return doc;
  return [...roots].reverse().reduce((current, id) => moveDown(current, id, filter), doc);
}

function areSiblings(doc: Doc, ids: ItemId[]): boolean {
  return ids.length > 0 && ids.every((id) => doc.items[id].parent === doc.items[ids[0]].parent);
}

export function completeAll(doc: Doc, roots: ItemId[]): Doc {
  const completed = !roots.every((id) => doc.items[id].completed);
  return edit(doc, (d) => {
    for (const id of roots) d.write(id).completed = completed;
  });
}

export function removeAll(doc: Doc, roots: ItemId[]): Doc {
  return edit(doc, (d) => {
    for (const id of roots) {
      d.detach(id);
      d.removeSubtree(id);
    }
  });
}

export function selectionRoots(doc: Doc, selected: ItemId[]): ItemId[] {
  const set = new Set(selected);
  return selected.filter((id) => !ancestors(doc, id).some((ancestor) => set.has(ancestor)));
}

export function descendantCount(doc: Doc, id: ItemId): number {
  return doc.items[id].children.reduce((sum, child) => sum + 1 + descendantCount(doc, child), 0);
}

export function subtreeSize(doc: Doc, roots: ItemId[]): number {
  return roots.reduce((sum, id) => sum + 1 + descendantCount(doc, id), 0);
}
