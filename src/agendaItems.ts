import { Doc, ItemId, ROOT, ViewFilter, isShown } from "./model";
import { Day, addDays, datesOf } from "./dates";
import { tagsWritten } from "./inline";

/*
 * What the agenda lists (doc/adr/0037): the items dated in the coming
 * week, each on its next date, after the open items whose dates have all
 * passed, then the #todo items without a date. Items under a hidden
 * completed item are hidden with it.
 */

export const AGENDA_DAYS = 7;

export type AgendaSection = { kind: "overdue" } | { kind: "day"; day: Day } | { kind: "todo" };

export interface AgendaGroup {
  section: AgendaSection;
  ids: ItemId[];
}

interface Placed {
  id: ItemId;
  section: AgendaSection;
  order: string;
}

export function agendaGroups(doc: Doc, now: Day, filter: ViewFilter): AgendaGroup[] {
  const placed = itemsUnder(doc, ROOT, filter).flatMap((id, index) => placeOf(doc, id, now, index));
  const groups = new Map<string, AgendaGroup>();
  for (const each of [...placed].sort((a, b) => a.order.localeCompare(b.order))) {
    const key = sectionKey(each.section);
    const group = groups.get(key) ?? { section: each.section, ids: [] };
    group.ids.push(each.id);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function itemsUnder(doc: Doc, top: ItemId, filter: ViewFilter): ItemId[] {
  return doc.items[top].children.filter((id) => isShown(doc, id, filter)).flatMap((id) => [id, ...itemsUnder(doc, id, filter)]);
}

/** Sorted by section, then within a day by the time written (untimed after), then in outline order. */
function placeOf(doc: Doc, id: ItemId, now: Day, index: number): Placed[] {
  const item = doc.items[id];
  const dates = datesOf(item);
  const position = String(index).padStart(8, "0");
  if (dates.length === 0) {
    const isTodo = tagsWritten(item.text).some((tag) => tag.toLowerCase() === "todo");
    return isTodo ? [{ id, section: { kind: "todo" }, order: `3 ${position}` }] : [];
  }
  const next = dates.filter((date) => date.day >= now).sort((a, b) => `${a.day} ${clockOrder(a.time)}`.localeCompare(`${b.day} ${clockOrder(b.time)}`))[0];
  if (!next) {
    if (item.completed) return [];
    const latest = dates.map((date) => date.day).sort().at(-1)!;
    return [{ id, section: { kind: "overdue" }, order: `0 ${latest} ${position}` }];
  }
  if (next.day > addDays(now, AGENDA_DAYS)) return [];
  return [{ id, section: { kind: "day", day: next.day }, order: `1 ${next.day} ${clockOrder(next.time)} ${position}` }];
}

function clockOrder(time: string | null): string {
  return time === null ? "99:99" : time.padStart(5, "0");
}

function sectionKey(section: AgendaSection): string {
  return section.kind === "day" ? section.day : section.kind;
}
