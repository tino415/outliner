import {
  Doc,
  ItemId,
  ROOT,
  ancestors,
  childrenInOrder,
  indexInParent,
  insertChild,
  liftNoteProperties,
  isDescendant,
  moveTo,
  newChildIndex,
  remove,
  setFlags,
  setItemProperty,
  setNote,
  setText,
} from "../src/model";
import { exportJson, exportMarkdown, exportOpml, graft, parseIndentedText } from "../src/transfer";
import { attachmentLink, typeFromName } from "../src/attachmentLinks";
import { downloadFile, sha256Hex, uploadFile } from "../src/sync/files";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { findItems } from "../src/search";
import { Template, capture, captureTemplates } from "../src/capture";
import { Cell, columnCells, declaredColumns, inferredColumns } from "../src/properties";
import { isSealed, propertyKey, propertyLines, sealedKeyOf } from "../src/notes";
import { Clock, newDeviceId } from "../src/sync/clock";
import { Endpoint, exchange } from "../src/sync/client";
import { Replica, diff, materialize, merge } from "../src/sync/replica";
import { watch } from "./watch";

export const USAGE = `outline: read and change the synced outline

usage: outline <command> [arguments] [options]

commands:
  show [ITEM]              the outline, or one item and everything under it
  find QUERY               items whose text contains every word of QUERY
  add TEXT                 a new item; TEXT "-" reads indented lines from stdin
  edit ITEM TEXT           replace an item's text
  note ITEM TEXT           replace an item's note ("" removes it)
  done ITEM / undone ITEM  complete or reopen an item
  move ITEM --under ITEM   move an item and everything under it; --before
                           or --after ITEM put it beside ITEM instead
  set ITEM KEY VALUE       set a property of an item; an empty VALUE
                           removes it
  capture TEXT             file TEXT with a capture template (--template NAME,
                           the first by default) and --set KEY=VALUE properties
  rm ITEM                  delete an item and everything under it
  attach ITEM FILE         upload FILE and link it in the item's note; prints
                           its hash
  file HASH PATH           save the attached file with that hash to PATH
  export [ITEM]            --md (default), --opml or --json
  watch                    keep running and print a line per change made
                           anywhere from now on: added, moved, completed
                           (or reopened), changed; --json for scripts

ITEM is an item id, or a path of item texts separated by "/", like
"Projects/Garden". "/" alone is the top of the outline.

options:
  --json         print JSON instead of text
  --ids          show item ids in text output
  --columns      show: a table of properties, parents summing their
                 children (columns from a ":columns:" property, or all)
  --depth N      show only N levels
  --under ITEM   where add puts the new item (default: the top)
  --first        add or move to the first place instead of the last
  --before ITEM  add or move to just before ITEM, beside it
  --after ITEM   add or move to just after ITEM, beside it
  --note TEXT    a note for the item add creates
  --template T   the capture template named T, or with :key: T
  --set K=V      a property for capture; repeat for more
  --limit N      how many items find prints (default 20)
  --every N      how many seconds watch waits between asking (default 5)
  --server URL   the sync server (default: $OUTLINE_SERVER)
  --token TOKEN  its token (default: $OUTLINE_TOKEN)

OUTLINE_SERVER and OUTLINE_TOKEN can also be KEY=value lines in
$XDG_CONFIG_HOME/outline/config (~/.config/outline/config); the
environment wins over the file.
`;

export interface Outcome {
  output: string;
  code: number;
}

interface Options {
  json: boolean;
  columns: boolean;
  ids: boolean;
  first: boolean;
  depth?: number;
  under?: string;
  before?: string;
  after?: string;
  note?: string;
  template?: string;
  set: string[];
  limit: number;
  every: number;
  format: "md" | "opml" | "json";
  server?: string;
  token?: string;
}

export interface Streaming {
  print: (line: string) => void;
  signal?: AbortSignal;
}

const toStdout: Streaming = { print: (line) => process.stdout.write(`${line}\n`) };

