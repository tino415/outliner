import { isOutsideCode, isSealed, privateKeyInNote, propertyKey, sealedKeyOf, splitPropertyLines } from "./notes";
import { tagsWritten, takeTags } from "./inline";
import { attachmentTitle } from "./attachmentTitle";

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

export const SETTINGS_ITEM: ItemId = "settings";
export const BOOKMARKS: ItemId = "bookmarks";
export const CAPTURE_TEMPLATES: ItemId = "capture-templates";
export const BOOKMARKS_ABOUT: ItemId = "about-bookmarks";
export const CAPTURE_TEMPLATES_ABOUT: ItemId = "about-capture-templates";
export const WORD_IDS: ReadonlySet<ItemId> = new Set([SETTINGS_ITEM, BOOKMARKS, BOOKMARKS_ABOUT, CAPTURE_TEMPLATES, CAPTURE_TEMPLATES_ABOUT]);

export type Part = "title" | "note" | "completed" | "properties" | "children";

interface Lines {
  text: string;
  children?: Lines[];
}

interface KeptItem {
  id: ItemId;
  parent: ItemId;
  title: string;
  columns?: string;
  about?: { id: ItemId; lines: Lines[] };
}

/**
 * The items that live in code (doc/adr/0070), in the order they sit in. A kept
 * item's title, note and completion are fixed, it cannot be deleted or moved
 * out of its parent, and its About, when it has one, is defined here and
 * read-only, never saved or synced (doc/adr/0066).
 */
const KEPT_ITEMS: KeptItem[] = [
  { id: SETTINGS_ITEM, parent: ROOT, title: "Settings" },
  {
    id: BOOKMARKS,
    parent: SETTINGS_ITEM,
    title: "Bookmarks",
    columns: "key",
    about: {
      id: BOOKMARKS_ABOUT,
      lines: [
        { text: "Add a bookmark", children: [{ text: "Add an item here with a link to a page or a web address" }, { text: "Open the page, tap ⋯ and tap Bookmark this page" }] },
        { text: "Tap or click a bookmark's link to open its page; a web address opens in a new tab" },
        { text: "To give a bookmark a shortcut, write a digit from 1 to 9 in its key column" },
      ],
    },
  },
  {
    id: CAPTURE_TEMPLATES,
    parent: SETTINGS_ITEM,
    title: "Capture templates",
    columns: "capture key",
    about: {
      id: CAPTURE_TEMPLATES_ABOUT,
      lines: [
        {
          text: "What a template is",
          children: [{ text: "Each child with a capture property is a template, named by its text" }, { text: "Its children fill the page its target creates" }],
        },
        {
          text: "Properties you can use",
          children: [
            { text: "capture: where items go, a path or an item id; {date} is today, {tomorrow} the day after, {current-week} and {tomorrow-week} their weeks; missing pages are made" },
            { text: "capture also takes {current-weekday} and {tomorrow-weekday}: the weekday of today and of the day after, written like Friday" },
            { text: "key: the letter that picks this template" },
            { text: "ask: the properties the Capture dialog asks for, separated by spaces; grams=100 opens grams with 100" },
            { text: "at: top files new items first; without it they go last" },
            { text: "Any other property is set on the page the target creates" },
          ],
        },
        {
          text: "Keyboard shortcuts",
          children: [
            { text: "Ctrl-J N (⌘J N on a Mac), then the key: capture with that template" },
            { text: "Ctrl-J W (⌘J W), then the key: go to the template's target without capturing" },
          ],
        },
        {
          text: "Other ways in",
          children: [
            { text: "⋯ → Capture…, or Capture in Ctrl-K" },
            { text: "The address ?capture=Meal opens Capture with that template; adding &go goes to its target" },
            { text: 'outline capture "Oats" --template Meal --set kcal=300 from a shell' },
          ],
        },
      ],
    },
  },
];

function keptItem(id: ItemId): KeptItem | undefined {
  return KEPT_ITEMS.find((kept) => kept.id === id);
}

function aboutOwner(id: ItemId): KeptItem | undefined {
  return KEPT_ITEMS.find((kept) => kept.about && (id === kept.about.id || id.startsWith(`${kept.about.id}-`)));
}

