import { Doc, ItemId, ViewFilter, isShown } from "./model";

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
