import {
  Doc,
  ItemId,
  ROOT,
  ancestors,
  insertChild,
  isDescendant,
  moveTo,
  remove,
  setFlags,
  setNote,
  setText,
} from "../src/model";
import { exportJson, exportOpml, graft, parseIndentedText, subtreesAsText } from "../src/transfer";
import { findItems } from "../src/search";
import { Clock, newDeviceId } from "../src/sync/clock";
import { Endpoint, exchange } from "../src/sync/client";
import { Replica, diff, materialize, merge } from "../src/sync/replica";

export const USAGE = `outline: read and change the synced outline

usage: outline <command> [arguments] [options]

commands:
  show [ITEM]              the outline, or one item and everything under it
  find QUERY               items whose text contains every word of QUERY
  add TEXT                 a new item; TEXT "-" reads indented lines from stdin
  edit ITEM TEXT           replace an item's text
  note ITEM TEXT           replace an item's note ("" removes it)
  done ITEM / undone ITEM  complete or reopen an item
  move ITEM --under ITEM   move an item and everything under it
  rm ITEM                  delete an item and everything under it
  export [ITEM]            --md (default), --opml or --json

ITEM is an item id, or a path of item texts separated by "/", like
"Projects/Garden". "/" alone is the top of the outline.

options:
  --json         print JSON instead of text
  --ids          show item ids in text output
  --depth N      show only N levels
  --under ITEM   where add puts the new item (default: the top)
  --first        add or move to the first place instead of the last
  --note TEXT    a note for the item add creates
  --limit N      how many items find prints (default 20)
  --server URL   the sync server (default: $OUTLINE_SERVER)
  --token TOKEN  its token (default: $OUTLINE_TOKEN)
`;

export interface Outcome {
  output: string;
  code: number;
}

interface Options {
  json: boolean;
  ids: boolean;
  first: boolean;
  depth?: number;
  under?: string;
  note?: string;
  limit: number;
  format: "md" | "opml" | "json";
  server?: string;
  token?: string;
}

export async function run(argv: string[], env: Record<string, string | undefined>, stdin = ""): Promise<Outcome> {
  try {
    const { words, options } = parseArguments(argv);
    const [command, ...args] = words;
    if (!command || command === "help" || argv.includes("--help")) return { output: USAGE, code: command ? 0 : 1 };
    const endpoint = { server: options.server ?? env.OUTLINE_SERVER ?? "", token: options.token ?? env.OUTLINE_TOKEN ?? "" };
    if (!endpoint.server || !endpoint.token) return fail("set OUTLINE_SERVER and OUTLINE_TOKEN, or pass --server and --token");
    const outline = await Outline.fetch(endpoint);
    const output = await perform(command, args, options, outline, stdin);
    return { output, code: 0 };
  } catch (error) {
    return fail((error as Error).message);
  }
}

async function perform(command: string, args: string[], options: Options, outline: Outline, stdin: string): Promise<string> {
  const doc = outline.doc;
  switch (command) {
    case "show": {
      const top = resolve(doc, args[0] ?? "/");
      return options.json ? json(tree(doc, top, options.depth)) : showText(doc, top, options);
    }
    case "find": {
      const found = findItems(doc, args.join(" "), options.limit);
      if (options.json) return json(found);
      return found.map((item) => `${item.id}  ${[...item.path, item.text].join(" / ")}`).join("\n");
    }
    case "add": {
      const parent = resolve(doc, options.under ?? "/");
      const at = options.first ? 0 : doc.items[parent].children.length;
      const text = args.join(" ");
      if (text === "-") {
        const result = graft(doc, parseIndentedText(stdin), parent, at);
        await outline.save(result.doc);
        return options.json ? json(result.ids) : result.ids.join("\n");
      }
      if (!text) throw new Error("add needs some text");
      const created = insertChild(doc, parent, at, text);
      await outline.save(options.note ? setNote(created.doc, created.id, options.note) : created.doc);
      return options.json ? json({ id: created.id }) : created.id;
    }
    case "edit":
      return changeItem(outline, args, (next, id) => setText(next, id, requireText(args, "edit")));
    case "note":
      return changeItem(outline, args, (next, id) => setNote(next, id, args.slice(1).join(" ")));
    case "done":
      return changeItem(outline, args, (next, id) => setFlags(next, id, { completed: true }));
    case "undone":
      return changeItem(outline, args, (next, id) => setFlags(next, id, { completed: false }));
    case "move": {
      if (!options.under) throw new Error("move needs --under ITEM");
      const parent = resolve(doc, options.under);
      return changeItem(outline, args, (next, id) => {
        if (id === parent || isDescendant(next, parent, id)) throw new Error("cannot move an item under itself");
        return moveTo(next, id, parent, options.first ? 0 : next.items[parent].children.length);
      });
    }
    case "rm":
      return changeItem(outline, args, (next, id) => remove(next, id));
    case "export": {
      const top = resolve(doc, args[0] ?? "/");
      if (options.format === "opml") return exportOpml(doc, top);
      if (options.format === "json") return exportJson(doc);
      return subtreesAsText(doc, doc.items[top].children);
    }
    default:
      throw new Error(`unknown command ${command}; run outline help`);
  }
}

