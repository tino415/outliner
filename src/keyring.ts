import { Keyring } from "./sync/privacy";

/* This device's keys for private items (doc/adr/0029), kept as they are: anyone with this browser profile can read them. */

const KEYS_KEY = "outliner-lab:keys:v1";

export function keys(): Keyring {
  try {
    return JSON.parse(localStorage.getItem(KEYS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function addKey(name: string, key: string): void {
  localStorage.setItem(KEYS_KEY, JSON.stringify({ ...keys(), [name]: key }));
}

export function removeKey(name: string): void {
  const { [name]: _, ...rest } = keys();
  localStorage.setItem(KEYS_KEY, JSON.stringify(rest));
}
