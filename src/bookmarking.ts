import { BOOKMARKS, BOOKMARKS_KEPT, ItemId, withBookmarksItem } from "./model";
import { Bookmark, Destination, bookmarkForDigit, bookmarkPage } from "./bookmarks";
import { commitAndRender, doc, state } from "./app";
import { toast } from "./chrome";
import { zoomTo } from "./navigation";
import { afterFirstSync } from "./syncing";

export function keepBookmarksItem(): void {
  afterFirstSync(() => commitAndRender(withBookmarksItem(doc()), null));
}

export function goTo(destination: Destination): void {
  if ("url" in destination) window.open(destination.url, "_blank", "noopener");
  else zoomTo(destination.zoom);
}

export function openBookmark(digit: number): void {
  const found: Bookmark | undefined = bookmarkForDigit(doc(), digit);
  if (found) goTo(found.destination);
  else toast(`No bookmark has the key ${digit}`);
}

export function openBookmarkList(): void {
  commitAndRender(withBookmarksItem(doc()), null);
  zoomTo(BOOKMARKS);
}

export function bookmarkThisPage(): void {
  const result = bookmarkPage(withBookmarksItem(doc()), state.zoom);
  const said = {
    added: "Added to Bookmarks",
    already: "Already in Bookmarks",
    list: "This is the list of bookmarks",
    home: "Open a page to bookmark it",
  }[result.outcome];
  commitAndRender(result.doc, null);
  toast(said);
}

/** True, with a word to the user, when the change would touch the bookmarks item in a way it refuses. */
export function refusedAsKept(ids: ItemId[]): boolean {
  if (!ids.includes(BOOKMARKS)) return false;
  toast(BOOKMARKS_KEPT);
  return true;
}
