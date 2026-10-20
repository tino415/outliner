import { $, ChangeOrigin, commitAndRender, commitFromEventHandler, doc, onChangeHere, state } from "./app";
import { Doc, ItemId, insertChild, isDescendant, newChildIndex, setFlags, setItemProperty, setNote, setText } from "./model";
import { propertiesOf, propertyKey } from "./notes";
import { Plugin, TRUST_KEY, approvalOf, isApproved, listenedEvents, pluginsIn } from "./plugins";
import { EVENT_NAMES, EventName, OutlineEvent, eventsBetween, isEventName } from "./events";
import { addKey, keys } from "./keyring";
import { newKey } from "./sync/privacy";
import { Command } from "./keys";
import { toast } from "./chrome";
import { escape } from "./inline";

/*
 * Runs approved plugins (doc/adr/0030), each in a sandboxed iframe with an
 * opaque origin and no network: it cannot see the page, this device's
 * storage, the sync token or the keys. It talks to the app only by messages,
 * and a command or an event handler may read and change only the item it
 * runs on and what is under it (doc/adr/0038).
 */

interface Running {
  plugin: Plugin;
  frame: HTMLIFrameElement;
  labels: string[];
  events: Set<EventName>;
}

interface Run {
  target: ItemId;
  plugin: ItemId;
  /** The old and new parent of a moved item, which its handler may read but not change. */
  readable: ItemId[];
  /** Shared by the handlers of one change, so what they do joins its undo step. */
  joining?: { version: number };
}

const running = new Map<ItemId, Running>();
const runs = new Map<number, Run>();
let nextRun = 0;
let refreshTimer: number | undefined;

export function bindPlugins(): void {
  window.addEventListener("message", answer);
  onChangeHere(firePluginEvents);
  dialog().addEventListener("click", (event) => void onDialogClick(event));
  void refreshPlugins();
}

/** Starts plugins newly approved here, stops those whose code changed or are gone; soon after the outline changes. */
export function pluginsMayHaveChanged(): void {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void refreshPlugins(), 300);
}

async function refreshPlugins(): Promise<void> {
  const approved = new Map<ItemId, Plugin>();
  for (const plugin of pluginsIn(doc())) if (await isApproved(plugin, keys()[TRUST_KEY])) approved.set(plugin.id, plugin);
  for (const [id, each] of running) {
    if (approved.get(id)?.code !== each.plugin.code) stop(id);
  }
  for (const [id, plugin] of approved) {
    if (!running.has(id)) start(plugin);
    else running.get(id)!.plugin = plugin;
  }
}

function start(plugin: Plugin): void {
  const frame = document.createElement("iframe");
  frame.sandbox.add("allow-scripts");
  frame.hidden = true;
  frame.dataset.plugin = plugin.name;
  frame.srcdoc = sandboxPage(plugin.code);
  document.body.append(frame);
  running.set(plugin.id, { plugin, frame, labels: [], events: new Set() });
}

function stop(id: ItemId): void {
  running.get(id)?.frame.remove();
  running.delete(id);
}

export function pluginCommands(target: ItemId): Command[] {
  return [...running.values()].flatMap(({ plugin, frame, labels }) =>
    labels.map((label) => ({
      label: `${plugin.name}: ${label}`,
      shortcut: "",
      run: () => {
        const run = ++nextRun;
        runs.set(run, { target, plugin: plugin.id, readable: [] });
        frame.contentWindow?.postMessage({ type: "run", run, label, item: target }, "*");
      },
    })),
  );
}

/** Changes typed, dragged or otherwise made in this tab; not undo, redo, another tab, another device or a handler's own answer. */
function firePluginEvents(before: Doc, after: Doc, origin: ChangeOrigin): void {
  if (origin !== "edit") return;
  const listening = [...running.values()].filter((each) => each.events.size > 0);
  if (listening.length === 0) return;
  const joining = { version: state.history.version };
  for (const event of eventsBetween(before, after)) {
    for (const each of listening) if (each.events.has(event.event)) sendEvent(each, event, joining);
  }
}

function sendEvent(to: Running, event: OutlineEvent, joining: { version: number }): void {
  const run = ++nextRun;
  const readable = [event.from, event.to].filter((id): id is ItemId => id !== null);
  runs.set(run, { target: event.id, plugin: to.plugin.id, readable, joining });
  const seen = (id: ItemId | null) => (id && doc().items[id] ? itemAsSeen(id) : null);
  to.frame.contentWindow?.postMessage({ type: "event", run, event: event.event, item: seen(event.id), from: seen(event.from), to: seen(event.to) }, "*");
}

