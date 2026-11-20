import { Doc, Item, ItemId, ancestors, appendChild, setCollapsed, setText } from "./model";
import { propertyKey, splitPropertyLines } from "./notes";
import { formulaIn } from "./properties";
import { readWrittenDate } from "./dates";

/*
 * A `Checks:` child types the properties under its parent (doc/adr/0070):
 * one child per property, written `key: type`, with the allowed values of
 * `one of` as its children. The nearest `Checks:` up the tree decides a key.
 */

export const CHECKS_TITLE = "Checks:";

export type CheckType = { kind: "integer" | "date" | "time" | "text" } | { kind: "oneOf"; values: string[]; range?: string };

export interface Check {
  id: ItemId;
  key: string;
  unique: boolean;
  type: CheckType;
  ruled: ItemId;
}

const SIMPLE_TYPES = ["integer", "date", "time", "text"] as const;
const WORDS = [...SIMPLE_TYPES, "one of"];
const MOST_RANGE_VALUES = 1000;
const WRITTEN_CHECK = /^([\p{L}\p{N}_-]+):[ \t]*(.*)$/u;
const RANGE = /^one of (-?\d+)\.\.(-?\d+)$/;

export function isChecksItem(item: Item | undefined): boolean {
  return item?.text.trim().toLowerCase() === CHECKS_TITLE.toLowerCase();
}

export function checksItemOf(doc: Doc, ruled: ItemId): ItemId | undefined {
  return doc.items[ruled]?.children.find((child) => isChecksItem(doc.items[child]));
}

/** The item is a `Checks:` item or lies under one: what is written there is a check, not a value to check. */
export function inChecks(doc: Doc, id: ItemId): boolean {
  return [...ancestors(doc, id), id].some((each) => isChecksItem(doc.items[each]));
}

export function ensureChecks(doc: Doc, page: ItemId): { doc: Doc; id: ItemId } {
  const present = checksItemOf(doc, page);
  if (present) return { doc, id: present };
  const added = appendChild(doc, page, "");
  return { doc: setCollapsed(setText(added.doc, added.id, CHECKS_TITLE), added.id, true), id: added.id };
}

// ---- reading the checks ---------------------------------------------------------------------

interface ReadChecks {
  checks: Check[];
  problems: Map<ItemId, string>;
}

export function checksFor(doc: Doc, id: ItemId): Map<string, Check> {
  const found = new Map<string, Check>();
  if (inChecks(doc, id)) return found;
  for (const above of ancestors(doc, id).reverse()) {
    const checksId = checksItemOf(doc, above);
    if (!checksId) continue;
    for (const check of readChecks(doc, checksId).checks) if (!found.has(check.key)) found.set(check.key, check);
  }
  return found;
}

/** What is wrong with each row under a `Checks:` item; a row with a problem checks nothing. */
export function problemsInChecks(doc: Doc, checksId: ItemId): Map<ItemId, string> {
  return readChecks(doc, checksId).problems;
}

/** What is wrong with this row if it is a check, or a value listed under one; an empty string when nothing is. */
export function problemInCheckRow(doc: Doc, id: ItemId): string {
  const parent = doc.items[id].parent;
  const grandparent = parent ? doc.items[parent].parent : null;
  if (parent && isChecksItem(doc.items[parent])) return problemsInChecks(doc, parent).get(id) ?? "";
  if (grandparent && isChecksItem(doc.items[grandparent])) return problemsInChecks(doc, grandparent).get(id) ?? "";
  return "";
}

const readings = new WeakMap<Doc, Map<ItemId, ReadChecks>>();

/** A doc never changes, so what was read from it once is read again for free while rendering. */
function readChecks(doc: Doc, checksId: ItemId): ReadChecks {
  const known = readings.get(doc) ?? new Map<ItemId, ReadChecks>();
  readings.set(doc, known);
  const cached = known.get(checksId);
  if (cached) return cached;
  const read = readChecksAnew(doc, checksId);
  known.set(checksId, read);
  return read;
}

function readChecksAnew(doc: Doc, checksId: ItemId): ReadChecks {
  const ruled = doc.items[checksId].parent!;
  const checks: Check[] = [];
  const problems = new Map<ItemId, string>();
  for (const id of doc.items[checksId].children) {
    const read = readCheck(doc, id, ruled);
    if ("problem" in read) problems.set(id, read.problem);
    else if (checks.some((each) => each.key === read.check.key)) problems.set(id, `${read.check.key} is already checked above`);
    else checks.push(read.check);
    for (const [valueId, problem] of valueProblems(doc, id)) problems.set(valueId, problem);
  }
  return { checks, problems };
}

function readCheck(doc: Doc, id: ItemId, ruled: ItemId): { check: Check } | { problem: string } {
  const written = WRITTEN_CHECK.exec(doc.items[id].text.trim());
  const key = written && propertyKey(written[1]);
  if (!written || !key) return { problem: "Write a check as key: type, for instance effort: one of" };
  const unique = /^unique\s/i.test(written[2]);
  const type = typeOf(doc, id, written[2].replace(/^unique\s+/i, "").trim().replace(/\s+/g, " "));
  if ("problem" in type) return type;
  return { check: { id, key, unique, type: type.type, ruled } };
}

