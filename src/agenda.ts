import { doc, filter, state, ui } from "./app";
import { ItemId } from "./model";
import { AGENDA_DAYS, AgendaGroup, AgendaSection, agendaGroups } from "./agendaItems";
import { Day, addDays, dayLabel, fullDayLabel, today } from "./dates";
import { escape, plainText, renderItemText, renderNote } from "./inline";
import { isSealed } from "./notes";
import { propertyChipsHtml } from "./propertyChips";
import { ownFormulaResults, render } from "./render";
import { pathOf } from "./search";
import { zoomTo } from "./navigation";
import { isMac } from "./platform";

/*
 * The agenda (doc/adr/0037): a page of its own at #agenda that lists items
 * from all over the outline by date. The rows are the items themselves,
 * edited and completed in place; what would move them in the outline does
 * nothing here, since the agenda does not show where they would go.
 */

export const AGENDA = "#agenda";

export function agendaShown(): boolean {
  return location.hash === AGENDA && !state.results;
}

export function openAgenda(): void {
  if (location.hash === AGENDA) render(null);
  else location.hash = AGENDA;
}

export function bindAgenda(): void {
  ui.agenda.addEventListener("click", (event) => {
    const bullet = (event.target as HTMLElement).closest(".bullet");
    const item = bullet?.closest<HTMLElement>(".item");
    if (item) zoomTo(item.dataset.id!);
  });
}

export function renderAgenda(): void {
  const now = today();
  const groups = agendaGroups(doc(), now, filter());
  ui.agenda.innerHTML =
    `<h1 class="title agenda-title">Agenda</h1>` +
    `<p class="agenda-range">${escape(fullDayLabel(now, now))} to ${escape(fullDayLabel(addDays(now, AGENDA_DAYS), now))}</p>` +
    (groups.length ? groups.map((group) => sectionHtml(group, now)).join("") : nothingThisWeek());
}

function nothingThisWeek(): string {
  return (
    `<p class="agenda-empty">Nothing dated this week and no #todo items. ` +
    `A date is written as 2026-10-14 in an item or in its due or scheduled property; ${isMac ? "⌘J" : "Ctrl-J"} ; or typing !! inserts one.</p>`
  );
}

function sectionHtml({ section, ids }: AgendaGroup, now: Day): string {
  return (
    `<section class="agenda-section agenda-${section.kind}"${section.kind === "day" ? ` data-day="${section.day}"` : ""}>` +
    `<h2>${escape(sectionTitle(section, now))}</h2><ul class="agenda-items">${ids.map((id) => agendaRowHtml(id)).join("")}</ul></section>`
  );
}

function sectionTitle(section: AgendaSection, now: Day): string {
  if (section.kind === "overdue") return "Overdue";
  if (section.kind === "todo") return "To do, without a date";
  const near = dayLabel(section.day, now);
  const full = fullDayLabel(section.day, now);
  return near === full ? full : `${near[0].toUpperCase()}${near.slice(1)} · ${full}`;
}

export function agendaRowHtml(id: ItemId, showPath = true): string {
  const item = doc().items[id];
  const noteOpen = item.note !== "" || state.openNotes.has(id);
  const path = pathOf(doc(), id);
  return (
    `<li class="item agenda-item${item.completed ? " completed" : ""}" data-id="${escape(id)}"><div class="row">` +
    `<button class="bullet" type="button" tabindex="-1" aria-label="Zoom in" title="Zoom in"><span class="dot"></span></button>` +
    `<div class="body">` +
    `<div class="text${item.text === "" ? " empty" : ""}" contenteditable="plaintext-only" spellcheck="true" data-id="${escape(id)}">${renderItemText(item.text)}</div>` +
    propertyChipsHtml(item, undefined, ownFormulaResults(id)) +
    `<div class="note" contenteditable="${isSealed(item.note) ? "false" : "plaintext-only"}" spellcheck="true" data-id="${escape(id)}"${noteOpen ? "" : " hidden"}>${renderNote(item.note)}</div>` +
    (showPath && path.length ? `<a class="agenda-path" href="#/${encodeURIComponent(item.parent!)}">${escape(path.map(plainText).join(" / "))}</a>` : "") +
    `</div></div></li>`
  );
}
