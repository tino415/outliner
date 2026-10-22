import { doc, filter, state, ui } from "./app";
import { ItemId, ROOT } from "./model";
import { DateSection, Group, byDate, byParent, groupingOf, parseQuery, queryMatches, queryOf } from "./query";
import { Day, dayLabel, fullDayLabel, today } from "./dates";
import { escape, plainText } from "./inline";
import { agendaRowHtml } from "./agenda";
import { pathOf } from "./search";

/*
 * A query view (doc/adr/0044): zoomed into an item with a `:query:`, the
 * page lists the items that match from all over the outline, edited where
 * they live, in the agenda's rows.
 */

export function queryViewShown(): boolean {
  return !state.results && queryOf(doc().items[state.zoom]) !== null;
}

export function renderQueryView(): void {
  const view = doc().items[state.zoom];
  const now = today();
  const ids = queryMatches(doc(), ROOT, parseQuery(queryOf(view)!, now), filter(), view.id);
  const sections =
    groupingOf(view) === "date"
      ? byDate(doc(), ids, now).map((group) => sectionHtml(dateTitle(group.section, now), group, group.section.kind))
      : byParent(doc(), ids).map((group) => sectionHtml(parentTitle(group.section), group, "parent", group.section));
  ui.agenda.innerHTML = ids.length ? sections.join("") : `<p class="agenda-empty">Nothing matches ${escape(queryOf(view)!)}.</p>`;
}

function sectionHtml(title: string, { ids }: Group<unknown>, kind: string, link?: ItemId): string {
  const heading = link ? `<a href="#/${encodeURIComponent(link)}">${escape(title)}</a>` : escape(title);
  return `<section class="agenda-section agenda-${kind}"><h2>${heading}</h2><ul class="agenda-items">${ids.map((id) => agendaRowHtml(id, kind !== "parent")).join("")}</ul></section>`;
}

function parentTitle(parent: ItemId): string {
  if (parent === ROOT) return "Home";
  return [...pathOf(doc(), parent), doc().items[parent].text || "Untitled"].map(plainText).join(" / ");
}

function dateTitle(section: DateSection, now: Day): string {
  if (section.kind === "overdue") return "Overdue";
  if (section.kind === "undated") return "Without a date";
  if (section.kind === "past") return "Done, dated earlier";
  const near = dayLabel(section.day, now);
  const full = fullDayLabel(section.day, now);
  return near === full ? full : `${near[0].toUpperCase()}${near.slice(1)} · ${full}`;
}
