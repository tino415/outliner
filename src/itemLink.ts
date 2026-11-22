import { BOOKMARKS, BOOKMARKS_ABOUT, CAPTURE_TEMPLATES, CAPTURE_TEMPLATES_ABOUT, Doc, ItemId, ROOT, SETTINGS_ITEM, isPrivateItem, privateRootAbove } from "./model";

const WORD_IDS: ReadonlySet<ItemId> = new Set([SETTINGS_ITEM, BOOKMARKS, BOOKMARKS_ABOUT, CAPTURE_TEMPLATES, CAPTURE_TEMPLATES_ABOUT]);
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

/** The item a typed or pasted id, or a link to an item, names; a part of an id names nothing. */
export function itemNamedBy(doc: Doc, query: string): ItemId | null {
  const written = query.trim().replace(/^\S*?#\//, "");
  try {
    const id = decodeURIComponent(written);
    const isWordOfItsOwn = written === query.trim() && WORD_IDS.has(id);
    return id !== ROOT && !isWordOfItsOwn && Object.hasOwn(doc.items, id) ? id : null;
  } catch {
    return null;
  }
}

/** A private item shares its address only: its words stay out of the share sheet. */
export function mayShareTitle(doc: Doc, id: ItemId): boolean {
  return !isPrivateItem(doc, id) && privateRootAbove(doc, id) === null;
}
