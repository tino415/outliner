import { Doc, ItemId } from "./model";

/*
 * Plugins (doc/adr/0030): an item with a `plugin` property and a ```js block
 * in its note. A plugin runs only where its code is approved: `approved`
 * holds an HMAC of the code made with the key named "trust", which only
 * trusted devices have. Changing the code, from anywhere, stops it
 * everywhere until a trusted device approves it again.
 */

export const TRUST_KEY = "trust";

export interface Plugin {
  id: ItemId;
  name: string;
  code: string;
  approval: string | null;
}

export function pluginsIn(doc: Doc): Plugin[] {
  return Object.values(doc.items).flatMap((item) => {
    const name = item.properties.plugin;
    const code = name ? codeOf(item.note) : null;
    return name && code !== null ? [{ id: item.id, name, code, approval: item.properties.approved ?? null }] : [];
  });
}

/** The first ```js or ```javascript block of a note. */
export function codeOf(note: string): string | null {
  const match = /^[ \t]*```(?:js|javascript)[ \t]*\n([\s\S]*?)^[ \t]*```/m.exec(note);
  return match ? match[1] : null;
}

export async function approvalOf(code: string, trustKey: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(trustKey), (char) => char.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(code)));
  return btoa(String.fromCharCode(...signature));
}

export async function isApproved(plugin: Plugin, trustKey: string | undefined): Promise<boolean> {
  return Boolean(trustKey && plugin.approval && plugin.approval === (await approvalOf(plugin.code, trustKey)));
}
