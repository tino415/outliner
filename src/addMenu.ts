import { commitAndRender, doc } from "./app";
import { ItemId, insertShownChild, newChildIndex } from "./model";
import { refusedAsReadOnly } from "./bookmarking";
import { attachFilesTo, canInsertFromList, insertFromListOn, pickFiles } from "./editing";
import { chooseProperty, chooseTag } from "./propertyPicker";

const menu = () => document.getElementById("add-menu")!;

let menuItem: ItemId | null = null;

const additions: Record<string, (id: ItemId) => void> = {
  child: addChild,
  list: insertFromListOn,
  attachment: attach,
  tag: chooseTag,
  property: chooseProperty,
};

export function bindAddMenu(): void {
  document.addEventListener("mousedown", (event) => {
    if ((event.target as Element).closest?.(".prop-add")) event.preventDefault();
  });
  document.addEventListener("click", (event) => {
    const button = (event.target as Element).closest?.<HTMLElement>(".prop-add");
    const owner = button?.closest<HTMLElement>("[data-id]");
    if (button && owner) openAddMenu(owner.dataset.id!, button);
  });
  menu().addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLElement>("[data-add-action]")?.dataset.addAction;
    menu().hidePopover();
    if (!action || !menuItem || !doc().items[menuItem]) return;
    additions[action](menuItem);
  });
  menu().addEventListener("keydown", (event) => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const entries = [...menu().querySelectorAll<HTMLElement>("[data-add-action]:not([hidden])")];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const next = at < 0 ? (step > 0 ? 0 : entries.length - 1) : (at + step + entries.length) % entries.length;
    entries[next].focus();
  });
}

function openAddMenu(id: ItemId, anchor: HTMLElement): void {
  menuItem = id;
  menu().querySelector<HTMLElement>('[data-add-action="list"]')!.hidden = !canInsertFromList(id);
  menu().showPopover();
  const rect = anchor.getBoundingClientRect();
  const height = menu().offsetHeight;
  const fitsBelow = rect.bottom + 4 + height < window.innerHeight;
  menu().style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu().offsetWidth - 8))}px`;
  menu().style.top = `${fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - height - 4)}px`;
  menu().querySelector<HTMLElement>("[data-add-action]")!.focus();
}

function attach(id: ItemId): void {
  if (refusedAsReadOnly([id], "note")) return;
  void pickFiles().then((files) => (files.length > 0 ? attachFilesTo(id, files) : undefined));
}

function addChild(parent: ItemId): void {
  if (refusedAsReadOnly([parent], "children")) return;
  const created = insertShownChild(doc(), parent, newChildIndex(doc(), parent));
  commitAndRender(created.doc, { id: created.id, offset: 0 });
}
