import { Candidate } from "./search";
import { escape, renderInline } from "./inline";

export interface PaletteRequest {
  placeholder: string;
  hint: string;
  candidates: (query: string) => Candidate[];
  choose: (candidate: Candidate) => void;
}

const dialog = document.getElementById("palette") as HTMLDialogElement;
const input = dialog.querySelector<HTMLInputElement>("input")!;
const list = dialog.querySelector<HTMLElement>(".palette-results")!;
const hint = dialog.querySelector<HTMLElement>(".palette-hint")!;

let current: PaletteRequest | null = null;
let shown: Candidate[] = [];
let active = 0;

export function openPalette(request: PaletteRequest): void {
  current = request;
  input.value = "";
  input.placeholder = request.placeholder;
  hint.textContent = request.hint;
  refresh();
  dialog.showModal();
  input.focus();
}

input.addEventListener("input", refresh);

input.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    active = (active + step + shown.length) % Math.max(shown.length, 1);
    paintActive();
  } else if (event.key === "Enter") {
    event.preventDefault();
    choose(active);
  }
});

list.addEventListener("click", (event) => {
  const option = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
  if (option) choose(Number(option.dataset.index));
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

function refresh(): void {
  shown = current?.candidates(input.value) ?? [];
  active = 0;
  list.innerHTML =
    shown
      .map(
        (candidate, index) =>
          `<li role="option" data-index="${index}">` +
          `<span class="palette-text">${renderInline(candidate.text) || "<em>Untitled</em>"}</span>` +
          (candidate.path.length ? `<span class="palette-path">${candidate.path.map(escape).join(" / ")}</span>` : "") +
          `</li>`,
      )
      .join("") || `<li class="palette-empty">Nothing found</li>`;
  paintActive();
}

function paintActive(): void {
  list.querySelectorAll<HTMLElement>("[data-index]").forEach((option, index) => {
    option.classList.toggle("active", index === active);
    if (index === active) option.scrollIntoView({ block: "nearest" });
  });
}

function choose(index: number): void {
  const candidate = shown[index];
  if (!candidate || !current) return;
  const request = current;
  dialog.close();
  request.choose(candidate);
}
