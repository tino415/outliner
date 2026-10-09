import { ItemId, ROOT } from "../model";
import { SEALED_NOTE, isSealed, sealedKeyOf } from "../notes";
import { Change, Field, Replica, allChanges, merge } from "./replica";

/*
 * Private items at the sync boundary (doc/adr/0029). The local replica holds
 * them open; what goes to the server is the private item's note replaced by
 * one sealed value holding every field of the item's note and of everything
 * under it, with their clocks, compressed and encrypted with AES-GCM. A device
 * with the key opens it back into fields and merges them as usual, and seals
 * again when what arrived lacks something it has, so edits made on two
 * devices meet on the server.
 */

/** Keys by name, each 32 random bytes in base64. */
export type Keyring = Record<string, string>;

export function newKey(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}

export function keyText(name: string, key: string): string {
  return `outline-key:1:${name}:${key}`;
}

export function keyFromText(text: string): { name: string; key: string } | null {
  const match = /^outline-key:1:([^:\s]+):([A-Za-z0-9+/=]{43,44})$/.exec(text.trim());
  return match && { name: match[1], key: match[2] };
}

export interface Outgoing {
  changes: Change[];
  /** Private items sealed in this round. */
  sealed: ItemId[];
  /** Private changes that could not be sealed: this device lacks the key, or the item lost its `private` property. */
  held: Change[];
}

/** What to send instead of `pending`: public changes as they are, each touched private item sealed whole. */
export async function sealOutgoing(pending: Change[], replica: Replica, keyring: Keyring, stamp: () => string, known: ReadonlySet<ItemId> = new Set()): Promise<Outgoing> {
  const privacy = new Privacy(replica, known);
  const changes: Change[] = [];
  const held: Change[] = [];
  const touchedRoots = new Set<ItemId>();
  for (const change of pending) {
    const root = privacy.rootOf(change.item, change.field);
    const key = root && keyring[privacy.keyNameOf(root) ?? ""];
    if (!root && change.field === "prop:private" && change.value === null) changes.push(change, ...ownFieldsAgain(change.item, replica, stamp));
    else if (!root) changes.push(...(privacy.wasRenamed(change) ? blanked(change, stamp, replica) : [change]));
    else if (change.item !== root && !change.item.startsWith(`${root}~`)) {
      if (change.field === "deleted" && change.value === true) changes.push(...blanked(change, stamp, replica));
      else if (!key) held.push(change);
    } else if (key) touchedRoots.add(root);
    else held.push(change);
  }
  for (const root of touchedRoots) {
    const name = privacy.keyNameOf(root)!;
    const sealed = await seal(root, name, keyring[name], privacy.insideOf(root));
    changes.push({ item: root, field: "note", value: sealed, clock: stamp() });
  }
  return { changes, held, sealed: [...touchedRoots] };
}

export interface Merged {
  /** The changes that won, as `merge` reports them. */
  accepted: Change[];
  /** Private items to seal again: what arrived for them lacks something this device has. */
  reseal: ItemId[];
  /** Private items opened here. */
  opened: ItemId[];
  /** Sealed notes refused: this device has a key of that name, but a different one. */
  unreadable: ItemId[];
  /** Items this device made public that arrived with items inside, still private elsewhere: to publish. */
  stranded: ItemId[];
}

/** Merges changes from the server, opening each sealed note this device has the key for. */
export async function mergeIncoming(replica: Replica, changes: Change[], keyring: Keyring, known: ReadonlySet<ItemId> = new Set()): Promise<Merged> {
  const merged: Merged = { accepted: [], reseal: [], opened: [], unreadable: [], stranded: [] };
  for (const change of changes) {
    const sealed = change.field === "note" && typeof change.value === "string" ? SEALED_NOTE.exec(change.value) : null;
    const key = sealed && keyring[sealed[1]];
    if (!key) {
      merged.accepted.push(...merge(replica, [change]));
      continue;
    }
    const inside = await open(change.item, key, sealed[2]).catch(() => null);
    if (!inside) {
      merged.unreadable.push(change.item);
      continue;
    }
    const current = replica[change.item]?.note;
    if (current && typeof current.value === "string" && isSealed(current.value)) delete replica[change.item].note;
    merged.accepted.push(...merge(replica, inside));
    merged.opened.push(change.item);
    if (hasNewerThan(new Privacy(replica).insideOf(change.item), inside)) merged.reseal.push(change.item);
    if (typeof replica[change.item]?.["prop:private"]?.value !== "string" && !known.has(change.item)) merged.stranded.push(change.item);
  }
  return merged;
}

/** The changes with each sealed note this device has the key for opened into its fields. */
export async function openIncoming(changes: Change[], keyring: Keyring): Promise<Change[]> {
  const result: Change[] = [];
  for (const change of changes) result.push(...((await opened(change, keyring)) ?? [change]));
  return result;
}

/** Sealed notes already in the replica: what to open after adding a key. */
export function sealedIn(replica: Replica): Change[] {
  return allChanges(replica).filter((change) => change.field === "note" && typeof change.value === "string" && isSealed(change.value));
}

