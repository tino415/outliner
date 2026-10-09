import { Doc, ItemId, ROOT, insertChild, newChildIndex, setItemProperty } from "./model";

/*
 * Capture, as in org-capture (doc/adr/0023): a template is an item whose note
 * has a `:capture:` property naming where new items go; `:ask:` lists the
 * properties to ask for, `:at: top` or `:at: bottom` overrides where the
 * target page files new items (`:new: top`, or the bottom),
 * `:key:` is a letter that picks the template. The template's own text is
 * its name. `{date}` in the target is today, so `Journal/{date}` files into
 * a page per day; missing pages on the way are created.
 */

export interface Template {
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
      const properties = doc.items[child].properties;
      const target = properties.capture;
      if (target) {
        templates.push({
          name: doc.items[child].text.trim() || target,
          target,
          ask: (properties.ask ?? "").split(/[\s,]+/).filter(Boolean),
          at: placementOf(properties.at),
          key: (properties.key ?? "").slice(0, 1).toLowerCase(),
        });
      }
      walk(child);
    }
  };
  walk(ROOT);
  return templates.length ? templates : [INBOX];
}

export interface Captured {
  doc: Doc;
  id: ItemId;
  target: ItemId;
}

/** Files `text` with `properties` where the template says, creating the target's missing pages. */
export function capture(doc: Doc, template: Template, text: string, properties: Record<string, string>, today: Date): Captured {
  const located = targetOf(doc, template.target.replaceAll("{date}", isoDate(today)));
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

function placementOf(written: string | undefined): Template["at"] {
  const placement = written?.trim().toLowerCase();
  return placement === "top" || placement === "bottom" ? placement : undefined;
}

function targetOf(doc: Doc, path: string): { doc: Doc; target: ItemId } {
  if (doc.items[path.trim()]) return { doc, target: path.trim() };
  let current = doc;
  let at: ItemId = ROOT;
  for (const step of path.split("/").map((part) => part.trim()).filter(Boolean)) {
    const found = current.items[at].children.find((child) => isStep(current, child, step));
    if (found) {
      at = found;
      continue;
    }
    const created = insertChild(current, at, current.items[at].children.length, step);
    current = created.doc;
    at = created.id;
  }
  return { doc: current, target: at };
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

/** What a share or a link asked to capture: `?capture[=template]&title=…&text=…&url=…`. */
export function captureRequest(search: string): { template: string; text: string } | null {
  const params = new URLSearchParams(search);
  const shared = ["title", "text", "url"].map((name) => params.get(name)?.trim() ?? "").filter(Boolean);
  if (!params.has("capture") && shared.length === 0) return null;
  return { template: params.get("capture") ?? "", text: [...new Set(shared)].join(" ") };
}
