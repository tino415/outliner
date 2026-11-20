import { Doc, ItemId, tagsOf } from "./model";
import { checksFor, isChecksItem, typePartOf, typeWordsOffered } from "./checks";
import { isInCode } from "./notes";
import { caretRect, select, selectionIn } from "./caret";
import { escape } from "./inline";
import { insertText, liftTagPickedAt } from "./editing";
import { kindsIn } from "./kinds";

/*
 * A small list under the caret that finishes what is being typed: property
 * keys after a `:` at the start of a note line (doc/adr/0020), tags after `#`,
 * kinds at the start of an item (doc/adr/0027).
 * Choosing replaces the typed part through the browser's own text insertion,
 * so the edit goes through the input event like any typing and can be undone.
 */

interface Typed {
  start: number;
  prefix: string;
  finish: (word: string) => string;
  words: (doc: Doc) => string[];
}

const KEY_BEING_TYPED = /(^|\n)([ \t]*:)([\p{L}\p{N}_-]*)$/u;
const KIND_BEING_TYPED = /^\p{Lu}\p{L}*(?: \p{L}+){0,2}$/u;
const TAG_BEING_TYPED = /(^|[\s(\[])#([\p{L}\p{N}_-]*)$/u;
const LIMIT = 8;

const list = document.createElement("ul");
list.className = "completion";
list.setAttribute("role", "listbox");
list.hidden = true;
document.body.append(list);

let editor: HTMLElement | null = null;
let typed: Typed | null = null;
let shown: string[] = [];
let active = 0;
let offeredAt = 0;

export function bindCompletion(doc: () => Doc): void {
  document.addEventListener("input", (event) => {
    const target = event.target as HTMLElement;
    if (target.matches(".text[data-id], .note[data-id]")) offerCompletion(target, doc());
  });
  document.addEventListener("keydown", steerCompletion, true);
  document.addEventListener("focusout", closeCompletion);
  document.addEventListener("selectionchange", closeWhenTheCaretMoves);
  list.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const option = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (option) choose(Number(option.dataset.index));
  });
}

export function offerCompletion(target: HTMLElement, current: Doc): void {
  const caret = selectionIn(target);
  const text = target.textContent ?? "";
  const before = text.slice(0, caret?.start ?? 0);
  typed = caret && caret.start === caret.end ? typedInChecks(current, target, before) ?? typedAt(before, target.classList.contains("note")) : null;
  if (!typed) return closeCompletion();
  const prefix = typed.prefix.toLowerCase();
  const words = typed.words(current);
  shown = words.filter((word) => word.toLowerCase().startsWith(prefix) && word.toLowerCase() !== prefix).slice(0, LIMIT);
  if (shown.length === 0) return closeCompletion();
  editor = target;
  offeredAt = caret!.start;
  active = 0;
  paint();
}

function typedAt(before: string, inNote: boolean): Typed | null {
  if (inNote && isInCode(before)) return null;
  const key = inNote ? KEY_BEING_TYPED.exec(before) : null;
  if (key) return { start: before.length - key[3].length - 1, prefix: key[3], finish: finishKey, words: keysIn };
  const kind = inNote ? null : KIND_BEING_TYPED.exec(before);
  if (kind) return { start: 0, prefix: kind[0], finish: finishKind, words: kindsIn };
  const tag = TAG_BEING_TYPED.exec(before);
  if (tag) return { start: before.length - tag[2].length - 1, prefix: tag[2], finish: finishTag, words: tagsIn };
  return null;
}

/** What is being written under a `Checks:` item (a key, its type, the values of one of), or in a note after `:key: ` of a key that has a check. */
function typedInChecks(current: Doc, editor: HTMLElement, before: string): Typed | null {
  const id = editor.dataset.id;
  const item = id ? current.items[id] : undefined;
  if (!item) return null;
  if (editor.classList.contains("note")) return enumValueInNote(current, id!, before);
  const parent = item.parent ? current.items[item.parent] : undefined;
  const grandparent = parent?.parent ? current.items[parent.parent] : undefined;
  if (parent && isChecksItem(parent)) return checkBeingWritten(before, parent.parent!);
  const check = parent && grandparent && isChecksItem(grandparent) ? typePartOf(parent.text) : null;
  if (check && /^(?:unique )?one of$/i.test(parent!.text.slice(check.typeStart).trim())) {
    return { start: 0, prefix: before, finish: (value) => value, words: (doc) => valuesUnder(doc, grandparent!.parent!, check.key) };
  }
  return null;
}