async function opened(change: Change, keyring: Keyring): Promise<Change[] | null> {
  const sealed = change.field === "note" && typeof change.value === "string" ? SEALED_NOTE.exec(change.value) : null;
  const key = sealed && keyring[sealed[1]];
  return key ? open(change.item, key, sealed[2]).catch(() => null) : null;
}

function hasNewerThan(mine: Change[], theirs: Change[]): boolean {
  const known = new Map(theirs.map((change) => [`${change.item}\u0000${change.field}`, change.clock]));
  return mine.some((change) => {
    const clock = known.get(`${change.item}\u0000${change.field}`);
    return clock === undefined || clock < change.clock;
  });
}

/** An item made public: its note and properties replace the sealed note on the server, stamped now so they win over it. */
function ownFieldsAgain(item: ItemId, replica: Replica, stamp: () => string): Change[] {
  return allChanges(replica)
    .filter((change) => change.item === item && (change.field === "note" || (change.field.startsWith("prop:") && change.field !== "prop:private")))
    .map((change) => ({ ...change, clock: stamp() }));
}

/** An item renamed into a private item leaves its old id deleted on the server, its text, note and properties blanked. */
function blanked(deletion: Change, stamp: () => string, replica: Replica): Change[] {
  const properties = Object.keys(replica[deletion.item] ?? {}).filter((field) => field.startsWith("prop:")) as Field[];
  const emptied = properties.map((field): Change => ({ item: deletion.item, field, value: null, clock: stamp() }));
  return [deletion, { item: deletion.item, field: "text", value: "", clock: stamp() }, { item: deletion.item, field: "note", value: "", clock: stamp() }, ...emptied];
}

// ---- which items are private --------------------------------------------------------------

/**
 * Reads the replica the way the model reads the outline: an item is private
 * while it has a `private` property, it still holds live items whose
 * ids start with its own and "~", or this device has sealed or opened it
 * and it was not made public here.
 */
class Privacy {
  private holders: Set<ItemId>;
  private renamedFrom: Set<ItemId>;

  constructor(
    private replica: Replica,
    private known: ReadonlySet<ItemId> = new Set(),
  ) {
    const marked = Object.keys(replica).filter((id) => id.includes("~"));
    this.holders = new Set(marked.filter((id) => replica[id].deleted?.value !== true).map((id) => id.slice(0, id.indexOf("~"))));
    this.renamedFrom = new Set(marked.filter((id) => replica[id].deleted?.value !== true).map((id) => id.slice(id.indexOf("~") + 1)));
  }

  /** A deletion of an id that was renamed into a private item, whose old text must not stay on the server. */
  wasRenamed(change: Change): boolean {
    return change.field === "deleted" && change.value === true && this.renamedFrom.has(change.item);
  }

  keyNameOf(item: ItemId): string | null {
    const note = this.read(item, "note");
    const key = this.read(item, "prop:private");
    if (typeof key === "string") return key;
    return typeof note === "string" ? sealedKeyOf(note) : null;
  }

  isPrivate(item: ItemId): boolean {
    return this.keyNameOf(item) !== null || this.holders.has(item) || this.known.has(item);
  }

  /** The private item a field belongs to: the item's own note, an item whose id names it, or one below it. */
  rootOf(item: ItemId, field: Field): ItemId | null {
    if ((field === "note" || field.startsWith("prop:")) && this.isPrivate(item)) return item;
    const named = item.includes("~") ? item.slice(0, item.indexOf("~")) : null;
    if (named && this.isPrivate(named)) return named;
    const seen = new Set<ItemId>();
    for (let current = this.read(item, "parent") as ItemId | null | undefined; current && current !== ROOT && !seen.has(current); current = this.read(current, "parent") as ItemId | null) {
      seen.add(current);
      if (this.isPrivate(current)) return current;
    }
    return null;
  }

  /** Every field inside a private item, and its own note: what its sealed note holds. */
  insideOf(root: ItemId): Change[] {
    return allChanges(this.replica).filter((change) => change.item.startsWith(`${root}~`) || (change.item === root && (change.field === "note" || change.field.startsWith("prop:"))));
  }

  private read(item: ItemId, field: Field) {
    return this.replica[item]?.[field]?.value;
  }
}

// ---- sealing ----------------------------------------------------------------------------------

async function seal(root: ItemId, name: string, key: string, changes: Change[]): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = await squeeze(new TextEncoder().encode(JSON.stringify(changes)));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(root) }, await importKey(key), packed);
  return `🔒private:1:${name}:${toBase64(concat(iv, new Uint8Array(encrypted)))}`;
}

async function open(root: ItemId, key: string, sealed: string): Promise<Change[]> {
  const bytes = fromBase64(sealed);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode(root) }, await importKey(key), bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(await unsqueeze(new Uint8Array(plain))));
}

function importKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromBase64(key), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function squeeze(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
}

async function unsqueeze(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

function concat(first: Uint8Array, second: Uint8Array): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(first.length + second.length);
  joined.set(first);
  joined.set(second, first.length);
  return joined;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}
