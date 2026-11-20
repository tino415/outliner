import { Doc, ItemId, ROOT, insertChild, isReadOnly, remove, setNote } from "./model";
import { isOutsideCode, isSealed, propertyLine } from "./notes";
import { referenceTo } from "./references";

/*
 * An attachment is a Markdown link to `att:` and the SHA-256 of the file
 * (doc/adr/0028): `![screenshot.png](att:…)` for an image, shown as one,
 * `[report.pdf](att:…)` for any other file. An item holds it as a child
 * titled with the link (doc/adr/0069).
 */

export const ATTACHMENT = /(!?)\[([^\]\n]*)\]\(att:([0-9a-f]{64})\)/;

export function attachmentLink(name: string, hash: string, type: string): string {
  const label = name.replace(/[[\]\n]/g, " ").trim() || "file";
  return `${type.startsWith("image/") ? "!" : ""}[${label}](att:${hash})`;
}

export function typeFromName(name: string): string {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
  };
  return types[extension] ?? "application/octet-stream";
}

const linkTo = (hash: string) => new RegExp(String.raw`!?\[[^\]\n]*\]\(att:${hash}\)`, "g");

export function linksAttachment(note: string, hash: string): boolean {
  return linkTo(hash).test(note);
}

export function withoutAttachment(note: string, hash: string): string {
  const link = linkTo(hash);
  return note
    .split("\n")
    .map((line) => ({ line, left: line.replace(link, "") }))
    .filter(({ line, left }) => left.trim() !== "" || line.trim() === "")
    .map(({ left }) => left)
    .join("\n");
}

export function attachmentChildren(doc: Doc, id: ItemId, hash: string): ItemId[] {
  return doc.items[id].children.filter((child) => new RegExp(`^\\s*${linkTo(hash).source}\\s*$`).test(doc.items[child].text));
}

export function withoutAttachmentChildren(doc: Doc, id: ItemId, hash: string): Doc {
  const children = attachmentChildren(doc, id, hash);
  const unreferenced = setNote(doc, id, withoutReferencesTo(doc.items[id].note, children));
  return children.reduce(remove, unreferenced);
}

function withoutReferencesTo(note: string, children: ItemId[]): string {
  return children.reduce((left, child) => left.replace(new RegExp(String.raw`\[\[id:${child}\](?:\[[^[\]\n]+\])?\]`, "g"), ""), note);
}

export interface Lifted {
  doc: Doc;
  lifted: ItemId[];
}

export function attachmentsToChildren(doc: Doc): Lifted {
  const lifted: ItemId[] = [];
  let next = doc;
  for (const id of Object.keys(doc.items)) {
    if (id === ROOT || isSealed(doc.items[id].note) || isReadOnly(id, "note") || isReadOnly(id, "children")) continue;
    const before = next;
    next = liftFrom(next, id);
    if (next !== before) lifted.push(id);
  }
  return { doc: next, lifted };
}

function liftFrom(doc: Doc, id: ItemId): Doc {
  let next = doc;
  const childFor = (link: string): ItemId => {
    const existing = next.items[id].children.find((child) => next.items[child].text === link);
    if (existing) return existing;
    const added = insertChild(next, id, next.items[id].children.length, link);
    next = added.doc;
    return added.id;
  };
  const alone = (line: string) => new RegExp(`^\\s*${ATTACHMENT.source}\\s*$`).test(line);
  const lifting = (line: string) => propertyLine(line) === null;
  const kept: string[] = [];
  const lines = doc.items[id].note.split("\n");
  const outside = isOutsideCode(lines);
  lines.forEach((line, index) => {
    if (!outside[index] || !lifting(line)) return void kept.push(line);
    if (alone(line)) return void childFor(line.trim());
    kept.push(line.replace(new RegExp(ATTACHMENT.source, "g"), (link, _bang, label: string) => referenceTo(childFor(link), label || "file")));
  });
  const note = kept.join("\n");
  return note === doc.items[id].note ? next : setNote(next, id, note);
}
