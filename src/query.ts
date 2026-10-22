import { Doc, Item, ItemId, ROOT, ViewFilter, ancestors, isShown } from "./model";
import { Day, dateFilter, datesOf, today } from "./dates";
import { tagsWritten } from "./inline";

/*
 * Query views (doc/adr/0044): `#feature is:open OR under:"Projects/Outliner" -draft`.
 * Words separated by OR are alternatives; within one, every word must hold.
 */

export type Matcher = (doc: Doc, id: ItemId) => boolean;

export function parseQuery(query: string, now: Day = today()): Matcher {
  const alternatives = splitOnOr(queryWords(query)).filter((words) => words.length > 0);
  if (alternatives.length === 0) return () => false;
  const tests = alternatives.map((words) => words.map((word) => wordTest(word, now)));
  return (doc, id) => tests.some((all) => all.every((test) => test(doc, id)));
}

/** Matching items under `top` in reading order, leaving out `top` and what the Show completed switch hides. */
export function queryMatches(doc: Doc, top: ItemId, matches: Matcher, filter: ViewFilter, exclude: ItemId | null = null): ItemId[] {
  const walk = (id: ItemId): ItemId[] =>
    doc.items[id].children.filter((child) => isShown(doc, child, filter)).flatMap((child) => [...(child !== exclude && matches(doc, child) ? [child] : []), ...walk(child)]);
  return walk(top);
}

export function queryOf(item: Item): string | null {
  const query = item.properties.query?.trim();
  return query ? query : null;
}

export type Grouping = "parent" | "date";

export function groupingOf(item: Item): Grouping {
  return item.properties.group?.trim().toLowerCase() === "date" ? "date" : "parent";
}

export type DateSection = { kind: "overdue" } | { kind: "day"; day: Day } | { kind: "undated" } | { kind: "past" };

export interface Group<Section> {
  section: Section;
  ids: ItemId[];
}

export function byParent(doc: Doc, ids: ItemId[]): Group<ItemId>[] {
  const groups = new Map<ItemId, Group<ItemId>>();
  for (const id of ids) {
    const parent = doc.items[id].parent ?? ROOT;
    const group = groups.get(parent) ?? { section: parent, ids: [] };
    group.ids.push(id);
    groups.set(parent, group);
  }
  return [...groups.values()];
}

/** Overdue first, then each coming day, then items without a date, then completed items whose dates have passed. */
export function byDate(doc: Doc, ids: ItemId[], now: Day): Group<DateSection>[] {
  const placed = ids.map((id, index) => ({ id, ...placeByDate(doc.items[id], now), index }));
  placed.sort((a, b) => a.order.localeCompare(b.order) || a.index - b.index);
  const groups = new Map<string, Group<DateSection>>();
  for (const { id, section } of placed) {
    const key = section.kind === "day" ? section.day : section.kind;
    const group = groups.get(key) ?? { section, ids: [] };
    group.ids.push(id);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function placeByDate(item: Item, now: Day): { section: DateSection; order: string } {
  const days = datesOf(item).map((date) => date.day).sort();
  if (days.length === 0) return { section: { kind: "undated" }, order: "2" };
  const next = days.find((day) => day >= now);
  if (next) return { section: { kind: "day", day: next }, order: `1 ${next}` };
  if (item.completed) return { section: { kind: "past" }, order: `3 ${days.at(-1)}` };
  return { section: { kind: "overdue" }, order: `0 ${days.at(-1)}` };
}

function queryWords(query: string): string[] {
  return [...query.matchAll(/(?:[^\s"]*"[^"]*"?)+[^\s"]*|\S+/g)].map((match) => match[0]);
}

function splitOnOr(words: string[]): string[][] {
  const alternatives: string[][] = [[]];
  for (const word of words) {
    if (word === "OR") alternatives.push([]);
    else alternatives.at(-1)!.push(word);
  }
  return alternatives;
}

function wordTest(word: string, now: Day): Matcher {
  if (word.length > 1 && word.startsWith("-")) {
    const positive = wordTest(word.slice(1), now);
    return (doc, id) => !positive(doc, id);
  }
  const lower = unquote(word).toLowerCase();
  if (word.startsWith("#") && word.length > 1) {
    const tag = lower.slice(1);
    return (doc, id) => tagsWritten(doc.items[id].text).some((written) => written.toLowerCase() === tag);
  }
  const operator = /^(is|under|has):(.+)$/i.exec(word);
  if (operator) {
    const value = unquote(operator[2]);
    const test = operatorTest(operator[1].toLowerCase(), value);
    if (test) return test;
  }
  const byDateWord = dateFilter(word, now);
  if (byDateWord) return (doc, id) => byDateWord(doc.items[id]);
  return (doc, id) => `${doc.items[id].text}\n${doc.items[id].note}`.toLowerCase().includes(lower);
}

function operatorTest(operator: string, value: string): Matcher | null {
  const lower = value.toLowerCase();
  if (operator === "is" && lower === "open") return (doc, id) => !doc.items[id].completed;
  if (operator === "is" && (lower === "done" || lower === "completed")) return (doc, id) => doc.items[id].completed;
  if (operator === "has") return (doc, id) => (doc.items[id].properties[lower] ?? "").trim() !== "";
  if (operator === "under") return underPath(lower.split("/").map((part) => part.trim()).filter(Boolean));
  return null;
}

/** Below an item whose path ends with these texts: `under:Outliner` and `under:"Projects/Outliner"` both find the cards there. */
function underPath(segments: string[]): Matcher {
  return (doc, id) => {
    const above = ancestors(doc, id)
      .filter((ancestor) => ancestor !== ROOT && ancestor !== id)
      .map((ancestor) => doc.items[ancestor].text.trim().toLowerCase());
    for (let end = segments.length; end <= above.length; end++) {
      if (segments.every((segment, index) => above[end - segments.length + index] === segment)) return true;
    }
    return false;
  };
}

function unquote(text: string): string {
  return text.replace(/"/g, "");
}
