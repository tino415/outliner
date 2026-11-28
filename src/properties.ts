import { Doc, ItemId, SETTINGS, ViewFilter, ancestors, childrenInOrder, isDescendant, isShown, shownChildren } from "./model";
import { readWrittenDate } from "./dates";
import { onlyReference, resolveReference } from "./references";
import { Formula, FormulaError, PLAIN_ZERO, Scope, add, evaluate, parseFormula, positionMistypedAs } from "./formula";

/*
 * Properties are an item's `key: value` pairs (doc/adr/0032). This module
 * understands their values as numbers or
 * durations, and computes the rollups a column view shows.
 */

// ---- values -------------------------------------------------------------------------------

export type Amount = { kind: "number"; value: number; unit: string } | { kind: "duration"; minutes: number; clock?: boolean };

const DURATION_PARTS = /^(?:(\d+(?:\.\d+)?)\s*d)?\s*(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?$/i;
const CLOCK = /^(\d+):([0-5]\d)$/;
const NUMBER = /^(-?\d[\d,]*(?:\.\d+)?)\s*(.*)$/;
const THOUSANDS = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const HOURS_AND_MINUTES = /^(\d+)\s*h\s*(\d{1,2})$/i;

export function parseAmount(raw: string): Amount | null {
  const text = raw.trim();
  if (!text || readWrittenDate(text)) return null;
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
    if (amount.clock) {
      const ofDay = ((amount.minutes % 1440) + 1440) % 1440;
      return `${Math.floor(ofDay / 60)}:${String(ofDay % 60).padStart(2, "0")}`;
    }
    const sign = amount.minutes < 0 ? "-" : "";
    const hours = Math.floor(Math.abs(amount.minutes) / 60);
    const minutes = Math.abs(amount.minutes) % 60;
    if (hours === 0) return `${sign}${minutes}m`;
    return sign + (minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`);
  }
  const value = Number.isInteger(amount.value) ? String(amount.value) : String(Math.round(amount.value * 100) / 100);
  return amount.unit ? `${value} ${amount.unit}` : value;
}

// ---- columns --------------------------------------------------------------------------------

export type Summary = "sum" | "min" | "max" | "mean";

export interface Column {
  key: string;
  /** Absent on a computed column that names no summary word: its parents do not roll up. */
  summary?: Summary;
  /** Computed values and summaries show as whole numbers. */
  round?: true;
  /** A computed column (doc/adr/0022): what fills the rows below the page that have no value of their own. */
  formula?: Formula | FormulaError;
  formulaSource?: string;
  /** The page whose `:columns:` holds the formula: only the items under it are filled. */
  declaredOn?: ItemId;
}

const SUMMARIES: Record<string, Summary> = { "+": "sum", ":": "sum", sum: "sum", min: "min", max: "max", mean: "mean", avg: "mean" };

/**
 * Reads `effort{+} calories{mean round} weight start{=parent.start + before(effort)} kcal{sum = grams * per100 / 100}`
 * into columns; a column without braces sums.
 */
export function parseColumns(spec: string): Column[] {
  return [...spec.matchAll(/([\p{L}\p{N}_-]+)(?:\{([^}]*)\})?/gu)].map((match) => {
    const key = match[1].toLowerCase();
    const [wordsSource, formulaSource] = splitAtFirst(match[2] ?? "", "=");
    const words = wordsSource.trim().split(/\s+/).filter(Boolean);
    const round = words.some((word) => word.toLowerCase() === "round") ? { round: true as const } : {};
    const summaries = words.filter((word) => word.toLowerCase() !== "round").map((word) => ({ word, summary: summaryNamed(word) }));
    const summary = summaries.find((named) => named.summary)?.summary;
    if (formulaSource === null) return { key, summary: summary ?? "sum", ...round };
    const unknown = summaries.find((named) => !named.summary)?.word;
    const formula = unknown ? new FormulaError(`unknown ${unknown}: use sum, min, max, mean or round`) : formulaOrError(formulaSource);
    return { key, ...(summary ? { summary } : {}), ...round, formula, formulaSource: formulaSource.trim() };
  });
}

function summaryNamed(word: string): Summary | undefined {
  return SUMMARIES[word.toLowerCase().replace(/^:(?=.)/, "")];
}

function splitAtFirst(text: string, separator: string): [string, string | null] {
  const at = text.indexOf(separator);
  return at < 0 ? [text, null] : [text.slice(0, at), text.slice(at + separator.length)];
}

/** A value written as "=…" is a formula of the item's own: its source, or null for a plain value. */
export function formulaIn(value: string | undefined): string | null {
  const written = value?.trim() ?? "";
  return written.startsWith("=") ? written.slice(1).trim() : null;
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
    const spec = doc.items[id].properties.columns;
    if (spec) return parseColumns(spec).map((column) => (column.formula ? { ...column, declaredOn: id } : column));
  }
  return null;
}

/** Every property key used under `top`, in the order they first appear, summed. */
export function inferredColumns(doc: Doc, top: ItemId): Column[] {
  const keys = new Set<string>();
  const walk = (id: ItemId) => {
    for (const key of Object.keys(doc.items[id].properties)) if (!SETTINGS.has(key)) keys.add(key);
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

type Value = { amount: Amount | null; cell: Cell | null; failure?: FormulaError };

class DependsOnItself extends FormulaError {
  constructor(
    key: string,
    readonly slot: string,
  ) {
    super(`${key} depends on itself`);
  }
}

/** The cell of every column for `top` and everything under it, as `cellsUnder` computes them. */
export function columnCells(doc: Doc, top: ItemId, columns: Column[], filter: ViewFilter = { showCompleted: true }): Map<ItemId, Map<string, Cell>> {
  const cellOf = cellsUnder(doc, top, columns, filter);
  const cells = new Map<ItemId, Map<string, Cell>>();
  const visit = (id: ItemId) => {
    const row = new Map<string, Cell>();
    for (const column of columns) {
      const cell = cellOf(id, column.key);
      if (cell) row.set(column.key, cell);
    }
    cells.set(id, row);
    shownChildren(doc, id, filter).forEach(visit);
  };
  visit(top);
  return cells;
}

/**
 * A lookup of the cell of any item for any key, computed when first asked
 * for, with what it reads, a linked item anywhere in the outline included.
 * An item whose children have values shows their summary, recursively;
 * otherwise its own value, or the result of its own "=…" formula. A computed
 * column fills, below the item that declares it (`top` when none does), the
 * items without a value of their own from its formula, and rolls up only when
 * it names a summary word; a key that is no column is summed. Children the
 * view hides (completed ones, when those are hidden) count for nothing.
 */
export function cellsUnder(doc: Doc, top: ItemId, columns: Column[], filter: ViewFilter = { showCompleted: true }): (id: ItemId, key: string) => Cell | null {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const known = new Map<string, Value>();
  const computing = new Set<string>();
  const children = (id: ItemId) => shownChildren(doc, id, filter);

  const valueOf = (id: ItemId, key: string): Value => {
    const slot = `${id}\u0000${key}`;
    const found = known.get(slot);
    if (found) return found;
    if (computing.has(slot)) throw new DependsOnItself(key, slot);
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
    const column: Column = byKey.get(key) ?? { key, summary: "sum" };
    const raw = doc.items[id].properties[key];
    const ownFormula = formulaIn(raw);
    if (ownFormula !== null) return computed(id, column, formulaOrError(ownFormula));
    const summary = column.summary ? summarize(children(id).flatMap((child) => valueOf(child, key).amount ?? []), column.summary) : null;
    if (summary) return { amount: summary, cell: { text: shownAmount(summary, column), rolled: true } };
    const formulaApplies = column.formula && raw === undefined && isDescendant(doc, id, column.declaredOn ?? top);
    if (formulaApplies) return computed(id, column, column.formula!);
    if (raw === undefined) return { amount: null, cell: null };
    const amount = parseAmount(raw);
    return { amount, cell: { text: amount ? formatAmount(amount) : raw, rolled: false } };
  };

  const computed = (id: ItemId, column: Column, formula: Formula | FormulaError): Value => {
    try {
      if (formula instanceof FormulaError) throw formula;
      const amount = evaluate(formula, scopeOf(id));
      return { amount, cell: amount ? { text: shownAmount(amount, column), rolled: false, computed: true } : null };
    } catch (error) {
      if (!(error instanceof FormulaError)) throw error;
      return { amount: null, cell: { text: "error", rolled: false, computed: true, error: error.message }, failure: error };
    }
  };

  const shownAmount = (amount: Amount, column: Column): string =>
    formatAmount(column.round && amount.kind === "number" ? { ...amount, value: Math.round(amount.value) } : amount);

  /** A value a formula reads; a dependency in error makes the formula an error too, and one in a loop still being computed puts it in the loop. */
  const amountOf = (id: ItemId, key: string): Amount | null => {
    const value = valueOf(id, key);
    if (value.failure instanceof DependsOnItself && computing.has(value.failure.slot)) throw value.failure;
    if (value.cell?.error) throw new FormulaError(`${key} is an error: ${value.cell.error}`);
    return value.amount;
  };

  const linkedBy = (id: ItemId, key: string, read: string): ItemId | null => {
    const raw = doc.items[id].properties[key];
    const meant = positionMistypedAs(key);
    if (raw === undefined && meant) throw new FormulaError(`${key} looks like ${meant}: write ${meant}.${read}`);
    if (raw === undefined) return null;
    const reference = onlyReference(raw);
    if (!reference) throw new FormulaError(`${key} is not a link`);
    const target = resolved(reference.target);
    if (!target) throw new FormulaError(`${key} links an item that is not here`);
    return target;
  };

  const targets = new Map<string, ItemId | null>();
  const resolved = (target: string): ItemId | null => {
    if (!targets.has(target)) targets.set(target, resolveReference(doc, target));
    return targets.get(target)!;
  };

  const previousOf = new Map<ItemId, ItemId | null>();
  const previousSibling = (id: ItemId): ItemId | null => {
    const parent = doc.items[id].parent;
    if (!previousOf.has(id)) {
      const siblings = parent ? children(parent) : [id];
      siblings.forEach((sibling, index) => previousOf.set(sibling, siblings[index - 1] ?? null));
      if (!previousOf.has(id)) previousOf.set(id, shownBefore(parent!, id));
    }
    return previousOf.get(id) ?? null;
  };

  /** A linked item the view hides follows the shown sibling above it. */
  const shownBefore = (parent: ItemId, id: ItemId): ItemId | null => {
    const siblings = childrenInOrder(doc, parent);
    return siblings.slice(0, siblings.indexOf(id)).filter((sibling) => isShown(doc, sibling, filter)).at(-1) ?? null;
  };

  const totals = new Map<string, Amount>();
  const totalBefore = (id: ItemId, key: string): Amount => {
    const slot = `${id}\u0000${key}`;
    const known = totals.get(slot);
    if (known) return known;
    const previous = previousSibling(id);
    const total = previous ? add(totalBefore(previous, key), amountOf(previous, key) ?? PLAIN_ZERO) : PLAIN_ZERO;
    totals.set(slot, total);
    return total;
  };

  const scopeOf = (id: ItemId): Scope => {
    const parent = doc.items[id].parent;
    return {
      value: (of, key) => {
        const target = of === "self" ? id : of === "parent" ? parent : of === "previous" ? previousSibling(id) : linkedBy(id, of.link, key);
        return target ? amountOf(target, key) : null;
      },
      totalBefore: (key) => totalBefore(id, key),
      children: (key) => children(id).flatMap((child) => amountOf(child, key) ?? []),
    };
  };

  return (id, key) => valueOf(id, key).cell;
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
