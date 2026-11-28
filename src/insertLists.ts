import { Doc, Item, ItemId, ROOT, SETTINGS, ancestors, appendChild, copyUnder, insertChild, isDescendant, isPrivateItem, newChildIndex, privateRootAbove, setCollapsed, setItemProperty } from "./model";
import { isSealed, propertyKey } from "./notes";
import { parseQuery, queryMatches } from "./query";
import { Column, cellsUnder, declaredColumns, formulaIn } from "./properties";
import { referenceTo } from "./references";
import { dateLabel, inReaderZone, readWrittenDate } from "./dates";

/*
 * Insert lists (doc/adr/0078): under an item's `_settings` child, an
 * `Insert` child holds one list per child, each a `query` of what it offers
 * and an `insert` saying what a pick adds under the item Insert runs on.
 */

export const SETTINGS_TITLE = "_settings";
export const INSERT_TITLE = "Insert";
export const NOT_READ = "insert is not “link into KEY”, “copy” or “copy contents”";
export const NO_QUERY = "This list has no query";
const MOST_PICKS = 40;

export type InsertForm = { kind: "link"; into: string; with: string[] } | { kind: "copy" } | { kind: "contents" };
export type InsertHow = InsertForm & { lastFirst: boolean };

export interface InsertList {
  id: ItemId;
  title: string;
  query: string | null;
  how: InsertHow | { problem: string };
}

export function isSettingsItem(item: Item | undefined): boolean {
  return item?.text.trim().toLowerCase() === SETTINGS_TITLE;
}

function isInsertItem(item: Item | undefined): boolean {
  return item?.text.trim().toLowerCase() === INSERT_TITLE.toLowerCase();
}

export function inSettings(doc: Doc, id: ItemId): boolean {
  return [...ancestors(doc, id), id].some((each) => isSettingsItem(doc.items[each]));
}

/** The lists of the nearest `_settings` > `Insert` at or above `id` that lists any; null when none does. */
export function insertListsFor(doc: Doc, id: ItemId): InsertList[] | null {
  if (!doc.items[id]) return null;
  for (const holder of [id, ...ancestors(doc, id).reverse()]) {
    const insert = insertItemOf(doc, holder);
    const lists = insert === null ? [] : doc.items[insert].children.map((list) => readList(doc.items[list]));
    if (lists.length > 0) return lists;
  }
  return null;
}

function settingsItemOf(doc: Doc, holder: ItemId): ItemId | null {
  return doc.items[holder].children.find((child) => isSettingsItem(doc.items[child])) ?? null;
}

function insertItemOf(doc: Doc, holder: ItemId): ItemId | null {
  const settings = settingsItemOf(doc, holder);
  return settings === null ? null : (doc.items[settings].children.find((child) => isInsertItem(doc.items[child])) ?? null);
}

function readList(item: Item): InsertList {
  const query = item.properties.query?.trim() || null;
  return { id: item.id, title: item.text, query, how: readInsert(item.properties.insert ?? "") };
}

/** Reads `link into food with grams`, `copy` or `copy contents`, each maybe followed by `, last first`. */
export function readInsert(value: string): InsertHow | { problem: string } {
  const written = /^(.*?)(\s*,\s*last\s+first)?$/i.exec(value.trim())!;
  const form = formOf(written[1].trim().toLowerCase().split(/\s+/));
  return form ? { ...form, lastFirst: written[2] !== undefined } : { problem: NOT_READ };
}

function formOf(words: string[]): InsertForm | null {
  if (words.join(" ") === "copy") return { kind: "copy" };
  if (words.join(" ") === "copy contents") return { kind: "contents" };
  const [link, into, key, withWord, ...withKeys] = words;
  if (link !== "link" || into !== "into" || !isValueKey(key)) return null;
  if (withWord === undefined) return { kind: "link", into: key, with: [] };
  if (withWord !== "with" || withKeys.length === 0 || !withKeys.every(isValueKey)) return null;
  return { kind: "link", into: key, with: withKeys };
}

/** A key a line may hold a value in: a setting such as `private` or `query` would change what the line is. */
function isValueKey(key: string | undefined): key is string {
  return key !== undefined && propertyKey(key) === key && !SETTINGS.has(key) && key !== "query";
}

/** Why the list offers nothing, shown in place of its rows; null when it reads. */
export function listProblem(list: InsertList): string | null {
  if (list.query === null) return NO_QUERY;
  return "problem" in list.how ? list.how.problem : null;
}

// ---- what a list offers --------------------------------------------------------------------

/** What the list matches over the whole outline, narrowed to titles with every typed word, in the list's order. */
export function picksOf(doc: Doc, list: InsertList, at: ItemId, typed: string): ItemId[] {
  if (list.query === null || "problem" in list.how) return [];
  const how = list.how;
  const above = new Set(ancestors(doc, at));
  const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
  const offered = queryMatches(doc, ROOT, parseQuery(list.query), { showCompleted: true }).filter(
    (id) =>
      id !== at &&
      !above.has(id) &&
      !isSealed(doc.items[id].note) &&
      !inSettings(doc, id) &&
      !takesOutOfPrivate(doc, id, at, how) &&
      words.every((word) => doc.items[id].text.toLowerCase().includes(word)),
  );
  return (how.lastFirst ? offered.reverse() : offered).slice(0, MOST_PICKS);
}