export function isAboutItem(id: ItemId): boolean {
  return aboutOwner(id) !== undefined;
}

export function isKeptHeading(id: ItemId): boolean {
  return keptItem(id) !== undefined;
}

function isAboutHeading(id: ItemId): boolean {
  return aboutOwner(id)?.about?.id === id;
}

function isFixedInPlace(id: ItemId): boolean {
  return isAboutItem(id) || (isKeptHeading(id) && keptItem(id)!.parent !== ROOT);
}

export function isReadOnly(id: ItemId, part: Part): boolean {
  if (isAboutItem(id)) return true;
  return isKeptHeading(id) && (part === "title" || part === "note" || part === "completed");
}

export function readOnlyNotice(id: ItemId): string {
  const owner = aboutOwner(id);
  return owner ? `About ${owner.title} is read-only` : `${keptItem(id)?.title} is read-only`;
}

export function keptNotice(id: ItemId): string {
  return isAboutItem(id) ? readOnlyNotice(id) : `${keptItem(id)?.title} stays; empty it instead`;
}

export function keptStays(ids: ItemId[]): string {
  const heading = ids.find(isKeptHeading);
  return heading ? `${keptItem(heading)!.title} stays` : readOnlyNotice(ids.find(isAboutItem)!);
}

export function isKept(id: ItemId): boolean {
  return isKeptHeading(id) || isAboutItem(id);
}

function keptParentOf(id: ItemId): ItemId | null {
  return keptItem(id)?.parent ?? (aboutOwner(id)?.about?.id === id ? aboutOwner(id)!.id : null);
}

export function movesKeptOut(id: ItemId, parent: ItemId): boolean {
  const keptParent = keptParentOf(id);
  return keptParent !== null && keptParent !== parent;
}

const aboutItems: Record<ItemId, Item[]> = Object.fromEntries(
  KEPT_ITEMS.filter((kept) => kept.about).map((kept) => {
    const items: Item[] = [];
    const add = (id: ItemId, parent: ItemId, text: string, lines: Lines[]): void => {
      const children = lines.map((_, index) => `${id}-${index + 1}`);
      items.push({ ...blankItem(id, parent, text), children, collapsed: id === kept.about!.id, updated: 0 });
      lines.forEach((line, index) => add(children[index], id, line.text, line.children ?? []));
    };
    add(kept.about!.id, kept.id, `About ${kept.title}`, kept.about!.lines);
    return [kept.id, items];
  }),
);

/** Settings and what lives under it made when missing, with their columns the one time each is made. */
export function withSettingsItems(doc: Doc): Doc {
  if (KEPT_ITEMS.every((kept) => doc.items[kept.id])) return withKeptParts(doc);
  return withKeptParts(edit(doc, (d) => {
    for (const kept of KEPT_ITEMS.filter((made) => !doc.items[made.id])) {
      const properties: Record<string, string> = kept.columns ? { columns: kept.columns } : {};
      d.adopt({ ...blankItem(kept.id, kept.parent, kept.title), properties });
      const siblings = d.write(kept.parent).children;
      siblings.splice(kept.id === SETTINGS_ITEM && doc.items[BOOKMARKS] ? Math.max(siblings.indexOf(BOOKMARKS), 0) : siblings.length, 0, kept.id);
    }
  }));
}

function leadingChildren(kept: KeptItem, items: Doc["items"]): ItemId[] {
  const kids = KEPT_ITEMS.filter((child) => child.parent === kept.id && items[child.id]).map((child) => child.id);
  return kept.about ? [kept.about.id, ...kids] : kids;
}

/**
 * What lives in code and not in the outline: each kept item's title, note and
 * completion, its place under its parent, and About with its lines, first
 * under its item. Put back whenever a document differs; About's folding is the
 * one thing it keeps.
 */
