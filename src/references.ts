import { Doc, ItemId, ROOT } from "./model";
import { privateKeyOf, withoutCode } from "./notes";

/*
 * References between items (doc/adr/0024), written as org links:
 * `[[id:ITEM][label]]` points at an item by id and survives renames;
 * `[[Some text]]` points at the first item with that text, as in Logseq.
 */

const REFERENCE = /\[\[([^[\]\n]+)\](?:\[([^[\]\n]+)\])?\]/g;

export function referenceTo(id: ItemId, text: string): string {
  const label = text.replace(/[[\]\n]/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
  return `[[id:${id}][${label}]]`;
}

export function resolveReference(doc: Doc, target: string): ItemId | null {
  if (target.startsWith("id:")) return doc.items[target.slice(3)] ? target.slice(3) : null;
  const wanted = target.trim().toLowerCase();
  const found = inReadingOrder(doc).find((id) => doc.items[id].text.trim().toLowerCase() === wanted);
  return found ?? null;
}

/** For a link this device cannot follow: the private item it leads into, read from the id (doc/adr/0029). */
export function privateHolderOf(doc: Doc, target: string): ItemId | null {
  if (!target.startsWith("id:") || doc.items[target.slice(3)]) return null;
  const parts = target.slice(3).split("~");
  for (let length = parts.length - 1; length > 0; length--) {
    const holder = parts.slice(0, length).join("~");
    if (doc.items[holder] && privateKeyOf(doc.items[holder].note) !== null) return holder;
  }
  return null;
}

export function linksAsLabels(doc: Doc, text: string): string {
  return text.replace(REFERENCE, (_, target: string, label: string | undefined) => {
    if (label) return label;
    const found = resolveReference(doc, target);
    return found ? doc.items[found].text : target;
  });
}

/** Items whose text or note refers to `id`, in reading order. */
export function backlinks(doc: Doc, id: ItemId): ItemId[] {
  return inReadingOrder(doc).filter((other) => {
    if (other === id) return false;
    const { text, note } = doc.items[other];
    return [...`${text}\n${withoutCode(note)}`.matchAll(REFERENCE)].some((match) => resolveReference(doc, match[1]) === id);
  });
}

function inReadingOrder(doc: Doc): ItemId[] {
  const order: ItemId[] = [];
  const walk = (id: ItemId) => {
    for (const child of doc.items[id].children) {
      order.push(child);
      walk(child);
    }
  };
  walk(ROOT);
  return order;
}
