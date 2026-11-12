import { Item, SETTINGS } from "./model";
import { escape, onlyUrl } from "./inline";
import { MIRROR } from "./mirrors";
import { Cell } from "./properties";
import { dateLabel, inReaderZone, readWrittenDate, today } from "./dates";

/* An item's properties as chips under its text (doc/adr/0032); a click on one edits it. */

/** `computed` holds the results of the item's "=…" values; the chip shows the result, the formula on hover. */
export function propertyChipsHtml(item: Item, shownElsewhere: ReadonlySet<string> = new Set(), computed: ReadonlyMap<string, Cell> = new Map()): string {
  const chips = Object.keys(item.properties)
    .filter((key) => key !== "approved" && key !== MIRROR && !shownElsewhere.has(key))
    .sort((a, b) => Number(SETTINGS.has(a)) - Number(SETTINGS.has(b)) || a.localeCompare(b))
    .map((key) => chipHtml(key, item.properties[key], computed.get(key)));
  return chips.length ? `<div class="props">${chips.join("")}</div>` : "";
}

function chipHtml(key: string, value: string, result: Cell | undefined): string {
  const classes = ["prop-chip", SETTINGS.has(key) && "setting", result && "computed", result?.error && "error"].filter(Boolean).join(" ");
  const shown = result?.text ?? value;
  const title = result?.error ? `${key}: ${value} (${result.error})` : `${key}: ${value}`;
  const url = result ? undefined : onlyUrl(value);
  if (url && key !== "private") return linkChipHtml(key, url, classes, title);
  const label = key === "private" ? `🔒 ${escape(value)}` : `<span class="prop-key">${escape(key)}</span> ${valueHtml(shown)}`;
  return `<button type="button" tabindex="-1" class="${classes}" data-key="${escape(key)}" title="${escape(title)}">${label}</button>`;
}

/** An <a> cannot sit inside a <button>, so the key is the button and the value the link. */
function linkChipHtml(key: string, url: string, classes: string, title: string): string {
  const keyButton = `<button type="button" tabindex="-1" class="prop-key">${escape(key)}</button>`;
  const link = `<a class="link prop-value" href="${escape(url)}" target="_blank" rel="noopener" tabindex="-1">${escape(url)}</a>`;
  return `<span class="${classes} link-chip" data-key="${escape(key)}" title="${escape(title)}">${keyButton} ${link}</span>`;
}

/** A date shows as a date chip does, "tomorrow" or "Tue 14 Oct", red once past (doc/adr/0036). */
function valueHtml(shown: string): string {
  const read = readWrittenDate(shown);
  if (!read) return `<span class="prop-value">${escape(shown)}</span>`;
  const date = inReaderZone(read);
  const now = today();
  return `<span class="prop-value${date.day < now ? " past" : ""}" data-date="${escape(shown)}">${escape(dateLabel(date, now))}</span>`;
}
