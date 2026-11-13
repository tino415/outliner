import { Doc, ItemId } from "./model";

export function countLabel(doc: Doc, children: ItemId[]): string {
  const done = children.filter((child) => doc.items[child].completed).length;
  return done === 0 ? String(children.length) : `${done}/${children.length} done`;
}