export function withKeptParts(doc: Doc): Doc {
  const items = { ...doc.items };
  let changed = false;
  const put = (item: Item): void => {
    items[item.id] = item;
    changed = true;
  };
  for (const kept of KEPT_ITEMS) {
    const item = items[kept.id];
    if (!item || !items[kept.parent] || item.parent === kept.parent) continue;
    const old = items[item.parent!];
    if (old) put({ ...old, children: old.children.filter((child) => child !== kept.id) });
    put({ ...items[kept.parent], children: [...items[kept.parent].children, kept.id] });
    put({ ...item, parent: kept.parent });
  }
  for (const kept of KEPT_ITEMS) {
    const item = items[kept.id];
    if (!item) continue;
    const note = isSealed(item.note) ? item.note : "";
    const leading = leadingChildren(kept, items);
    const children = [...leading, ...item.children.filter((child) => !leading.includes(child))];
    if (item.text !== kept.title || item.note !== note || item.completed || !sameIds(item.children, children)) {
      put({ ...item, text: kept.title, note, completed: false, children });
    }
    const aboutIntact = (aboutItems[kept.id] ?? []).every((fixed) => {
      const shown = items[fixed.id];
      return shown && shown.text === fixed.text && shown.note === "" && shown.parent === fixed.parent && !shown.completed && Object.keys(shown.properties).length === 0 && sameIds(shown.children, fixed.children);
    });
    if (!aboutIntact) for (const fixed of aboutItems[kept.id]) put({ ...fixed, collapsed: items[fixed.id]?.collapsed ?? fixed.collapsed });
  }
  return changed ? { items } : doc;
}

/** A write to a kept item's title, note or completion that code does not hold; a sealed note is how a private one syncs. */
export function contradictsKept(id: ItemId, field: string, value: unknown): boolean {
  const kept = keptItem(id);
  if (!kept) return false;
  if (field === "text") return value !== kept.title;
  if (field === "note") return value !== "" && !(typeof value === "string" && isSealed(value));
  if (field === "completed") return value !== false;
  return false;
}

