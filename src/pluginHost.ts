import { $, commitAndRender, doc, state } from "./app";
import { ItemId, insertChild, isDescendant, newChildIndex, setNote, setText } from "./model";
import { setProperty } from "./notes";
import { Plugin, TRUST_KEY, approvalOf, isApproved, pluginsIn } from "./plugins";
import { addKey, keys } from "./keyring";
import { newKey } from "./sync/privacy";
import { Command } from "./keys";
import { toast } from "./chrome";
import { escape } from "./inline";

/*
 * Runs approved plugins (doc/adr/0030), each in a sandboxed iframe with an
 * opaque origin and no network: it cannot see the page, this device's
 * storage, the sync token or the keys. It talks to the app only by messages,
 * and a command may read and change only the item it runs on and what is
 * under it.
 */

interface Running {
  plugin: Plugin;
  frame: HTMLIFrameElement;
  labels: string[];
}

const running = new Map<ItemId, Running>();
const runs = new Map<number, { target: ItemId; plugin: ItemId }>();
let nextRun = 0;
let refreshTimer: number | undefined;

export function bindPlugins(): void {
  window.addEventListener("message", answer);
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
  running.set(plugin.id, { plugin, frame, labels: [] });
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
        runs.set(run, { target, plugin: plugin.id });
        frame.contentWindow?.postMessage({ type: "run", run, label, item: target }, "*");
      },
    })),
  );
}

// ---- messages from plugins ------------------------------------------------------------

type Call = { type: "call"; id: number; run: number | null; method: string; args: unknown[] };
type Message = { type: "commands"; labels: string[] } | Call | { type: "done"; run: number } | { type: "failed"; run: number; error: string };

function answer(event: MessageEvent): void {
  const from = [...running.values()].find((each) => each.frame.contentWindow === event.source);
  if (!from) return;
  const message = event.data as Message;
  if (message.type === "commands") from.labels = message.labels.map(String).slice(0, 20);
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

function perform(call: Call, plugin: Plugin): unknown {
  const active = call.run === null ? undefined : runs.get(call.run);
  const scope = active?.plugin === plugin.id ? active.target : undefined;
  const reachable = (id: unknown): ItemId => {
    if (typeof id !== "string" || !doc().items[id]) throw new Error(`no item ${String(id)}`);
    if (!scope || (id !== scope && !isDescendant(doc(), id, scope))) throw new Error("a command can only reach the item it runs on and what is under it");
    return id;
  };
  const text = (value: unknown) => String(value ?? "").slice(0, 10_000);
  switch (call.method) {
    case "item": {
      const item = doc().items[reachable(call.args[0])];
      return { id: item.id, text: item.text, note: item.note, children: item.children };
    }
    case "setText": {
      const id = reachable(call.args[0]);
      commitAndRender(setText(doc(), id, text(call.args[1])), null);
      return null;
    }
    case "setNote": {
      const id = reachable(call.args[0]);
      commitAndRender(setNote(doc(), id, text(call.args[1])), null);
      return null;
    }
    case "add": {
      const parent = reachable(call.args[0]);
      const created = insertChild(doc(), parent, newChildIndex(doc(), parent), text(call.args[1]));
      commitAndRender(created.doc, null);
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
      item: (id) => call("item", id),
      setText: (id, text) => call("setText", id, text),
      setNote: (id, note) => call("setNote", id, note),
      add: (parent, text) => call("add", parent, text),
      toast: (message) => call("toast", message),
    };
    addEventListener("message", async ({ data }) => {
      if (data.type === "result") {
        const pending = waiting.get(data.id);
        waiting.delete(data.id);
        if (data.error) pending.reject(new Error(data.error));
        else pending.resolve(data.value);
      }
      if (data.type === "run") {
        run = data.run;
        try {
          await commands.get(data.label)(await call("item", data.item));
          parent.postMessage({ type: "done", run: data.run }, "*");
        } catch (error) {
          parent.postMessage({ type: "failed", run: data.run, error: String(error && error.message || error) }, "*");
        }
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
      const action = trust && !approved ? `<button type="button" class="sync-connect" data-approve="${escape(plugin.id)}">Approve this code</button>` : "";
      return `<li><strong>${escape(plugin.name)}</strong> <span class="plugin-status">${status}</span><pre>${escape(plugin.code)}</pre>${action}</li>`;
    }),
  );
  $("plugin-list").innerHTML = rows.join("") || `<li class="key-none">No plugins. A plugin is an item with <code>:plugin: name</code> and a <code>\`\`\`js</code> block in its note.</li>`;
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
    commitAndRender(setNote(doc(), plugin.id, setProperty(doc().items[plugin.id].note, "approved", approval)), null);
    await refreshPlugins();
    await showPlugins();
  }
}

export function pluginTarget(editing: ItemId | null): ItemId {
  return editing ?? state.zoom;
}
