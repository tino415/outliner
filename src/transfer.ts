import { Doc, Item, ItemId, ROOT, appendChild, emptyDoc, insertChild, setFlags, setNote } from "./model";
import { escape } from "./inline";
import { linksAsLabels } from "./references";
import { mapLinesOutsideCode } from "./properties";
import { parseDoc } from "./storage";

export function exportJson(doc: Doc): string {
  return JSON.stringify({ format: "outliner-lab", version: 1, doc }, null, 2);
}

export function exportOpml(doc: Doc, top: ItemId): string {
  const outline = (id: ItemId, depth: number): string => {
    const item = readable(doc, doc.items[id]);
    const pad = "  ".repeat(depth);
    const attributes = [
      `text="${attribute(item.text)}"`,
      item.note ? `_note="${attribute(item.note)}"` : "",
      item.completed ? `_complete="true"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (item.children.length === 0) return `${pad}<outline ${attributes}/>\n`;
    return `${pad}<outline ${attributes}>\n${item.children.map((child) => outline(child, depth + 1)).join("")}${pad}</outline>\n`;
  };
  const title = top === ROOT ? "Outline" : doc.items[top].text;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>${escape(title)}</title></head>\n  <body>\n` +
    doc.items[top].children.map((child) => outline(child, 2)).join("") +
    `  </body>\n</opml>\n`
  );
}

/** XML normalises raw line breaks in attribute values to spaces, so they are written as references. */
function attribute(text: string): string {
  return escape(text).replace(/\n/g, "&#10;").replace(/\r/g, "&#13;").replace(/\t/g, "&#9;");
}

export function exportMarkdown(doc: Doc, top: ItemId): string {
  return subtreesAsText(doc, doc.items[top].children, readable) + "\n";
}

/** Links written as their labels, for readers outside the app; code blocks stay as written. */
function readable(doc: Doc, item: Item): Item {
  return { ...item, text: linksAsLabels(doc, item.text), note: mapLinesOutsideCode(item.note, (line) => linksAsLabels(doc, line)) };
}

/**
 * A Markdown list: completed items struck through, notes as indented lines
 * without a bullet. `parseIndentedText` reads the same shape back.
 */
export function subtreesAsText(doc: Doc, roots: ItemId[], written = (_: Doc, item: Item) => item): string {
  const lines: string[] = [];
  const walk = (id: ItemId, depth: number) => {
    const item = written(doc, doc.items[id]);
    const pad = "  ".repeat(depth);
    lines.push(`${pad}- ${item.completed ? `~~${item.text}~~` : item.text}`);
    for (const noteLine of item.note.split("\n").filter(Boolean)) lines.push(`${pad}  ${noteLine}`);
    for (const child of item.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return lines.join("\n");
}

/** Reads a file's text as either our JSON or OPML; the result replaces nothing, the caller decides. */
export function importText(text: string): Doc {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    return parseDoc(JSON.stringify(parsed.doc ?? parsed));
  }
  if (trimmed.startsWith("<")) return importOpml(trimmed);
  return parseIndentedText(text);
}

function importOpml(xml: string): Doc {
  const parsed = new DOMParser().parseFromString(xml, "text/xml");
  if (parsed.querySelector("parsererror")) throw new Error("the file is not valid OPML");
  const body = parsed.querySelector("body");
  if (!body) throw new Error("the OPML file has no body");
  let doc = emptyDoc();
  const walk = (element: Element, parent: ItemId) => {
    for (const outline of Array.from(element.children).filter((child) => child.tagName === "outline")) {
      const created = appendChild(doc, parent, outline.getAttribute("text") ?? "");
      doc = created.doc;
      const note = outline.getAttribute("_note");
      if (note) doc = setNote(doc, created.id, note);
      if (outline.getAttribute("_complete") === "true") doc = setFlags(doc, created.id, { completed: true });
      walk(outline, created.id);
    }
  };
  walk(body, ROOT);
  return doc;
}

const BULLET = /^([-*+]|\d+[.)])\s+/;

/**
 * Indented lines become nested items. In a bulleted list, a line without a
 * bullet indented under an item is that item's note, and `~~text~~` is a
 * completed item.
 */
export function parseIndentedText(text: string): Doc {
  let doc = emptyDoc();
  const stack: { indent: number; id: ItemId; bulleted: boolean }[] = [{ indent: -1, id: ROOT, bulleted: false }];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const bulleted = BULLET.test(line.trim());
    const last = stack[stack.length - 1];
    if (!bulleted && last.bulleted && indent > last.indent) {
      const note = doc.items[last.id].note;
      doc = setNote(doc, last.id, note ? `${note}\n${line.trim()}` : line.trim());
      continue;
    }
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const content = line.trim().replace(BULLET, "");
    const struck = /^~~(.+)~~$/.exec(content);
    const created = appendChild(doc, stack[stack.length - 1].id, struck ? struck[1] : content);
    doc = struck ? setFlags(created.doc, created.id, { completed: true }) : created.doc;
    stack.push({ indent, id: created.id, bulleted });
  }
  return doc;
}

/** Copies every top-level item of `incoming`, with fresh ids, into `parent` starting at `index`. */
export function graft(doc: Doc, incoming: Doc, parent: ItemId, index: number): { doc: Doc; ids: ItemId[] } {
  let result = doc;
  const copy = (sourceId: ItemId, targetParent: ItemId, at: number): ItemId => {
    const source = incoming.items[sourceId];
    const created = insertChild(result, targetParent, at, source.text);
    result = created.doc;
    source.children.forEach((child, i) => copy(child, created.id, i));
    result = setFlags(result, created.id, {
      note: source.note,
      completed: source.completed,
      collapsed: source.collapsed && source.children.length > 0,
    });
    return created.id;
  };
  const ids = incoming.items[ROOT].children.map((child, i) => copy(child, parent, index + i));
  return { doc: result, ids };
}

export function download(filename: string, mime: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