async function changeItem(outline: Outline, args: string[], change: (doc: Doc, id: ItemId) => Doc): Promise<string> {
  if (!args[0]) throw new Error("which item? give an id or a path");
  const id = resolve(outline.doc, args[0]);
  if (id === ROOT) throw new Error("that is the top of the outline, not an item");
  await outline.save(change(outline.doc, id));
  return id;
}

function requireText(args: string[], command: string): string {
  const text = args.slice(1).join(" ");
  if (!text) throw new Error(`${command} needs the new text`);
  return text;
}

// ---- the outline on the server --------------------------------------------------------

/** The whole outline fetched from the server; `save` sends what changed and nothing else. */
class Outline {
  private constructor(
    private endpoint: Endpoint,
    private replica: Replica,
    private clock: Clock,
    readonly doc: Doc,
  ) {}

  static async fetch(endpoint: Endpoint): Promise<Outline> {
    const { changes } = await exchange(endpoint, { since: 0, changes: [] });
    const replica: Replica = {};
    merge(replica, changes);
    const clock = new Clock(`cli-${newDeviceId()}`);
    for (const change of changes) clock.observe(change.clock);
    return new Outline(endpoint, replica, clock, materialize(replica));
  }

  async save(next: Doc): Promise<void> {
    const changes = diff(this.doc, next, this.replica, () => this.clock.tick());
    if (changes.length > 0) await exchange(this.endpoint, { since: Number.MAX_SAFE_INTEGER, changes });
  }
}

// ---- items by id or path --------------------------------------------------------------

function resolve(doc: Doc, reference: string): ItemId {
  if (reference === "/" || reference === "") return ROOT;
  if (doc.items[reference]) return reference;
  let current = ROOT;
  for (const step of reference.split("/").map((part) => part.trim()).filter(Boolean)) {
    const children = doc.items[current].children;
    const exact = children.filter((child) => sameText(doc.items[child].text, step));
    const matches = exact.length > 0 ? exact : children.filter((child) => startsWith(doc.items[child].text, step));
    if (matches.length === 0) throw new Error(`no item "${step}" under ${describe(doc, current)}`);
    if (matches.length > 1) {
      const options = matches.map((id) => `  ${id}  ${doc.items[id].text}`).join("\n");
      throw new Error(`"${step}" matches ${matches.length} items under ${describe(doc, current)}; use an id:\n${options}`);
    }
    current = matches[0];
  }
  return current;
}

const comparable = (text: string) => text.trim().toLowerCase();
const sameText = (text: string, step: string) => comparable(text) === comparable(step);
const startsWith = (text: string, step: string) => comparable(text).startsWith(comparable(step));

function describe(doc: Doc, id: ItemId): string {
  if (id === ROOT) return "the top";
  return [...ancestors(doc, id).filter((a) => a !== ROOT), id].map((a) => `"${doc.items[a].text}"`).join(" / ");
}

// ---- output -----------------------------------------------------------------------------

interface Tree {
  id: ItemId;
  text: string;
  note?: string;
  completed?: boolean;
  children: Tree[];
}

function tree(doc: Doc, id: ItemId, depth = Infinity): Tree {
  const item = doc.items[id];
  return {
    id,
    text: item.text,
    ...(item.note ? { note: item.note } : {}),
    ...(item.completed ? { completed: true } : {}),
    children: depth > 0 ? item.children.map((child) => tree(doc, child, depth - 1)) : [],
  };
}

function showText(doc: Doc, top: ItemId, options: Options): string {
  const lines: string[] = [];
  if (top !== ROOT) lines.push(line(doc, top, 0, options));
  const walk = (id: ItemId, depth: number) => {
    if (options.depth !== undefined && depth >= options.depth) return;
    for (const child of doc.items[id].children) {
      lines.push(line(doc, child, depth + (top === ROOT ? 0 : 1), options));
      walk(child, depth + 1);
    }
  };
  walk(top, 0);
  return lines.join("\n");
}

function line(doc: Doc, id: ItemId, depth: number, options: Options): string {
  const item = doc.items[id];
  const pad = "  ".repeat(depth);
  const text = item.completed ? `~~${item.text}~~` : item.text;
  const note = item.note ? `\n${item.note.split("\n").map((noteLine) => `${pad}  ${noteLine}`).join("\n")}` : "";
  return `${pad}- ${text}${options.ids ? `  [${id}]` : ""}${note}`;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function fail(message: string): Outcome {
  return { output: `outline: ${message}`, code: 1 };
}

// ---- arguments ---------------------------------------------------------------------------

function parseArguments(argv: string[]): { words: string[]; options: Options } {
  const options: Options = { json: false, ids: false, first: false, limit: 20, format: "md" };
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === "--json") options.json = true;
    else if (arg === "--ids") options.ids = true;
    else if (arg === "--first") options.first = true;
    else if (arg === "--md" || arg === "--opml") options.format = arg.slice(2) as Options["format"];
    else if (arg === "--depth") options.depth = Number(value());
    else if (arg === "--under") options.under = value();
    else if (arg === "--note") options.note = value();
    else if (arg === "--limit") options.limit = Number(value());
    else if (arg === "--server") options.server = value();
    else if (arg === "--token") options.token = value();
    else if (arg === "--help") continue;
    else words.push(arg);
  }
  if (argv.includes("--json") && words[0] === "export") options.format = "json";
  return { words, options };
}

