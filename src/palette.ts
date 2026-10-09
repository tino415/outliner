import { escape, plainText, renderInline } from "./inline";
import { select, selectionIn } from "./caret";

export interface PaletteOption {
  text: string;
  path: string[];
  shortcut?: string;
}

export interface PaletteRequest<O extends PaletteOption> {
  placeholder: string;
  hint: string;
  candidates: (query: string) => O[];
  choose: (option: O) => void;
}

const dialog = document.getElementById("palette") as HTMLDialogElement;
const input = dialog.querySelector<HTMLInputElement>("input")!;
const list = dialog.querySelector<HTMLElement>(".palette-results")!;
const hint = dialog.querySelector<HTMLElement>(".palette-hint")!;

let current: PaletteRequest<PaletteOption> | null = null;
let shown: PaletteOption[] = [];
let active = 0;

export function openPalette<O extends PaletteOption>(request: PaletteRequest<O>): void {
  current = request as unknown as PaletteRequest<PaletteOption>;
  caretToRestore = caretInFocusedEditor();
  input.value = "";
  input.placeholder = request.placeholder;
  hint.textContent = request.hint;
  refresh();
  dialog.showModal();
  input.focus();
}

input.addEventListener("input", refresh);

input.addEventListener("keydown", (event) => {
  const step = stepFor(event);
  if (step) {
    event.preventDefault();
    active = (active + step + shown.length) % Math.max(shown.length, 1);
    paintActive();
  } else if (event.key === "Enter") {
    event.preventDefault();
    choose(active);
  } else if (event.key === "Escape") {
    event.preventDefault();
    dismiss();
  }
});

/** The dialog's close event comes a task later; a key typed right after Escape must already find the caret back. */
function dismiss(): void {
  dialog.close();
  restoreCaret();
}

function stepFor(event: KeyboardEvent): -1 | 1 | null {
  if (event.key === "ArrowDown") return 1;
  if (event.key === "ArrowUp") return -1;
  const ctrlItself = event.ctrlKey && !event.metaKey && !event.altKey;
  if (ctrlItself && event.code === "KeyN") return 1;
  if (ctrlItself && event.code === "KeyP") return -1;
  return null;
}

list.addEventListener("click", (event) => {
  const option = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
  if (option) choose(Number(option.dataset.index));
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dismiss();
});

function refresh(): void {
  shown = current?.candidates(input.value) ?? [];
  active = 0;
  list.innerHTML = shown.map(optionHtml).join("") || `<li class="palette-empty">Nothing found</li>`;
  paintActive();
}

function optionHtml(option: PaletteOption, index: number): string {
  const isCommand = option.shortcut !== undefined;
  const text = `<span class="palette-text">${renderInline(option.text) || "<em>Untitled</em>"}</span>`;
  const path = option.path.length ? `<span class="palette-path">${option.path.map((step) => escape(plainText(step))).join(" / ")}</span>` : "";
  const shortcut = isCommand ? `<span class="palette-shortcut">${option.shortcut}</span>` : "";
  return `<li role="option" data-index="${index}"${isCommand ? ` class="palette-command"` : ""}>${text}${path}${shortcut}</li>`;
}

function paintActive(): void {
  list.querySelectorAll<HTMLElement>("[data-index]").forEach((option, index) => {
    option.classList.toggle("active", index === active);
    if (index === active) option.scrollIntoView({ block: "nearest" });
  });
}

function choose(index: number): void {
  const option = shown[index];
  if (!option || !current) return;
  const request = current;
  dialog.close();
  restoreCaret();
  request.choose(option);
}

/*
 * Leaving an editor re-renders it, so the browser's own focus return puts the
 * caret at its start; a command or a cancelled palette must find it where it was.
 */
let caretToRestore: { editor: HTMLElement; start: number; end: number } | null = null;

function caretInFocusedEditor(): typeof caretToRestore {
  const editor = document.activeElement;
  if (!(editor instanceof HTMLElement) || !editor.isContentEditable) return null;
  const selection = selectionIn(editor);
  return selection && { editor, ...selection };
}

function restoreCaret(): void {
  const saved = caretToRestore;
  caretToRestore = null;
  if (!saved || !saved.editor.isConnected) return;
  saved.editor.focus({ preventScroll: true });
  select(saved.editor, saved.start, saved.end);
}

dialog.addEventListener("close", restoreCaret);
