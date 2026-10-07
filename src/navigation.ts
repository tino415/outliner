import { ItemId, ROOT, ancestors } from "./model";
import { Candidate, SearchResult, findItems, pathOf, search } from "./search";
import { openPalette } from "./palette";
import { Focus, doc, filter, isUnder, state, ui } from "./app";
import { render, replayAnimation } from "./render";

export function zoomFromHash(): ItemId {
  let id = "";
  try {
    id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  } catch {
    return ROOT;
  }
  return id && doc().items[id] ? id : ROOT;
}

let pendingZoomFocus: Focus | null = null;

export function zoomTo(id: ItemId, focus: Focus | null = null): void {
  pendingZoomFocus = focus;
  const hash = id === ROOT ? "#/" : `#/${encodeURIComponent(id)}`;
  if (location.hash === hash || (id === ROOT && location.hash === "")) {
    showZoom();
  } else {
    location.hash = hash;
  }
}

export function showZoom(): void {
  const focus = pendingZoomFocus;
  pendingZoomFocus = null;
  const changed = state.zoom !== zoomFromHash();
  state.zoom = zoomFromHash();
  if (changed && state.query) changeQuery("");
  if (changed && state.zoom !== ROOT) state.recent = [state.zoom, ...state.recent.filter((id) => id !== state.zoom)].slice(0, 8);
  render(focus);
  if (changed) {
    replayAnimation(ui.tree, "entering");
    if (!focus) window.scrollTo({ top: 0 });
  }
}

export function setQuery(query: string): void {
  changeQuery(query);
  render(null);
}

function changeQuery(query: string): void {
  state.query = query;
  if (ui.search.value !== query) ui.search.value = query;
  state.keptInResults.clear();
}

/**
 * Search results, plus every item edited while this query is active, so that
 * an item does not vanish under the caret because it stopped matching.
 */
export function searchResults(focus: Focus | null): SearchResult | null {
  if (!state.query.trim()) return null;
  if (focus && focus.id !== state.zoom) state.keptInResults.add(focus.id);
  const results = search(doc(), state.zoom, state.query, filter());
  for (const id of state.keptInResults) {
    if (!doc().items[id] || !isUnder(id, state.zoom)) continue;
    for (const shown of [id, ...ancestors(doc(), id)]) if (shown !== state.zoom && isUnder(shown, state.zoom)) results.shown.add(shown);
  }
  return results;
}

export function jumpToItem(): void {
  const recent = (): Candidate[] =>
    state.recent
      .filter((id) => doc().items[id])
      .map((id) => ({ id, text: doc().items[id].text, path: pathOf(doc(), id) }));
  openPalette({
    placeholder: "Jump to…",
    hint: "↑ ↓ to choose · Enter to open · Esc to close",
    candidates: (query) => {
      if (query.trim()) return findItems(doc(), query, 40);
      const seen = new Set(state.recent);
      return [...recent(), ...findItems(doc(), "", 30, (id) => seen.has(id))];
    },
    choose: (candidate) => zoomTo(candidate.id),
  });
}

