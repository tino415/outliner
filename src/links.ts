import { ItemId } from "./model";
import { itemLabel } from "./inline";
import { itemLink, mayShareTitle } from "./itemLink";
import { doc, state } from "./app";
import { toast } from "./chrome";
import { copyText } from "./selection";

export function copyLink(id: ItemId): void {
  const url = itemLink(doc(), id, location.origin + location.pathname);
  if (canShare()) void shareLink(id, url);
  else copyLinkText(url);
}

export function copyLinkToPage(): void {
  copyLink(state.zoom);
}

function copyLinkText(url: string): void {
  copyText(url);
  toast("Link copied");
}

function canShare(): boolean {
  return typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches;
}

async function shareLink(id: ItemId, url: string): Promise<void> {
  try {
    await navigator.share(mayShareTitle(doc(), id) ? { url, title: itemLabel(doc().items[id].text, 80) } : { url });
  } catch (error) {
    if ((error as Error).name !== "AbortError") copyLinkText(url);
  }
}

