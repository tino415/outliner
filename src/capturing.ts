import { INBOX, Template, capture, captureRequest, captureTemplates, goToTarget, templateOf } from "./capture";
import { commitAndRender, doc } from "./app";
import { escape, itemLabel } from "./inline";
import { toast } from "./chrome";
import { zoomTo } from "./navigation";
import { Command } from "./keys";
import { ItemId } from "./model";

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dialog = element<HTMLDialogElement>("capture-dialog");
const form = element<HTMLFormElement>("capture-form");
const heading = element("capture-heading");
const chooser = element("capture-templates");
const textLabel = element("capture-text-label");
const text = element<HTMLInputElement>("capture-text");
const fields = element("capture-fields");
const target = element("capture-target");
const actions = element("capture-actions");

let templates: Template[] = [];
let chosen = 0;
let going = false;

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
  element("capture-go").addEventListener("click", () => visit(templates[chosen]));
  element("capture-close").addEventListener("click", () => dialog.close());
}

export function openCapture(templateName = "", prefill = ""): void {
  going = false;
  templates = captureTemplates(doc());
  const named = indexNamed(templates, templateName);
  chosen = Math.max(named, 0);
  text.value = prefill;
  fields.innerHTML = "";
  paint();
  dialog.showModal();
  if (templates.length > 1 && named === -1 && !prefill) chooser.querySelector<HTMLElement>(".active")!.focus();
  else text.focus();
}

export function openGoToTarget(): void {
  if (dialog.open) return;
  going = true;
  templates = captureTemplates(doc());
  chosen = 0;
  paint();
  dialog.showModal();
  chooser.querySelector<HTMLElement>(".active")!.focus();
}

export function goToTargetCommands(): Command[] {
  return captureTemplates(doc())
    .filter((template) => template !== INBOX)
    .map((template) => ({ label: `Go to target: ${template.name}`, shortcut: "", run: () => visit(template) }));
}

export function goToTargetOfItem(id: ItemId): void {
  const template = templateOf(doc(), id);
  if (template) visit(template);
}

/** A share, a home-screen shortcut or a link can open the app straight into capture. */
export function captureFromAddress(): void {
  const request = captureRequest(location.search);
  if (request) history.replaceState(null, "", location.pathname + location.hash);
  if (request && !dialog.open) openFrom(request);
  captureFromLaunches();
}

function openFrom(request: { template: string; text: string; go: boolean }): void {
  if (!request.go) return openCapture(request.template, request.text);
  const all = captureTemplates(doc());
  const named = all[indexNamed(all, request.template)];
  if (named) visit(named);
  else openGoToTarget();
}

function indexNamed(among: Template[], name: string): number {
  return among.findIndex((template) => template.name.toLowerCase() === name.toLowerCase());
}

interface LaunchQueue {
  setConsumer(consumer: (params: { targetURL?: string }) => void): void;
}

/**
 * The manifest's launch_handler keeps a running app's window and hands it
 * the shortcut's or share's address here instead of loading it, which on a
 * Mac is the only way Capture in the Dock reaches an app already open.
 */
function captureFromLaunches(): void {
  const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer(({ targetURL }) => {
    const request = targetURL ? captureRequest(new URL(targetURL).search) : null;
    if (request && !dialog.open) openFrom(request);
  });
}

function choose(index: number): void {
  chosen = index;
  if (going) return visit(templates[index]);
  paint();
  text.focus();
}

function visit(template: Template): void {
  const located = goToTarget(doc(), template, new Date());
  dialog.close();
  if (located.doc !== doc()) commitAndRender(located.doc, null);
  zoomTo(located.target);
}

function paint(): void {
  const template = templates[chosen];
  heading.textContent = going ? "Go to target" : "Capture";
  chooser.hidden = !going && templates.length < 2;
  textLabel.hidden = going;
  fields.hidden = going;
  target.hidden = going;
  actions.hidden = going;
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
