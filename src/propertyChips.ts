import { Item, SETTINGS } from "./model";
import { escape } from "./inline";
import { Cell } from "./properties";

/* An item's properties as chips under its text (doc/adr/0032); a click on one edits it. */

/** `computed` holds the results of the item's "=…" values; the chip shows the result, the formula on hover. */
export function propertyChipsHtml(item: Item, shownElsewhere: ReadonlySet<string> = new Set(), computed: ReadonlyMap<string, Cell> = new Map()): string {
  const chips = Object.keys(item.properties)
    .filter((key) => key !== "approved" && !shownElsewhere.has(key))
    .sort((a, b) => Number(SETTINGS.has(a)) - Number(SETTINGS.has(b)) || a.localeCompare(b))
    .map((key) => chipHtml(key, item.properties[key], computed.get(key)));
  return chips.length ? `<div class="props">${chips.join("")}</div>` : "";
}

function chipHtml(key: string, value: string, result: Cell | undefined): string {
  const classes = ["prop-chip", SETTINGS.has(key) && "setting", result && "computed", result?.error && "error"].filter(Boolean).join(" ");
  const shown = result?.text ?? value;
  const title = result?.error ? `${key}: ${value} (${result.error})` : `${key}: ${value}`;
  const label = key === "private" ? `🔒 ${escape(value)}` : `<span class="prop-key">${escape(key)}</span> <span class="prop-value">${escape(shown)}</span>`;
  return `<button type="button" tabindex="-1" class="${classes}" data-key="${escape(key)}" title="${escape(title)}">${label}</button>`;
}
