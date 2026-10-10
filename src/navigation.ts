import { ItemId, ROOT, ancestors } from "./model";
import { Candidate, SearchResult, findItems, pathOf, search } from "./search";
import { openPalette } from "./palette";
import { plainText } from "./inline";
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

export type SearchMode = "All" | "Items" | "Commands";

/** One search for items and commands, as GitHub's Ctrl-K: Tab narrows it to items or commands; ">" still means commands. */
export function searchEverything(commands: Command[], mode: SearchMode = "All"): void {
  openPalette<JumpOption>({
    placeholder: "Search items and commands",
    hint: "Tab: All · Items · Commands · ↑ ↓ or Ctrl N / P to choose · Enter to open",
    modes: ["All", "Items", "Commands"],
    mode,
    candidates: (query, chosen) => {
      if (query.startsWith(">")) return matchingCommands(commands, query.slice(1));
      if (chosen === "Items") return matchingItems(query);
      if (chosen === "Commands") return matchingCommands(commands, query);
      const items = matchingItems(query);
      const found = matchingCommands(commands, query);
      if (!query.trim() || items.some((option) => startsWithQuery(option.text, query))) return [...items, ...found];
      const strong = found.filter((option) => "command" in option && namesIt(option.command, query) && !DESTROYS.test(option.command.label)).slice(0, 3);
      return [...strong, ...items, ...found.filter((option) => !strong.includes(option))];
    },
    choose: (option) => ("command" in option ? option.command.run() : zoomTo(option.item.id)),
  });
}

function matchingItems(query: string): JumpOption[] {
  const asOption = (item: Candidate): JumpOption => ({ item, text: item.text, path: item.path });
  if (query.trim()) return findItems(doc(), query, 40).map(asOption);
  const recent = state.recent.filter((id) => doc().items[id]).map((id) => ({ id, text: doc().items[id].text, path: pathOf(doc(), id) }));
  const seen = new Set(state.recent);
  return [...recent, ...findItems(doc(), "", 30, (id) => seen.has(id))].map(asOption);
}

function matchingCommands(commands: Command[], query: string): JumpOption[] {
  const terms = words(query);
  return commands
    .filter((command) => terms.every((term) => command.label.toLowerCase().includes(term)))
    .map((command) => ({ command, text: command.label, path: [], shortcut: command.shortcut }));
}

/** Commands Enter must never reach by surprise: they stay below the items, whatever was typed. */
const DESTROYS = /\b(delete|clear|remove)\b/i;

/** An item named by what was typed is what Enter opens, never a command of that name: "delete" must not delete. */
function startsWithQuery(text: string, query: string): boolean {
  return plainText(text).toLowerCase().startsWith(query.trim().toLowerCase());
}

/** Every word typed starts a word of the command's name: "board" names "Show this page as a board". */
function namesIt(command: Command, query: string): boolean {
  const named = words(command.label);
  return words(query).every((term) => named.some((word) => word.startsWith(term)));
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

