import { Doc, Item, ItemId } from "./model";

/*
 * What changed between two versions of the outline, as plugins and
 * `outline watch` see it (doc/adr/0038): one event per item, children
 * carried along with an added or moved item fire nothing.
 */

export const EVENT_NAMES = ["added", "moved", "completed", "changed"] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export interface OutlineEvent {
  event: EventName;
  id: ItemId;
  from: ItemId | null;
  to: ItemId | null;
}

export function isEventName(name: unknown): name is EventName {
  return EVENT_NAMES.includes(name as EventName);
}

export function eventsBetween(before: Doc, after: Doc): OutlineEvent[] {
  if (before === after) return [];
  return Object.values(after.items).flatMap((item) => eventsOf(before.items[item.id], item, before));
}

function eventsOf(old: Item | undefined, item: Item, before: Doc): OutlineEvent[] {
  if (item.parent === null) return [];
  if (!old) return before.items[item.parent] ? [{ event: "added", id: item.id, from: null, to: item.parent }] : [];
  if (old === item) return [];
  const events: OutlineEvent[] = [];
  if (old.parent !== item.parent) events.push({ event: "moved", id: item.id, from: old.parent, to: item.parent });
  if (old.completed !== item.completed) events.push({ event: "completed", id: item.id, from: null, to: null });
  if (old.text !== item.text || old.note !== item.note || !sameProperties(old.properties, item.properties)) {
    events.push({ event: "changed", id: item.id, from: null, to: null });
  }
  return events;
}

function sameProperties(a: Item["properties"], b: Item["properties"]): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
