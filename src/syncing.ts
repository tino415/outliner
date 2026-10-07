import { Doc, ROOT, emptyDoc } from "./model";
import { Clock, newDeviceId } from "./sync/clock";
import { Endpoint, SyncError, exchange } from "./sync/client";
import { Change, Replica, diff, materialize, merge } from "./sync/replica";
import { $, doc, onChangeHere, state } from "./app";
import { caretNow } from "./editing";
import { zoomTo } from "./navigation";
import { render } from "./render";
import { toast } from "./chrome";

/*
 * The app's side of sync (doc/adr/0011, 0012). Every change made here is
 * diffed into field changes, merged into the local replica and queued; the
 * queue goes to the server shortly after, and whatever the server has that
 * is newer comes back and is merged in. Remote changes reset undo history
 * (doc/adr/0015).
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

type Status = "off" | "synced" | "pending" | "offline" | "refused";

let saved: Saved | null = null;
let clock: Clock | null = null;
let status: Status = "off";
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

export function startSync(): void {
  onChangeHere((before, after) => {
    if (!saved || !clock) return;
    const changes = diff(before, after, saved.replica, () => clock!.tick());
    if (changes.length === 0) return;
    merge(saved.replica, changes);
    queue(changes);
    persist();
    setStatus("pending");
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(syncNow, PUSH_DELAY_MS);
  });
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
  const sent = [...current.pending];
  try {
    const response = await exchange(current, { since: current.seq, changes: sent });
    if (saved !== current) return;
    current.pending = current.pending.filter((change) => !sent.includes(change));
    for (const change of response.changes) clock!.observe(change.clock);
    const won = merge(current.replica, response.changes);
    current.seq = response.seq;
    persist();
    if (won.length > 0) showRemoteChanges();
    lastSynced = new Date();
    setStatus(current.pending.length > 0 ? "pending" : "synced");
  } catch (error) {
    setStatus(error instanceof SyncError && error.status === 401 ? "refused" : "offline");
  }
}

function showRemoteChanges(): void {
  const caret = caretNow();
  const next = materialize(saved!.replica, doc());
  state.history.reset(next);
  if (!next.items[state.zoom]) zoomTo(ROOT);
  else render(caret);
}

/** Only the latest change to each field needs sending; typing would otherwise queue one per keystroke. */
function queue(changes: Change[]): void {
  const replaced = new Set(changes.map((change) => `${change.item}\u0000${change.field}`));
  saved!.pending = [...saved!.pending.filter((change) => !replaced.has(`${change.item}\u0000${change.field}`)), ...changes];
}

// ---- connecting -------------------------------------------------------------------------

/**
 * Joins this device to a server. If the server already holds an outline, this
 * device switches to it; otherwise this device's outline is uploaded.
 */
async function connect(endpoint: Endpoint): Promise<"joined" | "uploaded"> {
  const response = await exchange(endpoint, { since: 0, changes: [] });
  const device = newDeviceId();
  const fresh: Saved = { ...endpoint, device, seq: response.seq, replica: {}, pending: [] };
  const newClock = clockFor(fresh);
  for (const change of response.changes) newClock.observe(change.clock);
  merge(fresh.replica, response.changes);
  const serverHasOutline = Object.keys(fresh.replica).some((id) => id !== ROOT);
  if (!serverHasOutline) {
    const upload = diff(emptyDoc(), doc(), fresh.replica, () => newClock.tick());
    merge(fresh.replica, upload);
    fresh.pending = upload;
  }
  saved = fresh;
  clock = newClock;
  persist();
  if (serverHasOutline) showRemoteChanges();
  await syncNow();
  return serverHasOutline ? "joined" : "uploaded";
}

function disconnect(): void {
  saved = null;
  clock = null;
  localStorage.removeItem(SYNC_KEY);
  setStatus("off");
}

function clockFor(state: Saved): Clock {
  const result = new Clock(state.device);
  for (const fields of Object.values(state.replica)) {
    for (const written of Object.values(fields)) result.observe(written!.clock);
  }
  return result;
}

function loadSaved(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null");
  } catch {
    return null;
  }
}

function persist(): void {
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
};

function setStatus(next: Status): void {
  status = next;
  const dot = $("sync-status");
  dot.hidden = next === "off";
  dot.dataset.status = next;
  dot.title = lastSynced && next === "synced" ? `Synced at ${lastSynced.toLocaleTimeString()}` : STATUS_TEXT[next];
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
    setStatus(status);
    dialog.showModal();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    button.disabled = true;
    $("sync-state").textContent = "Connecting…";
    try {
      const outcome = await connect({ server: server.value.trim(), token: token.value.trim() });
      dialog.close();
      toast(outcome === "joined" ? "Connected: showing the outline from the server" : "Connected: this outline is now synced");
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
