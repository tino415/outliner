import { Doc, ItemId, ancestors } from "./model";

/*
 * Properties are `key:: value` lines in an item's note (doc/adr/0017). This
 * module reads and writes them, understands their values as numbers or
 * durations, and computes the rollups a column view shows.
 */

const PROPERTY_LINE = /^([\p{L}\p{N}_-]+)::[ \t]*(.*)$/u;

export function propertyLine(line: string): { key: string; value: string } | null {
  const match = PROPERTY_LINE.exec(line.trim());
  return match ? { key: match[1].toLowerCase(), value: match[2].trim() } : null;
}

/** Every property in a note, keyed in lower case; a key written twice keeps its last value. */
export function propertiesOf(note: string): Map<string, string> {
  const properties = new Map<string, string>();
  for (const line of note.split("\n")) {
    const property = propertyLine(line);
    if (property) properties.set(property.key, property.value);
  }
  return properties;
}

/** The note with `key` set to `value`: the existing line is rewritten, a new one appended, an empty value removes it. */
export function setProperty(note: string, key: string, value: string): string {
  const wanted = key.toLowerCase();
  const lines = note === "" ? [] : note.split("\n");
  const index = lines.findIndex((line) => propertyLine(line)?.key === wanted);
  const written = `${key}:: ${value.trim()}`;
  if (value.trim() === "") return lines.filter((_, i) => i !== index).join("\n");
  if (index === -1) return [...lines, written].join("\n");
  return lines.map((line, i) => (i === index ? written : line)).join("\n");
}

// ---- values -------------------------------------------------------------------------------

export type Amount = { kind: "number"; value: number; unit: string } | { kind: "duration"; minutes: number };

const DURATION_PARTS = /^(?:(\d+(?:\.\d+)?)\s*d)?\s*(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?$/i;
const CLOCK = /^(\d+):([0-5]\d)$/;
const NUMBER = /^(-?\d+(?:[.,]\d+)?)\s*(.*)$/;

export function parseAmount(raw: string): Amount | null {
  const text = raw.trim();
  if (!text) return null;
  const clock = CLOCK.exec(text);
  if (clock) return { kind: "duration", minutes: Number(clock[1]) * 60 + Number(clock[2]) };
  const parts = DURATION_PARTS.exec(text);
  if (parts && (parts[1] || parts[2] || parts[3])) {
    const [days, hours, minutes] = [parts[1], parts[2], parts[3]].map((part) => Number(part ?? 0));
    return { kind: "duration", minutes: Math.round(days * 1440 + hours * 60 + minutes) };
  }
  const number = NUMBER.exec(text);
  if (number) return { kind: "number", value: Number(number[1].replace(",", ".")), unit: number[2].trim() };
  return null;
}

export function formatAmount(amount: Amount): string {
  if (amount.kind === "duration") {
    const hours = Math.floor(amount.minutes / 60);
    const minutes = amount.minutes % 60;
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
}

const SUMMARIES: Record<string, Summary> = { "+": "sum", ":": "sum", sum: "sum", min: "min", max: "max", mean: "mean", avg: "mean" };

/** Reads `effort{+} calories{mean} weight` into columns; a column without braces sums. */
export function parseColumns(spec: string): Column[] {
  return [...spec.matchAll(/([\p{L}\p{N}_-]+)(?:\{([^}]*)\})?/gu)].map((match) => ({
    key: match[1].toLowerCase(),
    summary: SUMMARIES[(match[2] ?? "+").trim().toLowerCase()] ?? "sum",
  }));
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
}

/**
 * The cell of every column for `top` and everything under it. An item whose
 * children have values shows their summary, recursively; otherwise its own
 * value. Only amounts of the same kind and unit as the first one are combined.
 */
export function columnCells(doc: Doc, top: ItemId, columns: Column[]): Map<ItemId, Map<string, Cell>> {
  const cells = new Map<ItemId, Map<string, Cell>>();
  const amounts = new Map<string, Amount | null>();

  const visit = (id: ItemId) => {
    const item = doc.items[id];
    item.children.forEach(visit);
    const own = propertiesOf(item.note);
    const row = new Map<string, Cell>();
    for (const column of columns) {
      const fromChildren = item.children
        .map((child) => amounts.get(`${child}\u0000${column.key}`))
        .filter((amount): amount is Amount => Boolean(amount));
      const summary = summarize(fromChildren, column.summary);
      const raw = own.get(column.key);
      const amount = summary ?? (raw === undefined ? null : parseAmount(raw));
      amounts.set(`${id}\u0000${column.key}`, amount);
      if (summary) row.set(column.key, { text: formatAmount(summary), rolled: true });
      else if (raw !== undefined) row.set(column.key, { text: amount ? formatAmount(amount) : raw, rolled: false });
    }
    cells.set(id, row);
  };
  visit(top);
  return cells;
}

function summarize(amounts: Amount[], summary: Summary): Amount | null {
  if (amounts.length === 0) return null;
  const first = amounts[0];
  const alike = amounts.filter((amount) =>
    first.kind === "duration" ? amount.kind === "duration" : amount.kind === "number" && amount.unit === first.unit,
  );
  const values = alike.map((amount) => (amount.kind === "duration" ? amount.minutes : amount.value));
  const combined =
    summary === "min"
      ? Math.min(...values)
      : summary === "max"
        ? Math.max(...values)
        : values.reduce((total, value) => total + value, 0) / (summary === "mean" ? values.length : 1);
  return first.kind === "duration"
    ? { kind: "duration", minutes: Math.round(combined) }
    : { kind: "number", value: combined, unit: first.unit };
}
