import { commitAndRender, doc, state } from "./app";
import { ItemId, SETTINGS, setItemProperty } from "./model";
import { isSealed, propertyKey, sealedKeyOf } from "./notes";
import { PaletteOption, openPalette } from "./palette";
import { declaredColumns } from "./properties";
import { caretNow } from "./editing";
import { choosePrivacy } from "./privateItems";
import { toast } from "./chrome";

/*
 * Setting a property without typing it (doc/adr/0032): pick a key, then a
 * value. Keys offered first are the page's columns, then the keys in use;
 * values offered are the ones that key already has elsewhere. Choosing a key
 * opens the value step in the same palette.
 */

interface Choice extends PaletteOption {
  value: string;
}

export function bindPropertyChips(): void {
  document.addEventListener("mousedown", (event) => {
    if ((event.target as Element).closest?.(".prop-chip")) event.preventDefault();
  });
  document.addEventListener("click", (event) => {
    const chip = (event.target as Element).closest?.<HTMLElement>(".prop-chip");
    const owner = chip?.closest<HTMLElement>("[data-id]");
    if (chip && owner) chooseValue(owner.dataset.id!, chip.dataset.key!);
  });
}

export function chooseProperty(id: ItemId): void {
  if (sealedHere(id)) return;
  openPalette<Choice>({
    placeholder: "Property…",
    hint: "Pick a property or type a new name; its value comes next",
    candidates: (query) => {
      const wanted = query.trim().toLowerCase();
      const keys = [...new Set([...columnKeys(), ...keysByUse()])].filter((key) => key.includes(wanted));
      const fresh = propertyKey(wanted) === wanted && !keys.includes(wanted) ? [wanted] : [];
      return [...keys, ...fresh].slice(0, 30).map((key) => ({ text: doc().items[id].properties[key] ? `${key}: ${doc().items[id].properties[key]}` : key, path: [], value: key }));
    },
    choose: ({ value }) => chooseValue(id, value),
  });
}

export function chooseValue(id: ItemId, key: string): void {
  if (key === "private") return choosePrivacy(id);
  if (sealedHere(id)) return;
  const current = doc().items[id]?.properties[key];
  openPalette<Choice>({
    placeholder: `${key}: ${current ?? "value…"}`,
    hint: hintFor(key),
    candidates: (query) => {
      const typed = query.trim();
      const known = valuesOf(key).filter((value) => value.toLowerCase().includes(typed.toLowerCase()) && value !== typed);
      const choices: Choice[] = [
        ...(typed ? [{ text: `Set to ${typed}`, path: [], value: typed }] : []),
        ...known.slice(0, 12).map((value) => ({ text: value, path: [], value })),
      ];
      return current !== undefined ? [...choices, { text: `Remove ${key}`, path: [], value: "" }] : choices;
    },
    choose: ({ value }) => commitAndRender(setItemProperty(doc(), id, key, value), caretNow()),
  });
}

/** A private item this device has no key for: its properties are inside the seal, and a change could never be sent. */
function sealedHere(id: ItemId): boolean {
  const note = doc().items[id]?.note ?? "";
  if (!isSealed(note)) return false;
  toast(`This item is private: add the key ${sealedKeyOf(note)} in ⋯ → Private keys to change its properties`);
  return true;
}

function hintFor(key: string): string {
  if (SETTINGS.has(key)) return "A setting of this page; see the README for its values";
  return "A number with a unit (350 kcal), a duration (1h30m) or a time (9:00), or any text";
}

function columnKeys(): string[] {
  return (declaredColumns(doc(), state.zoom) ?? []).map((column) => column.key);
}

function keysByUse(): string[] {
  const counts = new Map<string, number>();
  for (const item of Object.values(doc().items)) for (const key of Object.keys(item.properties)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].filter(([key]) => key !== "approved").sort((a, b) => b[1] - a[1]).map(([key]) => key);
}

function valuesOf(key: string): string[] {
  const counts = new Map<string, number>();
  for (const item of Object.values(doc().items)) {
    const value = item.properties[key];
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([value]) => value);
}
