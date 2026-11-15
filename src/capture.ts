import { addDays } from "./dates";
import { Doc, ItemId, ROOT, copyChildren, insertChild, newChildIndex, setItemProperty } from "./model";

/*
 * Capture, as in org-capture (doc/adr/0023): a template is an item whose note
 * has a `:capture:` property naming where new items go; `:ask:` lists the
 * properties to ask for, `:at: top` or `:at: bottom` overrides where the
 * target page files new items (`:new: top`, or the bottom),
 * `:key:` is a letter that picks the template. The template's own text is
 * its name. `{date}` in the target is today, so `Journal/{date}` files into
 * a page per day, and `{tomorrow}` is the day after (doc/adr/0062); missing
 * pages on the way are created. When the target page itself is created, the
 * template's children are copied into it (`{date}` and `{tomorrow}` replaced
 * as in the target) and the template's other properties go onto it
 * (doc/adr/0063); a page that exists is left as it is.
 */

export interface Template {
  id?: ItemId;
  name: string;
  target: string;
  ask: string[];
  at?: "top" | "bottom";
  key: string;
}

export const INBOX: Template = { name: "Inbox", target: "Inbox", ask: [], key: "i" };

export function captureTemplates(doc: Doc): Template[] {
  const templates: Template[] = [];
  const walk = (id: ItemId) => {
    for (const child of doc.items[id].children) {
      const template = templateOf(doc, child);
      if (template) templates.push(template);
      walk(child);
    }
  };
  walk(ROOT);
  return templates.length ? templates : [INBOX];
}

export function templateOf(doc: Doc, id: ItemId): Template | null {
  const properties = doc.items[id].properties;
  const target = properties.capture;
  if (!target) return null;
  return {
    id,
    name: doc.items[id].text.trim() || target,
    target,
    ask: (properties.ask ?? "").split(/[\s,]+/).filter(Boolean),
    at: placementOf(properties.at),
    key: (properties.key ?? "").slice(0, 1).toLowerCase(),
  };
}

export function goToTarget(doc: Doc, template: Template, today: Date): { doc: Doc; target: ItemId } {
  const located = targetOf(doc, withToday(template.target, today));
  if (!located.created || !template.id) return { doc: located.doc, target: located.target };
  return { doc: fillPage(located.doc, template.id, located.target, today), target: located.target };
}

const OWN_PROPERTIES = ["capture", "key", "ask", "at", "private", "plugin", "approved"];

function fillPage(doc: Doc, templateId: ItemId, page: ItemId, today: Date): Doc {
  const withChildren = copyChildren(doc, templateId, page, (text) => withToday(text, today));
  const shaping = Object.entries(doc.items[templateId].properties).filter(([key]) => !OWN_PROPERTIES.includes(key));
  return shaping.reduce((shaped, [key, value]) => setItemProperty(shaped, page, key, withToday(value, today)), withChildren);
}

export interface Captured {
  doc: Doc;
  id: ItemId;
  target: ItemId;
}

/** Files `text` with `properties` where the template says, creating the target's missing pages. */
export function capture(doc: Doc, template: Template, text: string, properties: Record<string, string>, today: Date): Captured {
  const located = goToTarget(doc, template, today);
  const parent = located.target;
  const created = insertChild(located.doc, parent, indexFor(located.doc, parent, template), text);
  const filled = Object.entries(properties).reduce((written, [key, value]) => setItemProperty(written, created.id, key, value), created.doc);
  return { doc: filled, id: created.id, target: parent };
}

/** The item at a path of texts from the top ("Projects/Garden"), or an item id; steps that do not exist yet are added. */
function indexFor(doc: Doc, parent: ItemId, template: Template): number {
  if (template.at === "top") return 0;
  if (template.at === "bottom") return doc.items[parent].children.length;
  return newChildIndex(doc, parent);
}

function withToday(text: string, today: Date): string {
  const date = isoDate(today);
  return text.replaceAll("{date}", date).replaceAll("{tomorrow}", addDays(date, 1));
}

function placementOf(written: string | undefined): Template["at"] {
  const placement = written?.trim().toLowerCase();
  return placement === "top" || placement === "bottom" ? placement : undefined;
}

function targetOf(doc: Doc, path: string): { doc: Doc; target: ItemId; created: boolean } {
  if (doc.items[path.trim()]) return { doc, target: path.trim(), created: false };
  let current = doc;
  let at: ItemId = ROOT;
  let created = false;
  for (const step of path.split("/").map((part) => part.trim()).filter(Boolean)) {
    const found = current.items[at].children.find((child) => isStep(current, child, step));
    created = !found;
    if (found) {
      at = found;
      continue;
    }
    const added = insertChild(current, at, newChildIndex(current, at), step);
    current = added.doc;
    at = added.id;
  }
  return { doc: current, target: at, created };
}

/** A template is never a place to file into, even when it bears its target's name. */
function isStep(doc: Doc, id: ItemId, step: string): boolean {
  const item = doc.items[id];
  return item.text.trim().toLowerCase() === step.toLowerCase() && !("capture" in item.properties);
}

function isoDate(day: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** What a share or a link asked to capture: `?capture[=template]&title=…&text=…&url=…`; `&go` visits the target instead. */
export function captureRequest(search: string): { template: string; text: string; go: boolean } | null {
  const params = new URLSearchParams(search);
  const shared = ["title", "text", "url"].map((name) => params.get(name)?.trim() ?? "").filter(Boolean);
  if (!params.has("capture") && shared.length === 0) return null;
  return { template: params.get("capture") ?? "", text: [...new Set(shared)].join(" "), go: params.has("go") };
}
