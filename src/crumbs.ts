import { ItemId, ROOT, ancestors } from "./model";
import { escape, itemLabel } from "./inline";
import { doc, state, ui } from "./app";
import { agendaShown } from "./agenda";
import { zoomTo } from "./navigation";
import { pageAbove } from "./board";

/*
 * Breadcrumbs keep Home and the nearest levels that fit with their whole
 * names (doc/adr/0082). The levels that do not fit go behind a button
 * that opens the whole path.
 */

const HOME_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 9.5L10 4l6.5 5.5M5.5 8v7.5h9V8" /></svg>`;
const CHEVRON = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8l4 4 4-4" /></svg>`;
const SEPARATOR = `<span class="crumb-sep" aria-hidden="true">/</span>`;

const pathMenu = () => document.getElementById("path-menu")!;

let crumbsShown = "";

export function renderCrumbs(): void {
  const trail = crumbTrail();
  const shown = JSON.stringify(trail.map((id) => [id, levelName(id)]));
  if (shown === crumbsShown) return;
  crumbsShown = shown;
  if (pathMenu().matches(":popover-open")) pathMenu().hidePopover();
  ui.crumbs.classList.toggle("at-home", trail.length === 0);
  ui.crumbs.innerHTML = trail.length === 0 ? `<span class="brand"><span class="brand-dot"></span>Outliner</span>` : crumbsHtml(trail);
  fitCrumbs();
}

export function bindCrumbs(): void {
  new ResizeObserver(() => fitCrumbs()).observe(ui.crumbs);
  void document.fonts?.ready.then(() => fitCrumbs());
  pathMenu().addEventListener("beforetoggle", (event) => {
    if ((event as ToggleEvent).newState === "open") fillPathMenu();
  });
  pathMenu().addEventListener("toggle", (event) => {
    if ((event as ToggleEvent).newState === "open") focusParentLine();
  });
  pathMenu().addEventListener("click", (event) => {
    const level = (event.target as Element).closest<HTMLElement>("[data-zoom]")?.dataset.zoom;
    if (level === undefined) return;
    pathMenu().hidePopover();
    zoomTo(level);
  });
  pathMenu().addEventListener("keydown", (event) => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const lines = levelLines();
    const at = lines.indexOf(document.activeElement as HTMLElement);
    lines[Math.max(0, Math.min(lines.length - 1, at + step))].focus();
  });
}

export function showPath(): void {
  if (crumbTrail().length > 0 && !pathMenu().matches(":popover-open")) pathMenu().showPopover();
}

function crumbTrail(): ItemId[] {
  return agendaShown() ? [ROOT] : ancestors(doc(), state.zoom);
}

function levelName(id: ItemId): string {
  return id === ROOT ? "Home" : itemLabel(doc().items[id].text, Infinity);
}

function crumbsHtml(trail: ItemId[]): string {
  const [, ...levels] = trail;
  const home = `<a class="crumb home" href="#/" aria-label="Home">${HOME_ICON}</a>`;
  const pathButton = `<span class="crumb-step path-step" hidden>${SEPARATOR}<button type="button" class="path-button" popovertarget="path-menu" aria-label="Whole path" title="Whole path">${CHEVRON}</button></span>`;
  const levelSteps = levels.map(
    (id) => `<span class="crumb-step level-step">${SEPARATOR}<a class="crumb" href="#/${encodeURIComponent(id)}">${escape(levelName(id))}</a></span>`,
  );
  return home + (levels.length > 1 ? pathButton : "") + levelSteps.join("");
}

function fitCrumbs(): void {
  const pathStep = ui.crumbs.querySelector<HTMLElement>(".path-step");
  if (!pathStep) return;
  const levels = [...ui.crumbs.querySelectorAll<HTMLElement>(".level-step")];
  ui.crumbs.classList.add("fitting");
  pathStep.hidden = true;
  for (const level of levels) level.hidden = false;
  if (!crumbsFit()) {
    pathStep.hidden = false;
    for (const level of levels.slice(0, -1)) {
      level.hidden = true;
      if (crumbsFit()) break;
    }
  }
  ui.crumbs.classList.remove("fitting");
}

function crumbsFit(): boolean {
  return ui.crumbs.scrollWidth <= ui.crumbs.clientWidth;
}

function fillPathMenu(): void {
  const trail = crumbTrail();
  const thisPage = agendaShown() ? "Agenda" : levelName(state.zoom);
  const lines = trail.map((id, depth) => {
    const name = id === ROOT ? `${HOME_ICON}<span>Home</span>` : `<span>${escape(levelName(id))}</span>`;
    return `<button type="button" class="menu-item path-level" data-zoom="${escape(id)}" style="--depth: ${depth}">${name}</button>`;
  });
  const current = `<div class="menu-item path-level this-page" aria-current="page" style="--depth: ${trail.length}"><span>${escape(thisPage)}</span><span class="menu-meta">this page</span></div>`;
  pathMenu().querySelector("[data-path-levels]")!.innerHTML = lines.join("") + current;
  placePathMenu();
}

function placePathMenu(): void {
  const pathButton = ui.crumbs.querySelector<HTMLElement>(".path-step:not([hidden]) .path-button");
  const anchor = (pathButton ?? ui.crumbs.querySelector<HTMLElement>(".crumb.home") ?? ui.crumbs).getBoundingClientRect();
  const width = parseFloat(getComputedStyle(pathMenu()).width);
  pathMenu().style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
  pathMenu().style.top = `${anchor.bottom + 4}px`;
}

function focusParentLine(): void {
  const parent = agendaShown() ? ROOT : pageAbove(state.zoom);
  levelLines()
    .find((line) => line.dataset.zoom === parent)
    ?.focus();
}

function levelLines(): HTMLElement[] {
  return [...pathMenu().querySelectorAll<HTMLElement>("[data-zoom]")];
}