function sameIds(a: ItemId[], b: ItemId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

const listsWithoutAbout = new WeakMap<Item, Item>();

/** The document as saved and synced: without the parts that live in code. */
export function withoutKeptAbouts(doc: Doc): Doc {
  const withAbout = KEPT_ITEMS.filter((kept) => doc.items[kept.about?.id ?? ""]);
  if (withAbout.length === 0) return doc;
  const items = { ...doc.items };
  for (const kept of withAbout) {
    for (const fixed of aboutItems[kept.id]) delete items[fixed.id];
    const list = doc.items[kept.id];
    if (!listsWithoutAbout.has(list)) listsWithoutAbout.set(list, { ...list, children: list.children.filter((child) => child !== kept.about!.id) });
    items[kept.id] = listsWithoutAbout.get(list)!;
  }
  return { items };
}

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

/** A new document grown by appending children; nothing in it is private yet, so every id is a plain one. */
export function buildDoc(grow: (root: Item, append: (parent: Item, text: string) => Item) => void): Doc {
  const root = blankItem(ROOT, null);
  const items: Record<ItemId, Item> = { [ROOT]: root };
  grow(root, (parent, text) => {
    const child = blankItem(newId(), parent.id, text);
    items[child.id] = child;
    parent.children.push(child.id);
    return child;
  });
  return { items };
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

  adopt(item: Item): void {
    this.items[item.id] = item;
    this.cloned.add(item.id);
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
      if (isAboutItem(child)) continue;
      const keepsItsId = isKeptHeading(child);
      if (!keepsItsId && rootHere && !child.startsWith(`${rootHere}~`)) renamed.set(child, `${rootHere}~${child}`);
      else if (!keepsItsId && !rootHere && child.includes("~")) renamed.set(child, publicIdFor(doc, child));
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
  if (doc.items[id].text === text || isReadOnly(id, "title")) return doc;
  return edit(doc, (d) => {
    d.write(id).text = text;
  });
}

export function setNote(doc: Doc, id: ItemId, note: string): Doc {
  if (doc.items[id].note === note || isReadOnly(id, "note")) return doc;
  return edit(doc, (d) => {
    d.write(id).note = note;
  });
}

// ---- properties (doc/adr/0032) ---------------------------------------------------------

/** Properties that set up the app rather than describe the item: shown muted, never offered as columns. */
export const SETTINGS = new Set(["columns", "capture", "ask", "key", "at", "completed", "new", "view", "private", "plugin", "approved", "shortcuts", "mirror", "link-base", "insert"]);

/** Sets `key` to `value` on the item; an empty value removes it, and a key the sync server would refuse changes nothing. */
export function setItemProperty(doc: Doc, id: ItemId, key: string, value: string): Doc {
  const name = propertyKey(key);
  const written = value.trim();
  const current = doc.items[id].properties;
  if (!name || (current[name] ?? "") === written || isReadOnly(id, "properties")) return doc;
  const { [name]: _, ...others } = current;
  return edit(doc, (d) => {
    d.write(id).properties = written ? { ...others, [name]: written } : others;
  });
}

/** Moves `:key: value` lines out of the notes of `ids` (every item by default) into their properties, except the lines `refused` says no to. */
export function liftNoteProperties(doc: Doc, ids: ItemId[] = Object.keys(doc.items), refused: (id: ItemId, key: string, value: string) => boolean = () => false): Doc {
  const lifted = ids.flatMap((id) => {
    const item = doc.items[id];
    if (!item || !item.note.includes(":") || sealedKeyOf(item.note)) return [];
    const { properties, rest } = splitPropertyLines(item.note, (key, value) => refused(id, key, value));
    return properties.size === 0 ? [] : [{ id, properties, rest }];
  });
  if (lifted.length === 0) return doc;
  return edit(doc, (d) => {
    for (const { id, properties, rest } of lifted) {
      const written = d.write(id);
      written.note = rest;
      written.properties = { ...written.properties, ...Object.fromEntries([...properties].filter(([, value]) => value !== "")) };
    }
  });
}

/** The tags of an item: those in its `tags` property, then any still written in its title. */
export function tagsOf(item: Item): string[] {
  return distinctTags([...tagsProperty(item), ...tagsWritten(item.text)]);
}

export function tagsProperty(item: Item): string[] {
  return (item.properties.tags ?? "").split(/\s+/).map((tag) => tag.replace(/^#+/, ""));
}

/** The title followed by its tags as `#a #b`, the form agents and exports read and write. */
export function titleWithTags(item: Item): string {
  const written = new Set(tagsWritten(item.text).map((tag) => tag.toLowerCase()));
  const lifted = tagsProperty(item).filter((tag) => tag !== "" && !written.has(tag.toLowerCase()));
  return [item.text, ...lifted.map((tag) => `#${tag}`)].filter(Boolean).join(" ");
}

function distinctTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => tag !== "" && !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()));
}

/** Moves the #tags written in the title and note of `ids` (every item by default) into their `tags` property. A title that is only a tag keeps it. */
export function liftTags(doc: Doc, ids: ItemId[] = Object.keys(doc.items)): Doc {
  const lifted = ids.flatMap((id) => {
    const item = doc.items[id];
    if (!item || isReadOnly(id, "properties") || sealedKeyOf(item.note)) return [];
    const fromTitle = isReadOnly(id, "title") ? { rest: item.text, tags: [] } : takeTags(item.text);
    const title = fromTitle.rest === "" ? { rest: item.text, tags: [] } : fromTitle;
    const fromNote = isReadOnly(id, "note") ? { note: item.note, tags: [] } : takeTagsFromNote(item.note);
    const taken = [...title.tags, ...fromNote.tags];
    if (taken.length === 0) return [];
    return [{ id, text: title.rest, note: fromNote.note, tags: distinctTags([...tagsProperty(item), ...taken]) }];
  });
  if (lifted.length === 0) return doc;
  return edit(doc, (d) => {
    for (const { id, text, note, tags } of lifted) {
      const written = d.write(id);
      written.text = text;
      written.note = note;
      written.properties = { ...written.properties, tags: tags.join(" ") };
    }
  });
}

/** Lines made of nothing but tags go with them. */
function takeTagsFromNote(note: string): { note: string; tags: string[] } {
  const lines = note.split("\n");
  const outside = isOutsideCode(lines);
  const tags: string[] = [];
  const kept = lines.flatMap((line, index) => {
    if (!outside[index]) return [line];
    const taken = takeTags(line);
    tags.push(...taken.tags);
    return taken.tags.length > 0 && taken.rest.trim() === "" ? [] : [taken.rest];
  });
  return { note: kept.join("\n"), tags };
}

/** The key a private item is sealed with: its `private` property where it is open, else the key its note names (doc/adr/0029). */
export function privateKeyOf(item: Item): string | null {
  return item.properties.private ?? privateKeyInNote(item.note);
}

/** An item shown as a board: its children are columns, theirs are cards (doc/adr/0031). */
export function isBoard(item: Item): boolean {
  return item.properties.view?.toLowerCase() === "board";
}

/** An item shown as a tree laid sideways: the title at the left, each level of children to the right of its parent. */
export function isSidewaysTree(item: Item): boolean {
  return item.properties.view?.toLowerCase() === "tree";
}

export function setCollapsed(doc: Doc, id: ItemId, collapsed: boolean): Doc {
  if (doc.items[id].collapsed === collapsed) return doc;
  return edit(doc, (d) => {
    d.write(id).collapsed = collapsed;
  });
}

/** Items that fold: those with children, and a picture attached as a child, which folds to its file name (doc/adr/0072). */
export function isFoldable(item: Item): boolean {
  return item.children.length > 0 || attachmentTitle(item.text)?.image === true;
}

export function setCollapsedEverywhere(doc: Doc, top: ItemId, collapsed: boolean): Doc {
  return edit(doc, (d) => {
    const walk = (id: ItemId) => {
      for (const child of d.read(id).children) {
        if (isFoldable(d.read(child)) && d.read(child).collapsed !== collapsed) {
          d.write(child).collapsed = collapsed;
        }
        walk(child);
      }
    };
    walk(top);
  });
}

export function foldableInside(doc: Doc, top: ItemId): ItemId[] {
  return doc.items[top].children.flatMap((child) => [...(isFoldable(doc.items[child]) ? [child] : []), ...foldableInside(doc, child)]);
}

export function toggleCompleted(doc: Doc, id: ItemId): Doc {
  if (isReadOnly(id, "completed")) return doc;
  return edit(doc, (d) => {
    const item = d.write(id);
    item.completed = !item.completed;
  });
}

export function appendChild(doc: Doc, parent: ItemId, text = ""): { doc: Doc; id: ItemId } {
  return insertChild(doc, parent, doc.items[parent].children.length, text);
}

export function setFlags(doc: Doc, id: ItemId, flags: Partial<Pick<Item, "collapsed" | "completed" | "note" | "properties">>): Doc {
  const changes: [keyof typeof flags, Part][] = [["completed", "completed"], ["note", "note"], ["properties", "properties"]];
  if (changes.some(([flag, part]) => flag in flags && isReadOnly(id, part))) return doc;
  return edit(doc, (d) => {
    Object.assign(d.write(id), flags);
  });
}

/** Refused, it answers with the parent's own id, which every further change to it refuses too. */
export function insertChild(doc: Doc, parent: ItemId, index: number, text = ""): { doc: Doc; id: ItemId } {
  if (isReadOnly(parent, "children")) return { doc, id: parent };
  let id = "";
  const next = edit(doc, (d) => {
    id = d.create(parent, index, text).id;
  });
  return { doc: next, id };
}

export function insertShownChild(doc: Doc, parent: ItemId, index: number): { doc: Doc; id: ItemId } {
  const created = insertChild(doc, parent, index);
  if (created.id === parent) return created;
  return { doc: setCollapsed(created.doc, parent, false), id: created.id };
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
  childrenShown = isExpanded(doc, id, filter),
): { doc: Doc; id: ItemId; focus: ItemId } {
  const item = doc.items[id];
  const parent = item.parent!;
  const index = indexInParent(doc, id);
  const cutsFixedText = isReadOnly(id, "title") && offset < item.text.length && !(offset === 0 && keptItem(id)?.parent === ROOT);
  if (cutsFixedText || (isAboutItem(id) && !isAboutHeading(id))) return { doc, id, focus: id };
  childrenShown = childrenShown && !isReadOnly(id, "children");

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
    created = childrenShown
      ? d.create(id, 0, tail).id
      : d.create(parent, index + 1, tail).id;
  });
  return { doc: next, id: created, focus: created };
}