function typeOf(doc: Doc, id: ItemId, written: string): { type: CheckType } | { problem: string } {
  const lower = written.toLowerCase();
  const children = doc.items[id].children;
  const simple = SIMPLE_TYPES.find((type) => type === lower);
  if (simple) return children.length > 0 ? { problem: `Only one of takes values; remove what is under ${written}` } : { type: { kind: simple } };
  const range = RANGE.exec(lower);
  if (range) return rangeOf(Number(range[1]), Number(range[2]), children.length);
  if (lower !== "one of") return { problem: `Unknown type ${written}; use ${WORDS.join(", ")}, each with unique in front` };
  const values = children.map((child) => doc.items[child].text.trim()).filter(Boolean);
  return values.length > 0 ? { type: { kind: "oneOf", values } } : { problem: "List the values of one of as children" };
}

function rangeOf(from: number, to: number, children: number): { type: CheckType } | { problem: string } {
  if (children > 0) return { problem: "A range lists no values; remove its children" };
  if (to < from || to - from >= MOST_RANGE_VALUES) return { problem: `A range runs up to ${MOST_RANGE_VALUES} integers, low to high` };
  const values = Array.from({ length: to - from + 1 }, (_, index) => String(from + index));
  return { type: { kind: "oneOf", values, range: `${from}..${to}` } };
}

function valueProblems(doc: Doc, checkId: ItemId): [ItemId, string][] {
  const seen = new Set<string>();
  return doc.items[checkId].children.flatMap((child) => {
    const value = doc.items[child].text.trim().toLowerCase();
    if (!value) return [];
    if (seen.has(value)) return [[child, `${doc.items[child].text.trim()} is listed twice`] as [ItemId, string]];
    seen.add(value);
    return [];
  });
}

// ---- checking a value ---------------------------------------------------------------------

/** Why `value` may not be the `key` of the item, or null when it may. */
export function problemWith(doc: Doc, id: ItemId, key: string, value: string): string | null {
  const written = value.trim();
  const check = checksFor(doc, id).get(key.toLowerCase());
  if (!check || written === "" || formulaIn(written) !== null) return null;
  const shape = shapeProblem(check, written);
  if (shape) return `${shape} (checked under "${doc.items[check.ruled].text}")`;
  const other = check.unique ? holderOf(doc, check, id, written) : null;
  return other ? `${check.key} ${written} is already on "${doc.items[other].text}" (unique under "${doc.items[check.ruled].text}")` : null;
}

export function describeCheck(doc: Doc, { type, unique, ruled }: Check): string {
  const plain = { integer: "an integer", date: "a date", time: "a time like 9:30", text: "any text" };
  const what = type.kind === "oneOf" ? `one of ${type.range ?? type.values.join(", ")}` : plain[type.kind];
  return `${unique ? "Unique, " : ""}${what} (checked under "${doc.items[ruled].text}")`;
}

function shapeProblem({ key, type }: Check, value: string): string | null {
  switch (type.kind) {
    case "integer":
      return /^-?\d+$/.test(value) ? null : `${key} must be an integer`;
    case "time":
      return /^\d{1,2}:[0-5]\d$/.test(value) && Number(value.split(":")[0]) < 24 ? null : `${key} must be a time like 9:30`;
    case "date":
      return readWrittenDate(value) ? null : `${key} must be a date like 2026-11-19`;
    case "text":
      return null;
    case "oneOf":
      return type.values.some((allowed) => allowed.toLowerCase() === value.toLowerCase()) ? null : `${key} must be one of ${type.range ?? type.values.join(", ")}`;
  }
}

function holderOf(doc: Doc, check: Check, except: ItemId, value: string): ItemId | null {
  const wanted = value.toLowerCase();
  const search = (parent: ItemId): ItemId | null => {
    for (const id of doc.items[parent].children) {
      if (isChecksItem(doc.items[id])) continue;
      if (id !== except && doc.items[id].properties[check.key]?.trim().toLowerCase() === wanted) return id;
      const inside = search(id);
      if (inside) return inside;
    }
    return null;
  };
  return search(check.ruled);
}

/** The properties of the item that break their check, by key. */
export function problemsOfItem(doc: Doc, id: ItemId): Map<string, string> {
  const problems = new Map<string, string>();
  const checks = checksFor(doc, id);
  if (checks.size === 0) return problems;
  for (const [key, value] of Object.entries(doc.items[id].properties)) {
    const problem = problemWith(doc, id, key, value);
    if (problem) problems.set(key, problem);
  }
  return problems;
}

/** The `:key: value` lines of a note that its checks refuse, as messages. */
export function refusedInNote(doc: Doc, id: ItemId): string[] {
  const { properties } = splitPropertyLines(doc.items[id].note);
  return [...properties].flatMap(([key, value]) => problemWith(doc, id, key, value) ?? []);
}

// ---- writing a check ---------------------------------------------------------------------

/** A key or a type word offered while a check is written. */
export function typeWordsOffered(): string[] {
  return [...WORDS, ...WORDS.map((word) => `unique ${word}`)];
}

/** What follows `key: ` so far starts some valid type: typing anything else is refused. */
export function startsAValidType(rest: string): boolean {
  const lower = rest.toLowerCase();
  if (typeWordsOffered().some((word) => word.startsWith(lower))) return true;
  return /^(?:unique )?one of (?:-?\d*(?:\.{1,2}-?\d*)?)$/.test(lower);
}

/** The key being checked on one row of a `Checks:` item, and where its type begins in the text. */
export function typePartOf(text: string): { key: string; typeStart: number } | null {
  const written = /^([\p{L}\p{N}_-]+):( ?)/u.exec(text);
  return written ? { key: written[1], typeStart: written[0].length } : null;
}
