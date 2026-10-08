import { Doc, ItemId, ViewFilter, ancestors, shownChildren } from "./model";
import { Formula, FormulaError, Scope, evaluate, parseFormula } from "./formula";

/*
 * Properties are `:key: value` lines in an item's note (doc/adr/0017, 0020). This
 * module reads and writes them, understands their values as numbers or
 * durations, and computes the rollups a column view shows.
 */

const PROPERTY_LINE = /^:([\p{L}\p{N}_-]+):[ \t]*(.*)$/u;

export function propertyLine(line: string): { key: string; value: string } | null {
  const match = PROPERTY_LINE.exec(line.trim());
  return match ? { key: match[1].toLowerCase(), value: match[2].trim() } : null;
}

/** Every property in a note, keyed in lower case; a key written twice keeps its last value. */
export function propertiesOf(note: string): Map<string, string> {
  const properties = new Map<string, string>();
  for (const line of linesOutsideCode(note)) {
    const property = propertyLine(line);
    if (property) properties.set(property.key, property.value);
  }
  return properties;
}

function linesOutsideCode(note: string): string[] {
  let inCode = false;
  return note.split("\n").filter((line) => {
    if (/^\s*```/.test(line)) inCode = !inCode;
    return !inCode && !/^\s*```/.test(line);
  });
}

/** The note with `key` set to `value`: the existing line is rewritten, a new one appended, an empty value removes it. */
export function setProperty(note: string, key: string, value: string): string {
  const wanted = key.toLowerCase();
  const lines = note === "" ? [] : note.split("\n");
  const index = lines.findLastIndex((line) => propertyLine(line)?.key === wanted);
  const written = `:${key}: ${value.trim()}`;
  if (value.trim() === "") return lines.filter((_, i) => i !== index).join("\n");
  if (index === -1) return [...lines, written].join("\n");
  return lines.map((line, i) => (i === index ? written : line)).join("\n");
}

// ---- values -------------------------------------------------------------------------------

export type Amount = { kind: "number"; value: number; unit: string } | { kind: "duration"; minutes: number; clock?: boolean };

const DURATION_PARTS = /^(?:(\d+(?:\.\d+)?)\s*d)?\s*(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?$/i;
const CLOCK = /^(\d+):([0-5]\d)$/;
const NUMBER = /^(-?\d[\d,]*(?:\.\d+)?)\s*(.*)$/;
const THOUSANDS = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const HOURS_AND_MINUTES = /^(\d+)\s*h\s*(\d{1,2})$/i;

export function parseAmount(raw: string): Amount | null {
  const text = raw.trim();
  if (!text) return null;
  const clock = CLOCK.exec(text);
  if (clock) return { kind: "duration", minutes: Number(clock[1]) * 60 + Number(clock[2]), clock: true };
  const hoursAndMinutes = HOURS_AND_MINUTES.exec(text);
  if (hoursAndMinutes) return { kind: "duration", minutes: Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2]) };
  const parts = DURATION_PARTS.exec(text);
  if (parts && (parts[1] || parts[2] || parts[3])) {
    const [days, hours, minutes] = [parts[1], parts[2], parts[3]].map((part) => Number(part ?? 0));
    return { kind: "duration", minutes: Math.round(days * 1440 + hours * 60 + minutes) };
  }
  const number = NUMBER.exec(text);
  if (number) return { kind: "number", value: numberFrom(number[1]), unit: number[2].trim() };
  return null;
}

/** "1,200" is twelve hundred, "1,5" one and a half. */
function numberFrom(digits: string): number {
  return Number(THOUSANDS.test(digits) ? digits.replaceAll(",", "") : digits.replace(",", "."));
}

export function formatAmount(amount: Amount): string {
  if (amount.kind === "duration") {
    const hours = Math.floor(amount.minutes / 60);
    const minutes = amount.minutes % 60;
    if (amount.clock) return `${hours % 24}:${String(minutes).padStart(2, "0")}`;
    if (hours === 0) return `${minutes}m`;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  const value = Number.isInteger(amount.value) ? String(amount.value) : String(Math.round(amount.value * 100) / 100);
  return amount.unit ? `${value} ${amount.unit}` : value;
}

// ---- columns --------------------------------------------------------------------------------

export type Summary = "sum" | "min" | "max" | "mean";

export interface Column {
  key: string;
  summary: Summary;
  /** A computed column (doc/adr/0022): what fills the rows below the page that have no value of their own. */
  formula?: Formula | FormulaError;
  formulaSource?: string;
}

const SUMMARIES: Record<string, Summary> = { "+": "sum", ":": "sum", sum: "sum", min: "min", max: "max", mean: "mean", avg: "mean" };

/** Reads `effort{+} calories{mean} weight start{=parent.start + before(effort)}` into columns; a column without braces sums. */
export function parseColumns(spec: string): Column[] {
  return [...spec.matchAll(/([\p{L}\p{N}_-]+)(?:\{([^}]*)\})?/gu)].map((match) => {
    const key = match[1].toLowerCase();
    const braces = (match[2] ?? "+").trim();
    if (braces.startsWith("=")) return { key, summary: "sum", formula: formulaOrError(braces.slice(1)), formulaSource: braces.slice(1).trim() };
    return { key, summary: SUMMARIES[braces.toLowerCase().replace(/^:(?=.)/, "")] ?? "sum" };
  });
}

function formulaOrError(source: string): Formula | FormulaError {
  try {
    return parseFormula(source);
  } catch (error) {
    if (error instanceof FormulaError) return error;
    throw error;
  }
}