export function indent(doc: Doc, id: ItemId, filter: ViewFilter): Doc {
  const newParent = previousShownSibling(doc, id, filter);
  if (!newParent || isKept(id) || isReadOnly(newParent, "children")) return doc;
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
  if (movesKeptOut(id, grandparent) || isAboutItem(id)) return doc;
  return edit(doc, (d) => {
    d.detach(id);
    d.attach(id, grandparent, d.read(grandparent).children.indexOf(parent) + 1);
  });
}

export function moveUp(doc: Doc, id: ItemId, filter: ViewFilter): Doc {
  const target = previousShownSibling(doc, id, filter);
  if (!target || isFixedInPlace(target)) return doc;
  return moveTo(doc, id, doc.items[id].parent!, indexInParent(doc, target));
}

export function moveDown(doc: Doc, id: ItemId, filter: ViewFilter): Doc {
  const target = nextShownSibling(doc, id, filter);
  if (!target || isFixedInPlace(target)) return doc;
  return moveTo(doc, id, doc.items[id].parent!, indexInParent(doc, target) + 1);
}

/** Move `id` so it sits at `index` among `parent`'s current children. */
export function moveTo(doc: Doc, id: ItemId, parent: ItemId, index: number): Doc {
  if (id === parent || isDescendant(doc, parent, id)) return doc;
  if (movesKeptOut(id, parent) || isAboutItem(id) || isReadOnly(parent, "children")) return doc;
  return edit(doc, (d) => {
    const oldParent = d.read(id).parent!;
    const oldIndex = d.read(oldParent).children.indexOf(id);
    const adjusted = oldParent === parent && oldIndex < index ? index - 1 : index;
    d.detach(id);
    d.attach(id, parent, adjusted);
  });
}

