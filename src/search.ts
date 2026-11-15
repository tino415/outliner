import { Doc, Item, ItemId, ROOT, ViewFilter, ancestors, isShown } from "./model";
import { dateFilter } from "./dates";

export interface Candidate {
  id: ItemId;
  text: string;
  path: string[];
}

/**
 * Items anywhere in the outline matching the query, best first: text starting
 * with the query, then shallower items, then reading order. Matching means
 * containing every term, or for a path query (see `pathTier`) matching the
 * item's ancestors too.
 */
export function findItems(doc: Doc, query: string, limit: number, exclude: (id: ItemId) => boolean = () => false): Candidate[] {
  const terms = searchTerms(query);
  const path = isPathQuery(query) ? pathTier(query) : null;
  const quality = matchQuality(path ? path.ownPart : query);
  const found: { id: ItemId; score: number }[] = [];
  const above: string[] = [];
  let order = 0;
  const walk = (id: ItemId, depth: number) => {
    for (const child of doc.items[id].children) {
      order += 1;
      if (exclude(child)) continue;
      const text = doc.items[child].text;
      const lower = text.trim().toLowerCase();
      const tier = lower ? path?.tierOf(lower, above) ?? literalTier(lower, terms) : null;
      if (tier !== null) found.push({ id: child, score: tier * PATH_TIER + quality(lower) + depth * 100 + order / 1e6 });
      above.push(lower);
      walk(child, depth + 1);
      above.pop();
    }
  };
  walk(ROOT, 0);
  return found
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ id }) => ({ id, text: doc.items[id].text, path: pathOf(doc, id) }));
}

const PATH_TIER = 1e6;
const STRICT = 0;
const LOOSE = 1;
const LITERAL = 2;

function literalTier(lower: string, terms: string[]): number | null {
  return terms.every((term) => lower.includes(term)) ? LITERAL : null;
}

/**
 * A slash separates levels. Strict: the parts are a substring of the path,
 * so the first ends an ancestor's title, middle ones equal whole titles and
 * the last starts the item's own. Loose: the parts appear in titles top to
 * bottom, levels may be skipped. A leading or trailing slash is strict only.
 */
function pathTier(query: string): { ownPart: string; tierOf: (lower: string, above: string[]) => number | null } {
  const parts = query.toLowerCase().split("/").map((part) => part.trim());
  const anchored = parts[0] === "" || parts[parts.length - 1] === "";
  const strictParts = parts.length > 1 && parts[0] === "" ? parts.slice(1) : parts;
  const looseTerms = parts.map(searchTerms);
  const tierOf = (lower: string, above: string[]) => {
    if (isStrictPath(strictParts, lower, above)) return STRICT;
    if (!anchored && isLoosePath(looseTerms, lower, above)) return LOOSE;
    return null;
  };
  return { ownPart: parts[parts.length - 1], tierOf };
}

export function isPathQuery(query: string): boolean {
  return query.includes("/") && query.split("/").some((part) => part.trim());
}

function isStrictPath(parts: string[], lower: string, above: string[]): boolean {
  const last = parts[parts.length - 1];
  const parents = parts.slice(0, -1);
  if (!lower.startsWith(last) || above.length < parents.length) return false;
  const nearest = above.slice(above.length - parents.length);
  return parents.every((part, i) => (i === 0 ? nearest[i].endsWith(part) : nearest[i] === part));
}

function isLoosePath(parts: string[][], lower: string, above: string[]): boolean {
  const containsAll = (terms: string[], title: string) => terms.every((term) => title.includes(term));
  if (!containsAll(parts[parts.length - 1], lower)) return false;
  let next = 0;
  for (const title of above) {
    if (next < parts.length - 1 && containsAll(parts[next], title)) next += 1;
  }
  return next === parts.length - 1;
}

/** Text starting with the query ranks first, then text where every term starts a word, then the rest. */
function matchQuality(query: string): (text: string) => number {
  const needle = query.trim().toLowerCase();
  const wordStarts = searchTerms(needle).map(
    (term) => new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u"),
  );
  return (text) => {
    if (!needle || text.startsWith(needle)) return 0;
    return wordStarts.every((pattern) => pattern.test(text)) ? 1000 : 2000;
  };
}

export function pathOf(doc: Doc, id: ItemId): string[] {
  return ancestors(doc, id)
    .filter((ancestor) => ancestor !== ROOT)
    .map((ancestor) => doc.items[ancestor].text || "Untitled");
}

export interface SearchResult {
  matches: Set<ItemId>;
  shown: Set<ItemId>;
  terms: string[];
}

export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Items under `top` whose text or note contains every term and that pass
 * every date word (`due:today`, `is:overdue`), plus their ancestors so each
 * match is seen in context.
 */
export function search(doc: Doc, top: ItemId, query: string, filter: ViewFilter): SearchResult {
  const { terms, passes } = readQuery(query);
  const matches = new Set<ItemId>();
  const shown = new Set<ItemId>();

  const walk = (id: ItemId): boolean => {
    let anyBelow = false;
    for (const child of doc.items[id].children) {
      if (!isShown(doc, child, filter)) continue;
      const item = doc.items[child];
      const haystack = `${item.text}\n${item.note}`.toLowerCase();
      const isMatch = terms.every((term) => haystack.includes(term)) && passes(item);
      if (isMatch) matches.add(child);
      if (walk(child) || isMatch) {
        shown.add(child);
        anyBelow = true;
      }
    }
    return anyBelow;
  };
  walk(top);
  return { matches, shown, terms };
}

function readQuery(query: string): { terms: string[]; passes: (item: Item) => boolean } {
  const words = query.split(/\s+/).filter(Boolean);
  const filters = words.map((word) => dateFilter(word));
  const terms = words.filter((_, index) => !filters[index]).map((word) => word.toLowerCase());
  const dateFilters = filters.filter((each) => each !== null);
  return { terms, passes: (item) => dateFilters.every((passes) => passes(item)) };
}
