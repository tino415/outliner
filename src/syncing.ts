import { Doc, ROOT, appendOutline, emptyDoc } from "./model";
import { Clock, newDeviceId } from "./sync/clock";
import { Endpoint, SyncError, exchange } from "./sync/client";
import { MAX_TEXT } from "./sync/protocol";
import { Change, Replica, allChanges, diff, materialize, merge } from "./sync/replica";
import { $, commitAndRender, doc, onChangeHere, state } from "./app";
import { caretNow } from "./editing";
import { zoomTo } from "./navigation";
import { render } from "./render";
import { saveDocSoon } from "./storage";
import { toast } from "./chrome";

/*
 * The app's side of sync (doc/adr/0011, 0012). Every change made here is
 * diffed into field changes, merged into the local replica and queued; the
 * queue goes to the server shortly after, and whatever the server has that
 * is newer comes back and is merged in. Remote changes reset undo history
 * (doc/adr/0015). Tabs of one browser are replicas too (doc/adr/0018).
 */

const SYNC_KEY = "outliner-lab:sync:v1";
const PUSH_DELAY_MS = 400;
const POLL_MS = 5000;

interface Saved extends Endpoint {
  device: string;
  seq: number;
  replica: Replica;
  pending: Change[];
}

type Status = "off" | "synced" | "pending" | "offline" | "refused" | "rejected";

const TAB = newDeviceId();

let saved: Saved | null = null;
let clock: Clock | null = null;
let status: Status = "off";
let statusDetail = "";
let lastSynced: Date | null = null;
let inFlight: Promise<void> | null = null;
let again = false;
let pushTimer: number | undefined;

export function syncedDoc(): Doc | null {
  saved = loadSaved();
  if (!saved) return null;
  clock = clockFor(saved);
  return materialize(saved.replica);
}

export function isSyncing(): boolean {
  return saved !== null;
}

export function startSync(): void {
  onChangeHere((before, after) => {
    if (!saved || !clock) return;
    const fromTabs = absorbOtherTabs();
    const changes = diff(before, after, saved.replica, () => clock!.tick());
    if (changes.length + fromTabs.length === 0) return;
    merge(saved.replica, changes);
    saved.pending = latestPerField([...saved.pending, ...changes]);
    write();
    if (fromTabs.length > 0) showRemoteChanges();
    setStatus("pending");
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(syncNow, PUSH_DELAY_MS);
  });
  window.addEventListener("storage", (event) => event.key === SYNC_KEY && followOtherTab());
  window.setInterval(() => document.visibilityState === "visible" && syncNow(), POLL_MS);
  window.addEventListener("online", () => syncNow());
  window.addEventListener("focus", () => syncNow());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && syncNow());
  bindSyncDialog();
  setStatus(saved ? "pending" : "off");
  syncNow();
}

