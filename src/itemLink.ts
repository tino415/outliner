import { Doc, ItemId, ROOT, isPrivateItem, privateRootAbove } from "./model";
/*
 * A link to an item is `<base>#/<id>`, which opens it zoomed in
 * (doc/adr/0050). The base is the first `link-base` property in outline
 * order, else the address the app was opened at.
 */

const LINK_BASE = "link-base";

export function linkBaseIn(doc: Doc): string | null {
  const found = (id: ItemId): string | null => {
    for (const child of doc.items[id].children) {
      const written = doc.items[child].properties[LINK_BASE]?.trim();
      if (written) return written;
      const deeper = found(child);
      if (deeper) return deeper;
    }
    return null;
  };
  return found(ROOT);
}

export function itemLink(doc: Doc, id: ItemId, openedAt: string): string {
  const base = linkBaseIn(doc) ?? openedAt;
  const hash = id === ROOT ? "#/" : `#/${encodeURIComponent(id)}`;
  return base.replace(/#.*$/, "") + hash;
}

/** A private item shares its address only: its words stay out of the share sheet. */
export function mayShareTitle(doc: Doc, id: ItemId): boolean {
  return !isPrivateItem(doc, id) && privateRootAbove(doc, id) === null;
}