function itemAsSeen(id: ItemId) {
  const item = doc().items[id];
  const { approved: _, ...properties } = item.properties;
  return { id: item.id, text: item.text, note: item.note, properties, children: item.children, completed: item.completed };
}

// ---- messages from plugins ------------------------------------------------------------

type Call = { type: "call"; id: number; run: number | null; method: string; args: unknown[] };
type Message = { type: "commands"; labels: string[] } | { type: "listens"; events: unknown[] } | Call | { type: "done"; run: number } | { type: "failed"; run: number; error: string };

function answer(event: MessageEvent): void {
  const from = [...running.values()].find((each) => each.frame.contentWindow === event.source);
  if (!from) return;
  const message = event.data as Message;
  if (message.type === "commands") from.labels = message.labels.map(String).slice(0, 20);
  if (message.type === "listens") from.events = new Set(message.events.filter(isEventName));
  if (message.type === "done") runs.delete(message.run);
  if (message.type === "failed") {
    runs.delete(message.run);
    toast(`${from.plugin.name}: ${String(message.error).slice(0, 160)}`);
  }
  if (message.type === "call") {
    let reply: { value?: unknown; error?: string };
    try {
      reply = { value: perform(message, from.plugin) };
    } catch (error) {
      reply = { error: (error as Error).message };
    }
    from.frame.contentWindow?.postMessage({ type: "result", id: message.id, ...reply }, "*");
  }
}

/** Settings that would let a plugin seal items, start another plugin or vouch for one, set directly or as a note line. */
const GUARDED_SETTINGS = new Set(["private", "plugin", "approved"]);

function refuseGuarded(keys: string[]): void {
  const guarded = keys.find((key) => GUARDED_SETTINGS.has(key));
  if (guarded) throw new Error(`a plugin cannot change the ${guarded} setting`);
}

function perform(call: Call, plugin: Plugin): unknown {
  const active = call.run === null ? undefined : runs.get(call.run);
  const scope = active?.plugin === plugin.id ? active.target : undefined;
  const reachable = (id: unknown): ItemId => {
    if (typeof id !== "string" || !doc().items[id]) throw new Error(`no item ${String(id)}`);
    if (!scope || (id !== scope && !isDescendant(doc(), id, scope))) throw new Error("a command can only reach the item it runs on and what is under it");
    return id;
  };
  const readable = (id: unknown): ItemId => (scope && typeof id === "string" && active!.readable.includes(id) && doc().items[id] ? id : reachable(id));
  const change = (next: Doc) => {
    if (active?.joining) active.joining.version = commitFromEventHandler(next, active.joining.version);
    else commitAndRender(next, null);
  };
  const text = (value: unknown) => String(value ?? "").slice(0, 10_000);
  switch (call.method) {
    case "item":
      return itemAsSeen(readable(call.args[0]));
    case "complete": {
      const id = reachable(call.args[0]);
      change(setFlags(doc(), id, { completed: call.args[1] !== false }));
      return null;
    }
    case "setProperty": {
      const id = reachable(call.args[0]);
      const key = propertyKey(text(call.args[1]));
      if (!key) throw new Error("a property key is up to 64 letters, digits, - or _");
      refuseGuarded([key]);
      change(setItemProperty(doc(), id, key, text(call.args[2])));
      return null;
    }
    case "setText": {
      const id = reachable(call.args[0]);
      change(setText(doc(), id, text(call.args[1])));
      return null;
    }
    case "setNote": {
      const id = reachable(call.args[0]);
      const note = text(call.args[1]);
      refuseGuarded([...propertiesOf(note).keys()]);
      change(setNote(doc(), id, note));
      return null;
    }
    case "add": {
      const parent = reachable(call.args[0]);
      const created = insertChild(doc(), parent, newChildIndex(doc(), parent), text(call.args[1]));
      change(created.doc);
      return created.id;
    }
    case "toast":
      toast(`${plugin.name}: ${text(call.args[0]).slice(0, 160)}`);
      return null;
    default:
      throw new Error(`unknown call ${call.method}`);
  }
}

