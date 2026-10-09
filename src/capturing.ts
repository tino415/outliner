import { Template, capture, captureRequest, captureTemplates } from "./capture";
import { commitAndRender, doc } from "./app";
import { escape, itemLabel } from "./inline";
import { toast } from "./chrome";
import { zoomTo } from "./navigation";

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dialog = element<HTMLDialogElement>("capture-dialog");
const form = element<HTMLFormElement>("capture-form");
const chooser = element("capture-templates");
const text = element<HTMLInputElement>("capture-text");
const fields = element("capture-fields");
const target = element("capture-target");

let templates: Template[] = [];
let chosen = 0;

export function bindCapture(): void {
  chooser.addEventListener("click", (event) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (option) choose(Number(option.dataset.index));
  });
  chooser.addEventListener("keydown", (event) => {
    const picked = templates.findIndex((template) => template.key && template.key === event.key.toLowerCase());
    if (picked === -1 || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    choose(picked);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    file();
  });
  element("capture-close").addEventListener("click", () => dialog.close());
}

export function openCapture(templateName = "", prefill = ""): void {
  templates = captureTemplates(doc());
  const named = templates.findIndex((template) => template.name.toLowerCase() === templateName.toLowerCase());
  chosen = Math.max(named, 0);
  text.value = prefill;
  fields.innerHTML = "";
  paint();
  dialog.showModal();
  if (templates.length > 1 && named === -1 && !prefill) chooser.querySelector<HTMLElement>(".active")!.focus();
  else text.focus();
}

/** A share, a home-screen shortcut or a link can open the app straight into capture. */
export function captureFromAddress(): void {
  const request = captureRequest(location.search);
  if (!request) return;
  history.replaceState(null, "", location.pathname + location.hash);
  openCapture(request.template, request.text);
}

function choose(index: number): void {
  chosen = index;
  paint();
  text.focus();
}

function paint(): void {
  const template = templates[chosen];
  chooser.hidden = templates.length < 2;
  chooser.innerHTML = templates
    .map(
      (option, index) =>
        `<button type="button" role="radio" data-index="${index}" aria-checked="${index === chosen}" class="${index === chosen ? "active" : ""}">` +
        `${escape(itemLabel(option.name, 24))}${option.key ? ` <kbd>${escape(option.key)}</kbd>` : ""}</button>`,
    )
    .join("");
  const kept = new Map([...fields.querySelectorAll<HTMLInputElement>("input")].map((input) => [input.dataset.key!, input.value]));
  fields.innerHTML = template.ask.map((key) => `<label>${escape(key)}<input type="text" autocomplete="off" data-key="${escape(key)}" /></label>`).join("");
  for (const input of fields.querySelectorAll<HTMLInputElement>("input")) input.value = kept.get(input.dataset.key!) ?? "";
  target.textContent = `Goes to ${template.target}${template.at === "top" ? ", at the top" : ""}`;
}

function file(): void {
  const template = templates[chosen];
  const properties = Object.fromEntries([...fields.querySelectorAll<HTMLInputElement>("input")].map((input) => [input.dataset.key!, input.value]));
  const result = capture(doc(), template, text.value.trim(), properties, new Date());
  dialog.close();
  commitAndRender(result.doc, null);
  toast(`Captured to “${itemLabel(result.doc.items[result.target].text, 30)}”`, { label: "Go there", run: () => zoomTo(result.target) });
}