/** Sends what is queued and merges what came back; overlapping calls fold into one more round. */
export function syncNow(): Promise<void> {
  if (!saved) return Promise.resolve();
  if (inFlight) {
    again = true;
    return inFlight;
  }
  inFlight = roundTrip().finally(() => {
    inFlight = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return inFlight;
}

async function roundTrip(): Promise<void> {
  const current = saved!;
  const sent = current.pending.filter(fitsOnServer);
  try {
    const response = await exchange(current, { since: current.seq, changes: sent });
    if (saved !== current) return;
    const fromTabs = absorbOtherTabs();
    current.pending = current.pending.filter((change) => !sent.some((done) => sameChange(done, change)));
    for (const change of response.changes) clock!.observe(change.clock);
    const fromServer = merge(current.replica, response.changes);
    current.seq = Math.max(current.seq, response.seq);
    write();
    if (fromTabs.length + fromServer.length > 0) showRemoteChanges();
    lastSynced = new Date();
    showQueueStatus();
  } catch (error) {
    if (!(error instanceof SyncError) || error.status === undefined) setStatus("offline");
    else if (error.status === 401) setStatus("refused");
    else setStatus("rejected", error.message);
  }
}

function showQueueStatus(): void {
  const tooLong = saved!.pending.filter((change) => !fitsOnServer(change)).length;
  if (tooLong > 0) setStatus("rejected", `${tooLong === 1 ? "A note or item is" : `${tooLong} notes or items are`} over ${MAX_TEXT.toLocaleString()} characters, too long to sync; shorten it to send it`);
  else setStatus(saved!.pending.length > 0 ? "pending" : "synced");
}

function fitsOnServer(change: Change): boolean {
  return typeof change.value !== "string" || change.value.length <= MAX_TEXT;
}

function showRemoteChanges(): void {
  const caret = caretNow();
  const next = materialize(saved!.replica, doc());
  state.history.reset(next);
  saveDocSoon(next);
  if (!next.items[state.zoom]) zoomTo(ROOT);
  else render(caret);
}

/** Only the latest change to each field needs sending; typing would otherwise queue one per keystroke. */
function latestPerField(changes: Change[]): Change[] {
  const latest = new Map<string, Change>();
  for (const change of changes) {
    const key = `${change.item}\u0000${change.field}`;
    const known = latest.get(key);
    if (!known || known.clock < change.clock) latest.set(key, change);
  }
  return [...latest.values()];
}

function sameChange(a: Change, b: Change): boolean {
  return a.item === b.item && a.field === b.field && a.clock === b.clock;
}

// ---- other tabs of this browser ---------------------------------------------------------------

function followOtherTab(): void {
  const stored = loadSaved();
  if (!stored) {
    saved = null;
    clock = null;
    setStatus("off");
  } else if (!saved || stored.server !== saved.server || stored.token !== saved.token) {
    saved = stored;
    clock = clockFor(stored);
    showRemoteChanges();
    showQueueStatus();
  } else if (absorbOtherTabs().length > 0) {
    showRemoteChanges();
  }
}

/** Merges in what other tabs stored since this tab last read it; returns the field changes that won here. */
function absorbOtherTabs(): Change[] {
  const stored = loadSaved();
  if (!saved || !stored || stored.server !== saved.server) return [];
  const theirs = allChanges(stored.replica);
  for (const change of theirs) clock!.observe(change.clock);
  saved.pending = latestPerField([...saved.pending, ...stored.pending]);
  saved.seq = Math.max(saved.seq, stored.seq);
  return merge(saved.replica, theirs);
}

// ---- connecting -------------------------------------------------------------------------

type Connected = { outcome: "uploaded" } | { outcome: "joined"; replaced: Doc };

/**
 * Joins this device to a server. If the server already holds an outline, this
 * device switches to it and hands back the outline it replaced; otherwise this
 * device's outline is uploaded.
 */
async function connect(endpoint: Endpoint): Promise<Connected> {
  const response = await exchange(endpoint, { since: 0, changes: [] });
  const fresh: Saved = { ...endpoint, device: newDeviceId(), seq: response.seq, replica: {}, pending: [] };
  const newClock = clockFor(fresh);
  for (const change of response.changes) newClock.observe(change.clock);
  merge(fresh.replica, response.changes);
  const serverHasOutline = materialize(fresh.replica).items[ROOT].children.length > 0;
  const mine = doc();
  if (!serverHasOutline) {
    const upload = diff(emptyDoc(), mine, fresh.replica, () => newClock.tick());
    merge(fresh.replica, upload);
    fresh.pending = upload;
  }
  saved = fresh;
  clock = newClock;
  write();
  if (serverHasOutline) showRemoteChanges();
  await syncNow();
  return serverHasOutline ? { outcome: "joined", replaced: mine } : { outcome: "uploaded" };
}

function disconnect(): void {
  saved = null;
  clock = null;
  localStorage.removeItem(SYNC_KEY);
  setStatus("off");
}

function addBack(replaced: Doc): void {
  const title = `From this device, ${new Date().toLocaleDateString()}`;
  commitAndRender(appendOutline(doc(), replaced, title).doc, null);
}

function clockFor(state: Saved): Clock {
  const result = new Clock(`${state.device}.${TAB}`);
  for (const change of allChanges(state.replica)) result.observe(change.clock);
  return result;
}

function loadSaved(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null");
  } catch {
    return null;
  }
}

function write(): void {
  if (!saved) return;
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(saved));
  } catch (error) {
    console.error("could not save sync state", error);
  }
}

// ---- status and the sync dialog -------------------------------------------------------------

const STATUS_TEXT: Record<Status, string> = {
  off: "Sync is off",
  synced: "Synced",
  pending: "Syncing…",
  offline: "Offline: changes are kept here and sent when the server is reachable",
  refused: "The server refused the token",
  rejected: "The server rejected some changes; they are kept here",
};

function setStatus(next: Status, detail = ""): void {
  status = next;
  statusDetail = detail;
  const dot = $("sync-status");
  dot.hidden = next === "off";
  dot.dataset.status = next;
  dot.title = lastSynced && next === "synced" ? `Synced at ${lastSynced.toLocaleTimeString()}` : detail || STATUS_TEXT[next];
  $("sync-state").textContent = dot.title;
  $("sync-dialog").dataset.connected = String(next !== "off");
}

function bindSyncDialog(): void {
  const dialog = $<HTMLDialogElement>("sync-dialog");
  const form = $<HTMLFormElement>("sync-form");
  const server = $<HTMLInputElement>("sync-server");
  const token = $<HTMLInputElement>("sync-token");

  document.addEventListener("click", (event) => {
    if (!(event.target as Element).closest('[data-action="sync"], #sync-status')) return;
    $("menu").hidePopover();
    server.value = saved?.server ?? server.value;
    token.value = saved?.token ?? "";
    setStatus(status, statusDetail);
    dialog.showModal();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    button.disabled = true;
    $("sync-state").textContent = "Connecting…";
    try {
      const connected = await connect({ server: server.value.trim(), token: token.value.trim() });
      dialog.close();
      if (connected.outcome === "uploaded") toast("Connected: this outline is now synced");
      else if (connected.replaced.items[ROOT].children.length === 0) toast("Connected: showing the outline from the server");
      else toast("Connected: showing the outline from the server", { label: "Add mine back", run: () => addBack(connected.replaced) });
    } catch (error) {
      $("sync-state").textContent = (error as Error).message;
    } finally {
      button.disabled = false;
    }
  });

  $("sync-disconnect").addEventListener("click", () => {
    disconnect();
    dialog.close();
    toast("Sync is off; the outline stays on this device");
  });
  $("sync-close").addEventListener("click", () => dialog.close());
}
