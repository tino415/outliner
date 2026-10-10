import { propertyKey, sealedKeyOf, splitPropertyLines } from "./notes";

export type ItemId = string;

export interface Item {
  id: ItemId;
  text: string;
  note: string;
  /** `key: value`, keys in lower case (doc/adr/0032). */
  properties: Readonly<Record<string, string>>;
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
  return { id, text, note: "", properties: {}, parent, children: [], collapsed: false, completed: false, updated: Date.now() };
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
    const privateRoot = privateRootAtOrAbove(this.items, parent);
    const item = blankItem(privateRoot ? `${privateRoot}~${newId()}` : newId(), parent, text);
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

// ---- private items (doc/adr/0029) ----------------------------------------------------

/**
 * A private item has a `private` property, or still holds items with its id
 * and "~": while the property is being changed it stays private, and only
 * `makePublic` ends it.
 */
function isPrivateRoot(items: Doc["items"], id: ItemId): boolean {
  const item = items[id];
  return privateKeyOf(item) !== null || item.children.some((child) => child.startsWith(`${id}~`));
}

export function isPrivateItem(doc: Doc, id: ItemId): boolean {
  return isPrivateRoot(doc.items, id);
}

/** The nearest private item at or above `id`; its descendants' ids start with its own and "~". */
function privateRootAtOrAbove(items: Doc["items"], id: ItemId | null): ItemId | null {
  for (let current = id; current; current = items[current].parent) {
    if (isPrivateRoot(items, current)) return current;
  }
  return null;
}

export function privateRootAbove(doc: Doc, id: ItemId): ItemId | null {
  return privateRootAtOrAbove(doc.items, doc.items[id]?.parent ?? null);
}

/**
 * Gives every item the id its place calls for: under a private item one
 * that starts with that item's id and "~", for one just made private or
 * moved in; elsewhere a public one, for one moved out. Links follow.
 */
export function withPrivateIds(doc: Doc): { doc: Doc; renamed: Map<ItemId, ItemId> } {
  const renamed = new Map<ItemId, ItemId>();
  const visit = (id: ItemId, root: ItemId | null) => {
    const rootHere = isPrivateRoot(doc.items, id) ? id : root;
    for (const child of doc.items[id].children) {
      if (rootHere && !child.startsWith(`${rootHere}~`)) renamed.set(child, `${rootHere}~${child}`);
      else if (!rootHere && child.includes("~")) renamed.set(child, publicIdFor(doc, child));
      visit(child, rootHere);
    }
  };
  visit(ROOT, null);
  return { doc: renameItems(doc, renamed), renamed };
}

/** The item public again: its `private` property gone and everything under it with public ids. */
export function makePublic(doc: Doc, id: ItemId): Doc {
  const withoutLine = setItemProperty(doc, id, "private", "");
  const renamed = new Map<ItemId, ItemId>();
  const visit = (parent: ItemId) => {
    for (const child of withoutLine.items[parent].children) {
      if (child.startsWith(`${id}~`)) renamed.set(child, publicIdFor(withoutLine, child));
      visit(child);
    }
  };
  visit(id);
  return renameItems(withoutLine, renamed);
}

/** The id an item had before it was made private, or a fresh one if that is taken. */
function publicIdFor(doc: Doc, id: ItemId): ItemId {
  const original = id.slice(id.lastIndexOf("~") + 1);
  return doc.items[original] ? newId() : original;
}

function renameItems(doc: Doc, renamed: Map<ItemId, ItemId>): Doc {
  if (renamed.size === 0) return doc;
  const newName = (id: ItemId | null) => (id === null ? null : (renamed.get(id) ?? id));
  const items: Record<ItemId, Item> = {};
  for (const item of Object.values(doc.items)) {
    const id = newName(item.id)!;
    items[id] = { ...item, id, parent: newName(item.parent), children: item.children.map((child) => newName(child)!), text: linksRenamed(item.text, renamed), note: linksRenamed(item.note, renamed) };
  }
  return { items };
}

function linksRenamed(text: string, renamed: Map<ItemId, ItemId>): string {
  if (!text.includes("[[id:")) return text;
  return text.replace(/\[\[id:([^\]\n]+)\]/g, (link, id: string) => (renamed.has(id) ? `[[id:${renamed.get(id)}]` : link));
}

export function indexInParent(doc: Doc, id: ItemId): number {
  const parent = doc.items[id].parent;
  return parent ? doc.items[parent].children.indexOf(id) : 0;
}

function previousShownSibling(doc: Doc, id: ItemId, filter: ViewFilter): ItemId | null {
  const siblings = shownChildren(doc, doc.items[id].parent!, filter);
  return siblings[siblings.indexOf(id) - 1] ?? null;
}

function nextShownSibling(doc: Doc, id: ItemId, filter: ViewFilter): ItemId | null {
  const siblings = shownChildren(doc, doc.items[id].parent!, filter);
  const index = siblings.indexOf(id);
  return index === -1 ? null : (siblings[index + 1] ?? null);
}

export function isBlank(item: Item): boolean {
  return item.text === "" && item.note === "" && Object.keys(item.properties).length === 0 && item.children.length === 0;
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
  return childrenInOrder(doc, id).filter((child) => isShown(doc, child, filter));
}

/** The children as shown: as written, or open ones first where a page above says `:completed: last`. */
export function childrenInOrder(doc: Doc, id: ItemId): ItemId[] {
  const children = doc.items[id].children;
  if (!completedLast(doc, id)) return children;
  const isCompleted = (child: ItemId) => doc.items[child].completed;
  return [...children.filter((child) => !isCompleted(child)), ...children.filter(isCompleted)];
}

const completedLastByDoc = new WeakMap<Doc["items"], Map<ItemId, boolean>>();

function completedLast(doc: Doc, id: ItemId): boolean {
  const known = completedLastByDoc.get(doc.items) ?? new Map<ItemId, boolean>();
  completedLastByDoc.set(doc.items, known);
  const lookUp = (page: ItemId): boolean => {
    if (known.has(page)) return known.get(page)!;
    const { properties, parent } = doc.items[page];
    const placement = properties.completed;
    const answer = placement ? placement.toLowerCase() === "last" : parent !== null && lookUp(parent);
    known.set(page, answer);
    return answer;
  };
  return lookUp(id);
}

export function newChildIndex(doc: Doc, parent: ItemId): number {
  const isNewOnTop = doc.items[parent].properties.new?.toLowerCase() === "top";
  return isNewOnTop ? 0 : doc.items[parent].children.length;
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

// ---- properties (doc/adr/0032) ---------------------------------------------------------

/** Properties that set up the app rather than describe the item: shown muted, never offered as columns. */
export const SETTINGS = new Set(["columns", "capture", "ask", "key", "at", "completed", "new", "view", "private", "plugin", "approved"]);

/** Sets `key` to `value` on the item; an empty value removes it, and a key the sync server would refuse changes nothing. */
export function setItemProperty(doc: Doc, id: ItemId, key: string, value: string): Doc {
  const name = propertyKey(key);
  const written = value.trim();
  const current = doc.items[id].properties;
  if (!name || (current[name] ?? "") === written) return doc;
  const { [name]: _, ...others } = current;
  return edit(doc, (d) => {
    d.write(id).properties = written ? { ...others, [name]: written } : others;
  });
}

/** Moves `:key: value` lines out of the notes of `ids` (every item by default) into their properties. */
export function liftNoteProperties(doc: Doc, ids: ItemId[] = Object.keys(doc.items)): Doc {
  let next = doc;
  for (const id of ids) {
    const item = next.items[id];
    if (!item || !item.note.includes(":") || sealedKeyOf(item.note)) continue;
    const { properties, rest } = splitPropertyLines(item.note);
    if (properties.size === 0) continue;
    next = edit(next, (d) => {
      const written = d.write(id);
      written.note = rest;
      written.properties = { ...written.properties, ...Object.fromEntries([...properties].filter(([, value]) => value !== "")) };
    });
  }
  return next;
}

/** The key a private item is sealed with: its `private` property where it is open, the sealed note's key elsewhere (doc/adr/0029). */
export function privateKeyOf(item: Item): string | null {
  return item.properties.private ?? sealedKeyOf(item.note);
}

/** An item shown as a board: its children are columns, theirs are cards (doc/adr/0031). */
export function isBoard(item: Item): boolean {
  return item.properties.view?.toLowerCase() === "board";
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

export function setFlags(doc: Doc, id: ItemId, flags: Partial<Pick<Item, "collapsed" | "completed" | "note" | "properties">>): Doc {
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
      Object.assign(created, { note: source.note, properties: source.properties, completed: source.completed, collapsed: source.collapsed });
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
      Object.assign(created, { note: original.note, properties: original.properties ?? {}, completed: original.completed, collapsed: original.collapsed });
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
