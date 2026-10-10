import { Doc } from "./model";
import { isInCode, withoutCode } from "./notes";
import { caretRect, select, selectionIn } from "./caret";
import { escape, tagsWritten } from "./inline";
import { insertText } from "./editing";
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
  typed = caret && caret.start === caret.end ? typedAt(text.slice(0, caret.start), target.classList.contains("note")) : null;
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

const finishKey = (key: string) => `:${key}: `;
const finishTag = (tag: string) => `#${tag} `;
const finishKind = (kind: string) => `${kind}: `;

function keysIn(doc: Doc): string[] {
  return byUse(Object.values(doc.items).flatMap((item) => Object.keys(item.properties)));
}

function tagsIn(doc: Doc): string[] {
  return byUse(Object.values(doc.items).flatMap((item) => tagsWritten(`${item.text}\n${withoutCode(item.note)}`)));
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
  const after = (target.textContent ?? "").slice(caret.end);
  select(target, typed.start, caret.end);
  closeCompletion();
  insertText(replacement.endsWith(" ") && /^\s/.test(after) ? replacement.trimEnd() : replacement);
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
