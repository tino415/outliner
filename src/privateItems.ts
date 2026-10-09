import { $, commitAndRender, doc } from "./app";
import { ItemId, makePublic, setNote } from "./model";
import { privateKeyOf, setProperty } from "./notes";
import { PaletteOption, openPalette } from "./palette";
import { addKey, keys } from "./keyring";
import { keyFromText, keyText, newKey } from "./sync/privacy";
import { forgetPrivate, openWithNewKeys } from "./syncing";
import { toast } from "./chrome";
import { escape } from "./inline";

/* Making items private and handling this device's keys (doc/adr/0029). */

const dialog = () => $<HTMLDialogElement>("keys-dialog");

export function bindPrivateKeys(): void {
  dialog().addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target === dialog() || target.closest("[data-close-dialog]")) dialog().close();
    const copy = target.closest<HTMLElement>("[data-copy-key]");
    if (copy) void navigator.clipboard?.writeText(keyText(copy.dataset.copyKey!, keys()[copy.dataset.copyKey!])).then(() => say("Copied. Paste it under Add a key on your other device."));
  });
  $("key-new-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $<HTMLInputElement>("key-new-name");
    const name = input.value.trim();
    if (keys()[name]) return say(`There is already a key named ${name}.`);
    addKey(name, newKey());
    input.value = "";
    showKeys();
    say(`Made ${name}. Copy it to your other devices before you rely on it.`);
  });
  $("key-add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $<HTMLInputElement>("key-add-text");
    const found = keyFromText(input.value);
    if (!found) return say("That is not a key; it starts with outline-key:1:");
    addKey(found.name, found.key);
    input.value = "";
    showKeys();
    say(`Added ${found.name}.`);
    void openWithNewKeys();
  });
}

export function openPrivateKeys(): void {
  showKeys();
  say("");
  dialog().showModal();
}

function showKeys(): void {
  const names = Object.keys(keys());
  $("key-list").innerHTML = names.length
    ? names.map((name) => `<li><span>${escape(name)}</span><input readonly value="${escape(keyText(name, keys()[name]))}" aria-label="The key ${escape(name)}" /><button type="button" class="link-button" data-copy-key="${escape(name)}">Copy</button></li>`).join("")
    : `<li class="key-none">No keys on this device yet.</li>`;
}

function say(message: string): void {
  $("key-state").textContent = message;
}

interface KeyChoice extends PaletteOption {
  key: string;
}

/** Asks which key to seal the item with, or makes it public again. */
export function choosePrivacy(id: ItemId): void {
  const current = privateKeyOf(doc().items[id].note);
  openPalette<KeyChoice>({
    placeholder: "Make private with the key…",
    hint: "The item stays readable; its note and everything under it are encrypted when synced",
    candidates: (query) => {
      const wanted = query.trim();
      const choice = (key: string, text: string): KeyChoice => ({ text, path: [], key });
      const existing = Object.keys(keys()).filter((name) => name.toLowerCase().includes(wanted.toLowerCase()));
      const fresh = /^[A-Za-z0-9_-]+$/.test(wanted) && !keys()[wanted] ? [choice(wanted, `New key: ${wanted}`)] : [];
      return [...existing.map((name) => choice(name, name)), ...fresh, ...(current ? [choice("", "Make public again")] : [])];
    },
    choose: ({ key }) => {
      if (key && !keys()[key]) addKey(key, newKey());
      if (!key) forgetPrivate(id);
      commitAndRender(key ? setNote(doc(), id, setProperty(doc().items[id].note, "private", key)) : makePublic(doc(), id), { id, offset: 0 });
      toast(key ? `Private with the key ${key}. Copy the key to your other devices in ⋯ → Private keys.` : "Public again");
    },
  });
}

