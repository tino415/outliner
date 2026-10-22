import { Doc, ItemId, ViewFilter, indexInParent, insertChild, isBlank, setItemProperty, shownChildren } from "./model";
import { escape, renderItemText } from "./inline";
import { pathOf } from "./search";

/*
 * A mirror (doc/adr/0043) is an item with no text of its own and a
 * `:mirror: <id>` property; it shows the target's text and children, read-only.
 */

export const MIRROR = "mirror";

export function mirrorTargetOf(doc: Doc, id: ItemId): ItemId | null {
  return doc.items[id]?.properties[MIRROR]?.trim() || null;
}

export function isMirror(doc: Doc, id: ItemId): boolean {
  return mirrorTargetOf(doc, id) !== null;
}

/** The target when it is still in the outline; null for a mirror whose target is gone, or for an ordinary item. */
export function liveMirrorTarget(doc: Doc, id: ItemId): ItemId | null {
  const target = mirrorTargetOf(doc, id);
  return target && doc.items[target] ? target : null;
}

/** A blank item becomes the mirror; any other gets the mirror as its next sibling. */
export function mirrorHere(doc: Doc, at: ItemId, target: ItemId): { doc: Doc; id: ItemId } {
  if (isBlank(doc.items[at])) return { doc: setItemProperty(doc, at, MIRROR, target), id: at };
  const created = insertChild(doc, doc.items[at].parent!, indexInParent(doc, at) + 1);
  return { doc: setItemProperty(created.doc, created.id, MIRROR, target), id: created.id };
}

export function mirrorTextHtml(doc: Doc, id: ItemId): string {
  const target = liveMirrorTarget(doc, id);
  const shown = target ? renderItemText(doc.items[target].text) : "gone";
  return (
    `<div class="text mirror-text${target ? "" : " gone"}" tabindex="-1" contenteditable="false" data-id="${escape(id)}"` +
    `${target ? ` data-target="${escape(target)}" title="${escape(pathTo(doc, target))}"` : ` title="The mirrored item was deleted"`}>${shown}</div>`
  );
}

export function mirrorBulletTitle(doc: Doc, id: ItemId): string {
  const target = liveMirrorTarget(doc, id);
  return target ? `Mirror of ${pathTo(doc, target)} · click to go there` : "Mirror of a deleted item";
}

/** The target's children as read-only rows; a mirror among them shows its target's text, not its children, so mirrors of their own ancestors end. */
export function mirroredChildrenHtml(doc: Doc, id: ItemId, filter: ViewFilter): string {
  const target = liveMirrorTarget(doc, id);
  return target ? childrenHtml(doc, target, filter) : "";
}

function childrenHtml(doc: Doc, parent: ItemId, filter: ViewFilter): string {
  if (doc.items[parent].collapsed) return "";
  const children = shownChildren(doc, parent, filter);
  return children.length ? `<ul class="mirror-children">${children.map((child) => childHtml(doc, child, filter)).join("")}</ul>` : "";
}

function childHtml(doc: Doc, id: ItemId, filter: ViewFilter): string {
  const item = doc.items[id];
  const target = mirrorTargetOf(doc, id);
  const shownId = target ? liveMirrorTarget(doc, id) : id;
  const text = shownId ? renderItemText(doc.items[shownId].text) : "gone";
  const bullet = shownId
    ? `<a class="mirror-bullet${target ? " hollow" : ""}" href="#/${encodeURIComponent(shownId)}" tabindex="-1" title="${escape(pathTo(doc, shownId))}"><span class="dot"></span></a>`
    : `<span class="mirror-bullet hollow"><span class="dot"></span></span>`;
  return (
    `<li class="mirror-child${item.completed ? " completed" : ""}">` +
    `<div class="mirror-row">${bullet}<div class="mirror-child-text">${text}</div></div>` +
    (target ? "" : childrenHtml(doc, id, filter)) +
    `</li>`
  );
}

function pathTo(doc: Doc, id: ItemId): string {
  return [...pathOf(doc, id), doc.items[id].text || "Untitled"].join(" / ");
}