function sandboxPage(code: string): string {
  const host = `
    const commands = new Map();
    const listeners = new Map();
    const events = ${JSON.stringify(EVENT_NAMES)};
    let queue = Promise.resolve();
    const oneAtATime = (task) => { queue = queue.then(task); };
    const waiting = new Map();
    let lastCall = 0;
    let run = null;
    const call = (method, ...args) => new Promise((resolve, reject) => {
      const id = ++lastCall;
      waiting.set(id, { resolve, reject });
      parent.postMessage({ type: "call", id, run, method, args }, "*");
    });
    const outline = {
      command(label, action) {
        commands.set(String(label), action);
        parent.postMessage({ type: "commands", labels: [...commands.keys()] }, "*");
      },
      on(event, handler) {
        if (!events.includes(event)) throw new Error("no event " + event + "; there are " + events.join(", "));
        listeners.set(event, [...(listeners.get(event) || []), handler]);
        parent.postMessage({ type: "listens", events: [...listeners.keys()] }, "*");
      },
      item: (item) => call("item", idOf(item)),
      complete: (item, done = true) => call("complete", idOf(item), done !== false),
      setText: (item, text) => call("setText", idOf(item), text),
      setNote: (item, note) => call("setNote", idOf(item), note),
      setProperty: (item, key, value) => call("setProperty", idOf(item), key, value),
      add: (parent, text) => call("add", idOf(parent), text),
      toast: (message) => call("toast", message),
    };
    const idOf = (item) => (item && typeof item === "object" ? item.id : item);
    addEventListener("unhandledrejection", (event) => {
      parent.postMessage({ type: "failed", run, error: String(event.reason && event.reason.message || event.reason) }, "*");
    });
    const during = async (current, action) => {
      run = current;
      try {
        await action();
        parent.postMessage({ type: "done", run: current }, "*");
      } catch (error) {
        parent.postMessage({ type: "failed", run: current, error: String(error && error.message || error) }, "*");
      }
    };
    addEventListener("message", ({ data }) => {
      if (data.type === "result") {
        const pending = waiting.get(data.id);
        waiting.delete(data.id);
        if (data.error) pending.reject(new Error(data.error));
        else pending.resolve(data.value);
      }
      if (data.type === "run") {
        oneAtATime(() => during(data.run, async () => commands.get(data.label)(await call("item", data.item))));
      }
      if (data.type === "event") {
        const handlers = listeners.get(data.event) || [];
        oneAtATime(() => during(data.run, async () => {
          for (const handler of handlers) await handler({ item: data.item, from: data.from, to: data.to });
        }));
      }
    });`;
  const safe = (script: string) => script.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'"><script>${safe(host)}</script><script>${safe(code)}</script>`;
}

// ---- the Plugins dialog ----------------------------------------------------------------

const dialog = () => $<HTMLDialogElement>("plugins-dialog");

export async function openPlugins(): Promise<void> {
  await showPlugins();
  dialog().showModal();
}

async function showPlugins(): Promise<void> {
  const trust = keys()[TRUST_KEY];
  const plugins = pluginsIn(doc());
  const rows = await Promise.all(
    plugins.map(async (plugin) => {
      const approved = await isApproved(plugin, trust);
      const status = approved ? "Approved, running here" : plugin.approval ? "Changed since it was approved" : "Not approved";
      const events = listenedEvents(plugin.code);
      const listens = events.length > 0 ? `<p class="plugin-events">Acts by itself when an item is ${events.join(", ")} on this device</p>` : "";
      const action = trust && !approved ? `<button type="button" class="sync-connect" data-approve="${escape(plugin.id)}">Approve this code</button>` : "";
      return `<li><strong>${escape(plugin.name)}</strong> <span class="plugin-status">${status}</span>${listens}<pre>${escape(plugin.code)}</pre>${action}</li>`;
    }),
  );
  $("plugin-list").innerHTML = rows.join("") || `<li class="key-none">No plugins. A plugin is an item with a <code>plugin</code> property naming it and a <code>\`\`\`js</code> block in its note.</li>`;
  $("plugin-trust").innerHTML = trust
    ? "This device is trusted: it can approve plugins, and approvals made here count on every trusted device."
    : `This device cannot approve plugins. <button type="button" class="link-button" data-trust>Make it trusted</button>, or add the key <code>${TRUST_KEY}</code> from a trusted device in ⋯ → Private keys.`;
}

async function onDialogClick(event: MouseEvent): Promise<void> {
  const target = event.target as HTMLElement;
  if (target === dialog() || target.closest("[data-close-dialog]")) dialog().close();
  if (target.closest("[data-trust]")) {
    addKey(TRUST_KEY, newKey());
    await showPlugins();
  }
  const approve = target.closest<HTMLElement>("[data-approve]");
  if (approve) {
    const plugin = pluginsIn(doc()).find((each) => each.id === approve.dataset.approve);
    if (!plugin) return;
    const approval = await approvalOf(plugin.code, keys()[TRUST_KEY]);
    commitAndRender(setItemProperty(doc(), plugin.id, "approved", approval), null);
    await refreshPlugins();
    await showPlugins();
  }
}

export function pluginTarget(editing: ItemId | null): ItemId {
  return editing ?? state.zoom;
}
