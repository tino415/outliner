import { Item, SETTINGS } from "./model";
import { escape } from "./inline";

/* An item's properties as chips under its text (doc/adr/0032); a click on one edits it. */

export function propertyChipsHtml(item: Item, shownElsewhere: ReadonlySet<string> = new Set()): string {
  const chips = Object.keys(item.properties)
    .filter((key) => key !== "approved" && !shownElsewhere.has(key))
    .sort((a, b) => Number(SETTINGS.has(a)) - Number(SETTINGS.has(b)) || a.localeCompare(b))
    .map((key) => chipHtml(key, item.properties[key]));
  return chips.length ? `<div class="props">${chips.join("")}</div>` : "";
}

function chipHtml(key: string, value: string): string {
  const setting = SETTINGS.has(key) ? " setting" : "";
  const label = key === "private" ? `🔒 ${escape(value)}` : `<span class="prop-key">${escape(key)}</span> <span class="prop-value">${escape(value)}</span>`;
  return `<button type="button" tabindex="-1" class="prop-chip${setting}" data-key="${escape(key)}" title="${escape(`${key}: ${value}`)}">${label}</button>`;
}