function checkBeingWritten(before: string, ruled: ItemId): Typed | null {
  const type = /^([\p{L}\p{N}_-]+): (.*)$/u.exec(before);
  if (type) return { start: type[1].length + 2, prefix: type[2], finish: (word) => word, words: typeWordsOffered };
  const key = /^[\p{L}\p{N}_-]*$/u.exec(before);
  return key ? { start: 0, prefix: before, finish: (word) => `${word}: `, words: (doc) => keysUnder(doc, ruled) } : null;
}

function enumValueInNote(current: Doc, id: ItemId, before: string): Typed | null {
  const written = /(?:^|\n)[ \t]*:([\p{L}\p{N}_-]+):[ \t]+([^\n]*)$/u.exec(before);
  const check = written && checksFor(current, id).get(written[1].toLowerCase());
  if (!written || !check || check.type.kind !== "oneOf") return null;
  const values = check.type.values;
  return { start: before.length - written[2].length, prefix: written[2], finish: (value) => value, words: () => values };
}

function keysUnder(doc: Doc, ruled: ItemId): string[] {
  return byUse(itemsUnder(doc, ruled).flatMap((id) => Object.keys(doc.items[id].properties)));
}

function valuesUnder(doc: Doc, ruled: ItemId, key: string): string[] {
  return byUse(itemsUnder(doc, ruled).flatMap((id) => doc.items[id].properties[key] ?? []));
}

function itemsUnder(doc: Doc, parent: ItemId): ItemId[] {
  return doc.items[parent].children.filter((id) => !isChecksItem(doc.items[id])).flatMap((id) => [id, ...itemsUnder(doc, id)]);
}

const finishKey = (key: string) => `:${key}: `;
const finishTag = (tag: string) => `#${tag} `;
const finishKind = (kind: string) => `${kind}: `;

function keysIn(doc: Doc): string[] {
  return byUse(Object.values(doc.items).flatMap((item) => Object.keys(item.properties)));
}

export function tagsIn(doc: Doc): string[] {
  return byUse(Object.values(doc.items).flatMap(tagsOf));
}

/** Most used first; a word written in several cases keeps its most common spelling. */
function byUse(words: string[]): string[] {
  const counts = new Map<string, Map<string, number>>();
  for (const word of words) {
    const spellings = counts.get(word.toLowerCase()) ?? new Map<string, number>();
    spellings.set(word, (spellings.get(word) ?? 0) + 1);
    counts.set(word.toLowerCase(), spellings);
  }
  const total = (spellings: Map<string, number>) => [...spellings.values()].reduce((sum, count) => sum + count, 0);
  const commonest = (spellings: Map<string, number>) => [...spellings].sort((a, b) => b[1] - a[1])[0][0];
  return [...counts.values()].sort((a, b) => total(b) - total(a)).map(commonest);
}

function steerCompletion(event: KeyboardEvent): void {
  closeWhenTheCaretMoves();
  if (list.hidden || event.target !== editor || event.isComposing) return;
  const ctrlItself = event.ctrlKey && !event.metaKey && !event.altKey;
  const step =
    event.key === "ArrowDown" || (ctrlItself && event.code === "KeyN") ? 1 : event.key === "ArrowUp" || (ctrlItself && event.code === "KeyP") ? -1 : 0;
  if (step) {
    active = (active + step + shown.length) % shown.length;
    paint();
  } else if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
    choose(active);
  } else if (event.key === "Escape") {
    closeCompletion();
  } else {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) closeCompletion();
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}

function choose(index: number): void {
  const target = editor;
  const word = shown[index];
  const caret = target && selectionIn(target);
  if (!target || !typed || !word || !caret) return closeCompletion();
  const replacement = typed.finish(word);
  const picksTag = typed.finish === finishTag;
  const tagStart = typed.start;
  const after = (target.textContent ?? "").slice(caret.end);
  select(target, typed.start, caret.end);
  closeCompletion();
  insertText(replacement.endsWith(" ") && /^\s/.test(after) ? replacement.trimEnd() : replacement);
  if (picksTag) liftTagPickedAt(target.dataset.id!, tagStart);
}

/** A click, undo or anything else that moves the caret without typing leaves what was being typed. */
function closeWhenTheCaretMoves(): void {
  if (list.hidden || !editor) return;
  const caret = selectionIn(editor);
  if (!caret || caret.start !== caret.end || caret.start !== offeredAt) closeCompletion();
}

export function closeCompletion(): void {
  list.hidden = true;
  editor = null;
}

function paint(): void {
  list.innerHTML = shown
    .map((word, index) => `<li role="option" data-index="${index}"${index === active ? ` class="active"` : ""}>${escape(typed!.finish(word).trim())}</li>`)
    .join("");
  const rect = caretRect() ?? editor!.getBoundingClientRect();
  list.style.left = `${Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 220)}px`;
  list.style.top = `${rect.bottom + window.scrollY + 4}px`;
  list.hidden = false;
}