export async function run(argv: string[], env: Record<string, string | undefined>, stdin = "", streaming = toStdout): Promise<Outcome> {
  try {
    const { words, options } = parseArguments(argv);
    const [command, ...args] = words;
    if (!command || command === "help" || argv.includes("--help")) return { output: USAGE, code: command ? 0 : 1 };
    const endpoint = { server: options.server ?? env.OUTLINE_SERVER ?? "", token: options.token ?? env.OUTLINE_TOKEN ?? "" };
    if (!endpoint.server || !endpoint.token) return fail("set OUTLINE_SERVER and OUTLINE_TOKEN in the environment or ~/.config/outline/config, or pass --server and --token");
    if (command === "watch") {
      await watch(endpoint, { ...streaming, json: options.json, intervalMs: options.every * 1000 });
      return { output: "", code: 0 };
    }
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
      if (options.json) return json(tree(doc, top, options.depth, options.columns ? columnsOf(doc, top).cells : undefined));
      return options.columns ? showTable(doc, top, options) : showText(doc, top, options);
    }
    case "find": {
      const found = findItems(doc, args.join(" "), options.limit);
      if (options.json) return json(found);
      return found.map((item) => `${item.id}  ${[...item.path, item.text].join(" / ")}`).join("\n");
    }
    case "add": {
      const { parent, at } = place(doc, options);
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
      if (args[0]) writable(doc, resolve(doc, args[0]));
      return changeItem(outline, args, (next, id) => setNote(next, id, args.slice(1).join(" ")));
    case "done":
      return changeItem(outline, args, (next, id) => setFlags(next, id, { completed: true }));
    case "undone":
      return changeItem(outline, args, (next, id) => setFlags(next, id, { completed: false }));
    case "move": {
      if (!options.under && besideOf(options) === undefined) throw new Error("move needs --under, --before or --after ITEM");
      const { parent, at, beside } = place(doc, options);
      return changeItem(outline, args, (next, id) => {
        if (id === beside) throw new Error("cannot move an item beside itself");
        if (id === parent || isDescendant(next, parent, id)) throw new Error("cannot move an item under itself");
        return moveTo(next, id, parent, at);
      });
    }
    case "set": {
      if (args[0]) writable(doc, resolve(doc, args[0]));
      const [, key, ...words] = args;
      if (!key || !propertyKey(key)) throw new Error("set needs ITEM KEY VALUE; KEY is up to 64 letters, digits, - or _");
      return changeItem(outline, args, (next, id) => setItemProperty(next, id, key, words.join(" ")));
    }
    case "capture": {
      const text = args.join(" ");
      if (!text) throw new Error("capture needs some text");
      const templates = captureTemplates(doc);
      const template = options.template ? templateNamed(templates, options.template) : templates[0];
      if (!template) throw new Error(`no capture template named ${options.template}; there are ${templates.map((each) => each.name).join(", ")}`);
      const result = capture(doc, template, text, propertiesFrom(options.set), new Date());
      for (const id of [result.target, ...ancestors(result.doc, result.target)]) writable(result.doc, id);
      await outline.save(result.doc);
      return options.json ? json({ id: result.id, under: result.target }) : result.id;
    }
    case "rm":
      return changeItem(outline, args, (next, id) => remove(next, id));
    case "attach": {
      const [item, path] = args;
      if (item) writable(outline.doc, resolve(outline.doc, item));
      if (!item || !path) throw new Error("attach needs ITEM FILE");
      const bytes = readLocalFile(path);
      const hash = await sha256Hex(bytes);
      const type = typeFromName(path);
      await uploadFile(outline.endpoint, hash, type, bytes);
      const link = attachmentLink(basename(path), hash, type);
      await changeItem(outline, [item], (next, id) => setNote(next, id, [next.items[id].note, link].filter(Boolean).join("\n")));
      return hash;
    }
    case "file": {
      const [hash, path] = args;
      if (!/^[0-9a-f]{64}$/.test(hash ?? "") || !path) throw new Error("file needs HASH PATH; HASH is the 64 letters after att: in a note");
      const blob = await downloadFile(outline.endpoint, hash);
      if (!blob) throw new Error(`no file ${hash} on the server`);
      writeFileSync(path, new Uint8Array(await blob.arrayBuffer()));
      return path;
    }
    case "export": {
      const top = resolve(doc, args[0] ?? "/");
      if (options.format === "opml") return exportOpml(doc, top);
      if (options.format === "json") return exportJson(doc);
      return exportMarkdown(doc, top).trimEnd();
    }
    default:
      throw new Error(`unknown command ${command}; run outline help`);
  }
}

