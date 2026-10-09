import { ItemId, ROOT } from "../model";
import { SEALED_NOTE, isSealed, privateKeyOf } from "../notes";
import { Change, Field, Replica, allChanges } from "./replica";

/*
 * Private items at the sync boundary (doc/adr/0029). The local replica holds
 * them open; what goes to the server is the private item's note replaced by
 * one sealed value holding every field of the item's note and of everything
 * under it, with their clocks, compressed and encrypted with AES-GCM. A device
 * with the key opens it back into fields and merges them as usual, so two
 * devices editing different items inside still both keep their edits.
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
  /** Private changes that could not be sealed because this device lacks the key. */
  held: Change[];
}

/** What to send instead of `pending`: public changes as they are, each touched private item sealed whole. */
export async function sealOutgoing(pending: Change[], replica: Replica, keyring: Keyring, stamp: () => string): Promise<Outgoing> {
  const changes: Change[] = [];
  const held: Change[] = [];
  const touchedRoots = new Set<ItemId>();
  for (const change of pending) {
    const root = privateRootOf(replica, change.item, change.field);
    const wasPublic = root && change.item !== root && !change.item.startsWith(`${root}~`);
    if (!root || wasPublic) changes.push(...publishing(change, replica, stamp));
    else if (keyring[keyNameOf(replica, root)!]) touchedRoots.add(root);
    else held.push(change);
  }
  for (const root of touchedRoots) {
    const name = keyNameOf(replica, root)!;
    const sealed = await seal(root, name, keyring[name], subtreeChanges(replica, root));
    changes.push({ item: root, field: "note", value: sealed, clock: stamp() });
  }
  return { changes, held };
}

/** The changes from the server with each sealed note this device has the key for opened into its fields. */
export async function openIncoming(changes: Change[], keyring: Keyring): Promise<Change[]> {
  const opened: Change[] = [];
  for (const change of changes) {
    const sealed = change.field === "note" && typeof change.value === "string" ? SEALED_NOTE.exec(change.value) : null;
    const key = sealed && keyring[sealed[1]];
    if (!sealed || !key) {
      opened.push(change);
      continue;
    }
    const inside = await open(change.item, key, sealed[2]).catch(() => null);
    if (!inside) {
      opened.push(change);
      continue;
    }
    opened.push(...inside.map((field) => (field.item === change.item && field.field === "note" ? { ...field, clock: `${change.clock}~open` } : field)));
  }
  return opened;
}

/** Sealed notes already in the replica that `keyring` can now open: what to merge after adding a key. */
export function sealedIn(replica: Replica): Change[] {
  return allChanges(replica).filter((change) => change.field === "note" && typeof change.value === "string" && isSealed(change.value));
}

// ---- which items are private --------------------------------------------------------------

function read(replica: Replica, item: ItemId, field: Field) {
  return replica[item]?.[field]?.value;
}

function keyNameOf(replica: Replica, item: ItemId): string | null {
  const note = read(replica, item, "note");
  return typeof note === "string" ? privateKeyOf(note) : null;
}

/** The private item a field belongs to: the item's own note, or anything about an item below it. */
function privateRootOf(replica: Replica, item: ItemId, field: Field): ItemId | null {
  if (field === "note" && keyNameOf(replica, item)) return item;
  for (let current = read(replica, item, "parent") as ItemId | null | undefined; current && current !== ROOT; current = read(replica, current, "parent") as ItemId | null) {
    if (keyNameOf(replica, current)) return current;
  }
  return null;
}

function subtreeChanges(replica: Replica, root: ItemId): Change[] {
  const inside = (item: ItemId) => item.startsWith(`${root}~`) && privateRootOf(replica, item, "text") === root;
  return allChanges(replica).filter((change) => inside(change.item) || (change.item === root && change.field === "note"));
}

/**
 * A public change as it should reach the server. An item that was private
 * once (its id carries a private item's) goes out with all its fields when it
 * is moved out, since the server never had them; an item renamed when its
 * subtree was made private has its old text and note blanked there.
 */
function publishing(change: Change, replica: Replica, stamp: () => string): Change[] {
  const isDeletion = change.field === "deleted" && change.value === true;
  if (isDeletion && Object.keys(replica).some((id) => id.endsWith(`~${change.item}`))) {
    return [change, { item: change.item, field: "text", value: "", clock: stamp() }, { item: change.item, field: "note", value: "", clock: stamp() }];
  }
  if (!change.item.includes("~") || change.field !== "parent") return [change];
  return [change, ...publicSubtree(replica, change.item).filter((other) => !(other.item === change.item && other.field === "parent"))];
}

function publicSubtree(replica: Replica, top: ItemId): Change[] {
  const below = (item: ItemId): boolean => {
    for (let current: ItemId | null | undefined = item; current; current = read(replica, current, "parent") as ItemId | null) {
      if (current === top) return true;
    }
    return false;
  };
  return allChanges(replica).filter((change) => below(change.item));
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