/**
 * What is under a private item is sealed on the way to the server; a pick may
 * not carry it out in plain. A copy of a private item stays private, but a
 * line's values or the copies of its contents would not.
 */
function takesOutOfPrivate(doc: Doc, pick: ItemId, at: ItemId, how: InsertHow): boolean {
  const holder = how.kind !== "copy" && isPrivateItem(doc, pick) ? pick : privateRootAbove(doc, pick);
  return holder !== null && at !== holder && !isDescendant(doc, at, holder);
}

/** The line under a row: its parent's title, then each `with` key and each column, as `Portions · grams 120 · kcal 116`. */
export function detailOf(doc: Doc, list: InsertList, pick: ItemId): string {
  const parent = doc.items[pick].parent;
  const parentTitle = parent === null || parent === ROOT ? "" : asDay(doc.items[parent].text);
  const columns = columnsShownFor(doc, list, pick);
  const cellOf = cellsUnder(doc, ROOT, columns);
  const values = columns.flatMap(({ key }) => {
    const cell = cellOf(pick, key);
    return cell ? [`${key} ${cell.text}`] : [];
  });
  return [parentTitle, ...values].filter(Boolean).join(" · ");
}

function columnsShownFor(doc: Doc, list: InsertList, pick: ItemId): Column[] {
  const declared = declaredColumns(doc, pick) ?? [];
  const withKeys = "kind" in list.how && list.how.kind === "link" ? list.how.with : [];
  const withColumns = withKeys.map((key): Column => declared.find((column) => column.key === key) ?? { key, summary: "sum" });
  return [...withColumns, ...declared.filter((column) => !withKeys.includes(column.key))];
}

function asDay(title: string): string {
  const written = readWrittenDate(title);
  return written ? dateLabel(inReaderZone(written)) : title;
}

// ---- what a pick adds --------------------------------------------------------------------

/**
 * Adds what the pick stands for under `at` and unfolds it: a line linking
 * the pick, a copy of it, or copies of what is in it. Answers with the item
 * that gets the caret, or null when there is nothing to add.
 */
export function insertPick(doc: Doc, how: InsertHow, at: ItemId, pick: ItemId, plain: (text: string) => string = (text) => text): { doc: Doc; id: ItemId } | null {
  const added = addedFor(doc, how, at, pick, plain);
  return added && { doc: setCollapsed(added.doc, at, false), id: added.id };
}

function addedFor(doc: Doc, how: InsertHow, at: ItemId, pick: ItemId, plain: (text: string) => string): { doc: Doc; id: ItemId } | null {
  if (how.kind === "link") return linkLine(doc, how, at, pick, plain);
  if (how.kind === "copy") return refusedAsNull(copyUnder(doc, pick, at, newChildIndex(doc, at), isSealedItem), at);
  return copiesOfContents(doc, at, pick);
}

function linkLine(doc: Doc, how: Extract<InsertForm, { kind: "link" }>, at: ItemId, pick: ItemId, plain: (text: string) => string): { doc: Doc; id: ItemId } | null {
  const { text } = doc.items[pick];
  const created = insertChild(doc, at, newChildIndex(doc, at), text);
  if (created.id === at) return null;
  const linked = setItemProperty(created.doc, created.id, how.into, referenceTo(pick, plain(text)));
  const started = how.with.reduce((next, key) => setItemProperty(next, created.id, key, startingValue(doc, pick, key) ?? ""), linked);
  return { doc: started, id: created.id };
}

/** The pick's own value as written; for one with none, or a formula, what the view computes for it. */
function startingValue(doc: Doc, pick: ItemId, key: string): string | null {
  const own = doc.items[pick].properties[key];
  if (own !== undefined && formulaIn(own) === null) return own;
  const cell = cellsUnder(doc, ROOT, declaredColumns(doc, pick) ?? [])(pick, key);
  return cell && !cell.error ? cell.text : null;
}

function copiesOfContents(doc: Doc, at: ItemId, pick: ItemId): { doc: Doc; id: ItemId } | null {
  const contents = doc.items[pick].children.filter((child) => !isSealedItem(doc.items[child]));
  let next = doc;
  let first: ItemId | null = null;
  for (const child of contents) {
    const copied = copyUnder(next, child, at, next.items[at].children.length, isSealedItem);
    if (copied.id === at) return null;
    next = copied.doc;
    first ??= copied.id;
  }
  return first === null ? null : { doc: next, id: first };
}

function refusedAsNull(copied: { doc: Doc; id: ItemId }, at: ItemId): { doc: Doc; id: ItemId } | null {
  return copied.id === at ? null : copied;
}

function isSealedItem(item: Item): boolean {
  return isSealed(item.note);
}

// ---- editing the lists --------------------------------------------------------------------

/** The page's `_settings` > `Insert`, made when missing; refused, it answers with the page. */
export function ensureInsertLists(doc: Doc, page: ItemId): { doc: Doc; id: ItemId } {
  const present = insertItemOf(doc, page);
  if (present !== null) return { doc, id: present };
  const settings = settingsItemOf(doc, page);
  if (settings !== null) return appendChild(doc, settings, INSERT_TITLE);
  const made = appendChild(doc, page, SETTINGS_TITLE);
  if (made.id === page) return { doc, id: page };
  return appendChild(setCollapsed(made.doc, made.id, true), made.id, INSERT_TITLE);
}