/** Columns from a `columns::` property on the page or its nearest ancestor that has one. */
export function declaredColumns(doc: Doc, page: ItemId): Column[] | null {
  for (const id of [page, ...ancestors(doc, page).reverse()]) {
    const spec = propertiesOf(doc.items[id].note).get("columns");
    if (spec) return parseColumns(spec);
  }
  return null;
}

/** Every property key used under `top`, in the order they first appear, summed. */
export function inferredColumns(doc: Doc, top: ItemId): Column[] {
  const keys = new Set<string>();
  const walk = (id: ItemId) => {
    for (const key of propertiesOf(doc.items[id].note).keys()) if (key !== "columns") keys.add(key);
    doc.items[id].children.forEach(walk);
  };
  doc.items[top].children.forEach(walk);
  return [...keys].map((key) => ({ key, summary: "sum" }));
}

// ---- rollups ---------------------------------------------------------------------------------

export interface Cell {
  text: string;
  /** True when the value summarises the item's descendants rather than being its own. */
  rolled: boolean;
  computed?: boolean;
  error?: string;
}

type Value = { amount: Amount | null; cell: Cell | null };

/**
 * The cell of every column for `top` and everything under it. An item whose
 * children have values shows their summary, recursively; otherwise its own
 * value. A computed column fills, below `top`, the items without a value of
 * their own from its formula. Items the view hides (completed ones, when
 * those are hidden) count for nothing.
 */
export function columnCells(
  doc: Doc,
  top: ItemId,
  columns: Column[],
  filter: ViewFilter = { showCompleted: true },
): Map<ItemId, Map<string, Cell>> {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const known = new Map<string, Value>();
  const computing = new Set<string>();
  const children = (id: ItemId) => shownChildren(doc, id, filter);

  const valueOf = (id: ItemId, key: string): Value => {
    const slot = `${id}\u0000${key}`;
    const found = known.get(slot);
    if (found) return found;
    if (computing.has(slot)) throw new FormulaError(`${key} depends on itself`);
    computing.add(slot);
    try {
      const value = freshValue(id, key);
      known.set(slot, value);
      return value;
    } finally {
      computing.delete(slot);
    }
  };

  const freshValue = (id: ItemId, key: string): Value => {
    const column = byKey.get(key) ?? { key, summary: "sum" as Summary };
    const raw = propertiesOf(doc.items[id].note).get(key);
    if (column.formula && raw === undefined && id !== top) return computed(id, column.formula);
    const fromChildren = () => children(id).flatMap((child) => valueOf(child, key).amount ?? []);
    const summary = column.formula ? null : summarize(fromChildren(), column.summary);
    if (summary) return { amount: summary, cell: { text: formatAmount(summary), rolled: true } };
    if (raw === undefined) return { amount: null, cell: null };
    const amount = parseAmount(raw);
    return { amount, cell: { text: amount ? formatAmount(amount) : raw, rolled: false } };
  };

  const computed = (id: ItemId, formula: Formula | FormulaError): Value => {
    try {
      if (formula instanceof FormulaError) throw formula;
      const amount = evaluate(formula, scopeOf(id));
      return { amount, cell: amount ? { text: formatAmount(amount), rolled: false, computed: true } : null };
    } catch (error) {
      if (!(error instanceof FormulaError)) throw error;
      return { amount: null, cell: { text: "error", rolled: false, computed: true, error: error.message } };
    }
  };

  const scopeOf = (id: ItemId): Scope => {
    const parent = doc.items[id].parent;
    const siblings = parent ? children(parent) : [id];
    const earlier = siblings.slice(0, siblings.indexOf(id));
    const amounts = (ids: ItemId[], key: string) => ids.flatMap((other) => valueOf(other, key).amount ?? []);
    return {
      value: (of, key) => {
        const target = of === "self" ? id : of === "parent" ? parent : (earlier.at(-1) ?? null);
        return target ? valueOf(target, key).amount : null;
      },
      before: (key) => amounts(earlier, key),
      children: (key) => amounts(children(id), key),
    };
  };

  const cells = new Map<ItemId, Map<string, Cell>>();
  const visit = (id: ItemId) => {
    const row = new Map<string, Cell>();
    for (const column of columns) {
      const cell = valueOf(id, column.key).cell;
      if (cell) row.set(column.key, cell);
    }
    cells.set(id, row);
    children(id).forEach(visit);
  };
  visit(top);
  return cells;
}

/**
 * Combines amounts of the first one's kind. Numbers share the first unit
 * any of them names; plain numbers count with it ("200" and "300 kcal" make
 * "500 kcal"), numbers in another unit are left out.
 */
function summarize(amounts: Amount[], summary: Summary): Amount | null {
  if (amounts.length === 0) return null;
  const kind = amounts[0].kind;
  const unit = amounts.flatMap((amount) => (amount.kind === "number" && amount.unit ? [amount.unit] : []))[0] ?? "";
  const values = amounts.flatMap((amount) => {
    if (amount.kind !== kind) return [];
    if (amount.kind === "duration") return [amount.minutes];
    return amount.unit === "" || amount.unit === unit ? [amount.value] : [];
  });
  const combined =
    summary === "min"
      ? Math.min(...values)
      : summary === "max"
        ? Math.max(...values)
        : values.reduce((total, value) => total + value, 0) / (summary === "mean" ? values.length : 1);
  return kind === "duration" ? { kind, minutes: Math.round(combined) } : { kind, value: combined, unit };
}
