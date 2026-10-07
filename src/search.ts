import { Doc, ItemId, ROOT, ViewFilter, ancestors, isShown } from "./model";

export interface Candidate {
  id: ItemId;
  text: string;
  path: string[];
}

/**
 * Items anywhere in the outline whose text contains every term, best first:
 * text starting with the query, then shallower items, then reading order.
 */
export function findItems(doc: Doc, query: string, limit: number, exclude: (id: ItemId) => boolean = () => false): Candidate[] {
  const terms = searchTerms(query);
  const needle = query.trim().toLowerCase();
  const found: { candidate: Candidate; score: number }[] = [];
  let order = 0;
  const walk = (id: ItemId, depth: number) => {
    for (const child of doc.items[id].children) {
      order += 1;
      if (exclude(child)) continue;
      const text = doc.items[child].text;
      const lower = text.toLowerCase();
      if (text.trim() && terms.every((term) => lower.includes(term))) {
        const score = matchQuality(lower, needle) + depth * 100 + order / 1e6;
        found.push({ candidate: { id: child, text, path: pathOf(doc, child) }, score });
      }
      walk(child, depth + 1);
    }
  };
  walk(ROOT, 0);
  return found
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

function matchQuality(text: string, needle: string): number {
  if (!needle || text.startsWith(needle)) return 0;
  const wordStarts = searchTerms(needle).every((term) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(text),
  );
  return wordStarts ? 1000 : 2000;
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
 * Items under `top` whose text or note contains every term, plus their
 * ancestors so each match is seen in context.
 */
export function search(doc: Doc, top: ItemId, query: string, filter: ViewFilter): SearchResult {
  const terms = searchTerms(query);
  const matches = new Set<ItemId>();
  const shown = new Set<ItemId>();

  const walk = (id: ItemId): boolean => {
    let anyBelow = false;
    for (const child of doc.items[id].children) {
      if (!isShown(doc, child, filter)) continue;
      const item = doc.items[child];
      const haystack = `${item.text}\n${item.note}`.toLowerCase();
      const isMatch = terms.every((term) => haystack.includes(term));
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