export function duplicate(doc: Doc, id: ItemId): { doc: Doc; id: ItemId } {
  const parent = doc.items[id].parent;
  if (isKept(id) || !parent || isReadOnly(parent, "children")) return { doc, id };
  return copyUnder(doc, id, parent, indexInParent(doc, id) + 1);
}

/** A copy of `source` and everything under it at `index` among `parent`'s children, leaving out the items `leftOut` names; refused, it answers with `parent`. */
export function copyUnder(doc: Doc, source: ItemId, parent: ItemId, index: number, leftOut: (item: Item) => boolean = () => false): { doc: Doc; id: ItemId } {
  if (isReadOnly(parent, "children")) return { doc, id: parent };
  let copyId = "";
  const next = edit(doc, (d) => {
    const copy = (sourceId: ItemId, parent: ItemId, index: number): ItemId => {
      const original = d.read(sourceId);
      const created = d.create(parent, index, original.text);
      Object.assign(created, { note: original.note, properties: original.properties, completed: original.completed, collapsed: original.collapsed });
      original.children.filter((child) => !leftOut(d.read(child))).forEach((child, i) => copy(child, created.id, i));
      return created.id;
    };
    copyId = copy(source, parent, index);
  });
  return { doc: next, id: copyId };
}

/** Appends copies of `from`'s children, subtrees included, under `to`, passing every text, note and property value through `rewrite`; sealed items stay out. */
export function copyChildren(doc: Doc, from: ItemId, to: ItemId, rewrite: (text: string) => string): Doc {
  return edit(doc, (d) => {
    const copy = (sourceId: ItemId, parent: ItemId) => {
      const source = d.read(sourceId);
      if (isSealed(source.note)) return;
      const created = d.create(parent, d.read(parent).children.length, rewrite(source.text));
      Object.assign(created, {
        note: rewrite(source.note),
        properties: Object.fromEntries(Object.entries(source.properties).map(([key, value]) => [key, rewrite(value)])),
        completed: source.completed,
        collapsed: source.collapsed,
      });
      source.children.forEach((child) => copy(child, created.id));
    };
    d.read(from).children.forEach((child) => copy(child, to));
  });
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
        if (d.read(child).completed && !isKept(child)) {
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
  if (isKept(id)) return doc;
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
  if (isKept(id) || isKept(into)) return { doc, offset };
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
  if (roots.some((id) => isReadOnly(id, "completed"))) return doc;
  const completed = !roots.every((id) => doc.items[id].completed);
  return edit(doc, (d) => {
    for (const id of roots) d.write(id).completed = completed;
  });
}

export function removeAll(doc: Doc, roots: ItemId[]): Doc {
  if (roots.some(isKept)) return doc;
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