interface Place {
  parent: ItemId;
  at: number;
  beside?: ItemId;
}

function place(doc: Doc, options: Options): Place {
  const beside = besideOf(options);
  if (beside === undefined) {
    const parent = writable(doc, resolve(doc, options.under ?? "/"));
    return { parent, at: options.first ? 0 : newChildIndex(doc, parent) };
  }
  if (options.under !== undefined || options.first) throw new Error("--before and --after cannot go with --under or --first");
  const sibling = resolve(doc, beside);
  if (sibling === ROOT) throw new Error("the top of the outline has no place beside it");
  const at = indexInParent(doc, sibling) + (options.after !== undefined ? 1 : 0);
  return { parent: writable(doc, doc.items[sibling].parent!), at, beside: sibling };
}

function besideOf(options: Options): string | undefined {
  if (options.before !== undefined && options.after !== undefined) throw new Error("give either --before or --after, not both");
  return options.before ?? options.after;
}

/** The item, unless it is private: what is inside one can only change on a device with its key (doc/adr/0029). */
function writable(doc: Doc, id: ItemId): ItemId {
  if (isSealed(doc.items[id].note)) throw new Error(`${doc.items[id].text} is private: only a device with the key ${sealedKeyOf(doc.items[id].note)} can change what is in it`);
  return id;
}

function readLocalFile(path: string): Uint8Array<ArrayBuffer> {
  try {
    return new Uint8Array(readFileSync(path));
  } catch (error) {
    throw new Error(`cannot read ${path}: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}`);
  }
}

async function changeItem(outline: Outline, args: string[], change: (doc: Doc, id: ItemId) => Doc): Promise<string> {
  if (!args[0]) throw new Error("which item? give an id or a path");
  const id = resolve(outline.doc, args[0]);
  if (id === ROOT) throw new Error("that is the top of the outline, not an item");
  await outline.save(change(outline.doc, id));
  return id;
}

function templateNamed(templates: Template[], wanted: string): Template | undefined {
  const name = wanted.toLowerCase();
  return templates.find((template) => template.name.toLowerCase() === name) ?? templates.find((template) => template.key === name);
}

function propertiesFrom(assignments: string[]): Record<string, string> {
  return Object.fromEntries(
    assignments.map((assignment) => {
      const match = /^([\p{L}\p{N}_-]+)=(.*)$/u.exec(assignment);
      if (!match) throw new Error(`--set needs KEY=VALUE, not ${assignment}`);
      return [match[1], match[2]];
    }),
  );
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
    readonly endpoint: Endpoint,
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
    const changes = diff(this.doc, liftNoteProperties(next), this.replica, () => this.clock.tick());
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
  properties?: Record<string, string>;
  columns?: Record<string, string>;
  children: Tree[];
}

function tree(doc: Doc, id: ItemId, depth = Infinity, cells?: Map<ItemId, Map<string, Cell>>): Tree {
  const item = doc.items[id];
  const properties = Object.entries(item.properties);
  const row = cells?.get(id);
  return {
    id,
    text: item.text,
    ...(isSealed(item.note) ? { private: sealedKeyOf(item.note) } : item.note ? { note: item.note } : {}),
    ...(item.completed ? { completed: true } : {}),
    ...(properties.length > 0 ? { properties: Object.fromEntries(properties) } : {}),
    ...(row && row.size > 0 ? { columns: Object.fromEntries([...row].map(([key, cell]) => [key, cell.text])) } : {}),
    children: depth > 0 ? childrenInOrder(doc, id).map((child) => tree(doc, child, depth - 1, cells)) : [],
  };
}

