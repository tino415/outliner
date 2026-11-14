import { BOOKMARKS, Doc, ItemId, ROOT, appendChild, isPrivateItem, privateRootAbove, setText } from "./model";
import { onlyUrl } from "./inline";
import { referenceTo, resolveReference } from "./references";

/*
 * The list of bookmarks (doc/adr/0060) is the system item with the id
 * `bookmarks`. Each child is one bookmark: a single link opens the item it
 * names, a single URL opens that address, anything else is its own page.
 */

export type Destination = { zoom: ItemId } | { url: string };

export interface Bookmark {
  child: ItemId;
  /** 1..9, from the child's `key` property: Mod+J and that digit open it. */
  digit: number | null;
  destination: Destination;
}

const WHOLE_LINK = /^\[\[([^[\]\n]+)\](?:\[([^[\]\n]+)\])?\]$/;

export function bookmarksIn(doc: Doc): Bookmark[] {
  return (doc.items[BOOKMARKS]?.children ?? []).flatMap((child) => {
    const destination = destinationOf(doc, child);
    return destination ? [{ child, digit: digitOf(doc, child), destination }] : [];
  });
}

export function bookmarkForDigit(doc: Doc, digit: number): Bookmark | undefined {
  return bookmarksIn(doc).find((bookmark) => bookmark.digit === digit);
}

function destinationOf(doc: Doc, child: ItemId): Destination | null {
  const text = doc.items[child].text.trim();
  const link = WHOLE_LINK.exec(text);
  if (link) {
    const target = resolveReference(doc, link[1]);
    return target ? { zoom: target } : null;
  }
  const url = onlyUrl(text);
  return url ? { url } : { zoom: child };
}

function digitOf(doc: Doc, child: ItemId): number | null {
  const written = doc.items[child].properties.key?.trim() ?? "";
  return /^[1-9]$/.test(written) ? Number(written) : null;
}

export type Bookmarking = { doc: Doc; outcome: "added" | "already" | "list" | "home" };

export function bookmarkPage(doc: Doc, page: ItemId): Bookmarking {
  if (page === ROOT) return { doc, outcome: "home" };
  if (page === BOOKMARKS) return { doc, outcome: "list" };
  if (bookmarksIn(doc).some((bookmark) => "zoom" in bookmark.destination && bookmark.destination.zoom === page)) {
    return { doc, outcome: "already" };
  }
  const added = appendChild(doc, BOOKMARKS, "");
  return { doc: setText(added.doc, added.id, referenceTo(page, titleToShow(doc, page))), outcome: "added" };
}

function titleToShow(doc: Doc, page: ItemId): string {
  const shareable = !isPrivateItem(doc, page) && privateRootAbove(doc, page) === null;
  return shareable ? doc.items[page].text : "Private item";
}
