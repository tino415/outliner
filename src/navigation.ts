import { ItemId, ROOT, ancestors } from "./model";
import { Candidate, SearchResult, findItems, pathOf, search } from "./search";
import { openPalette } from "./palette";
import { Command } from "./keys";
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

type JumpOption = { item: Candidate; text: string; path: string[] } | { command: Command; text: string; path: string[]; shortcut: string };

export function jumpToItem(commands: Command[]): void {
  const asOption = (item: Candidate): JumpOption => ({ item, text: item.text, path: item.path });
  const recent = (): Candidate[] =>
    state.recent
      .filter((id) => doc().items[id])
      .map((id) => ({ id, text: doc().items[id].text, path: pathOf(doc(), id) }));
  openPalette<JumpOption>({
    placeholder: "Jump to…, or > for commands",
    hint: "↑ ↓ or Ctrl N / P to choose · Enter to open · Esc to close",
    candidates: (query) => {
      if (query.startsWith(">")) return matchingCommands(commands, query.slice(1), Infinity);
      if (query.trim()) return [...matchingCommands(commands, query, 5), ...findItems(doc(), query, 40).map(asOption)];
      const seen = new Set(state.recent);
      return [...recent(), ...findItems(doc(), "", 30, (id) => seen.has(id))].map(asOption);
    },
    choose: (option) => ("command" in option ? option.command.run() : zoomTo(option.item.id)),
  });
}

function matchingCommands(commands: Command[], query: string, limit: number): JumpOption[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return commands
    .filter((command) => terms.every((term) => command.label.toLowerCase().includes(term)))
    .slice(0, limit)
    .map((command) => ({ command, text: command.label, path: [], shortcut: command.shortcut }));
}