function columnsOf(doc: Doc, top: ItemId): { keys: string[]; cells: Map<ItemId, Map<string, Cell>> } {
  const columns = declaredColumns(doc, top) ?? inferredColumns(doc, top);
  return { keys: columns.map((column) => column.key), cells: columnCells(doc, top, columns) };
}

/** The outline as a table: one row per item, indented, with a right-aligned column per property and rollups on parents. */
function showTable(doc: Doc, top: ItemId, options: Options): string {
  const { keys, cells } = columnsOf(doc, top);
  const rows: { label: string; values: string[] }[] = [];
  const visit = (id: ItemId, depth: number) => {
    const item = doc.items[id];
    const label = `${"  ".repeat(depth)}${item.completed ? `~~${item.text}~~` : item.text}${options.ids ? `  [${id}]` : ""}`;
    rows.push({ label, values: keys.map((key) => cells.get(id)?.get(key)?.text ?? "") });
    if (options.depth !== undefined && depth >= options.depth) return;
    for (const child of childrenInOrder(doc, id)) visit(child, depth + 1);
  };
  if (top === ROOT) childrenInOrder(doc, ROOT).forEach((child) => visit(child, 0));
  else visit(top, 0);
  const labelWidth = Math.max(0, ...rows.map((row) => displayWidth(row.label)));
  const widths = keys.map((key, i) => Math.max(displayWidth(key), ...rows.map((row) => displayWidth(row.values[i]))));
  const format = (label: string, values: string[]) =>
    [padEnd(label, labelWidth), ...values.map((value, i) => padStart(value, widths[i]))].join("   ").trimEnd();
  return [format("", keys), ...rows.map((row) => format(row.label, row.values))].join("\n");
}

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}]/u;
const ZERO_WIDTH = /[\p{M}​-‏︀-️]/u;

/** Columns a terminal gives the text: wide East Asian characters and emoji take two, combining marks none. */
function displayWidth(text: string): number {
  return [...text].reduce((width, char) => width + (ZERO_WIDTH.test(char) ? 0 : WIDE.test(char) ? 2 : 1), 0);
}

function padEnd(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

function padStart(text: string, width: number): string {
  return " ".repeat(Math.max(0, width - displayWidth(text))) + text;
}

function showText(doc: Doc, top: ItemId, options: Options): string {
  const lines: string[] = [];
  if (top !== ROOT) lines.push(line(doc, top, 0, options));
  const walk = (id: ItemId, depth: number) => {
    if (options.depth !== undefined && depth >= options.depth) return;
    for (const child of childrenInOrder(doc, id)) {
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
  const shownNote = isSealed(item.note) ? `🔒 private, sealed with the key ${sealedKeyOf(item.note)}` : [...propertyLines(item.properties), item.note].filter(Boolean).join("\n");
  const note = shownNote ? `\n${shownNote.split("\n").map((noteLine) => `${pad}  ${noteLine}`).join("\n")}` : "";
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
  const options: Options = { json: false, columns: false, ids: false, first: false, limit: 20, every: 5, format: "md", set: [] };
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
    else if (arg === "--columns") options.columns = true;
    else if (arg === "--first") options.first = true;
    else if (arg === "--md" || arg === "--opml") options.format = arg.slice(2) as Options["format"];
    else if (arg === "--depth") options.depth = Number(value());
    else if (arg === "--under") options.under = value();
    else if (arg === "--before") options.before = value();
    else if (arg === "--after") options.after = value();
    else if (arg === "--note") options.note = value();
    else if (arg === "--limit") options.limit = Number(value());
    else if (arg === "--every") options.every = positive(arg, value());
    else if (arg === "--template") options.template = value();
    else if (arg === "--set") options.set.push(value());
    else if (arg === "--server") options.server = value();
    else if (arg === "--token") options.token = value();
    else if (arg === "--help") continue;
    else words.push(arg);
  }
  if (argv.includes("--json") && words[0] === "export") options.format = "json";
  return { words, options };
}


function positive(option: string, value: string): number {
  const number = Number(value);
  if (!(number > 0)) throw new Error(`${option} needs a number of seconds above 0`);
  return number;
}
