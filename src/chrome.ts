import { ItemId, ROOT, insertChild, newChildIndex, removeCompleted, setCollapsed, setCollapsedEverywhere } from "./model";
import { AppearancePref, Prefs, savePrefs } from "./storage";
import { escape, itemLabel, slug } from "./inline";
import { download, exportJson, exportMarkdown, exportOpml, graft, importText, parseIndentedText } from "./transfer";
import { FORMULA_EXAMPLES, FormulaExample, formulaHelpHtml } from "./formulaHelp";
import { Command, Reach, bindingFor, bindingForKeys, describeKeys, isModifierAlone, isPrefix, keyCommands, keysAfter, prettySequence, sequenceContinues, extendSequence } from "./keys";
import { PREFIX } from "./shortcuts";
import { isMac } from "./platform";
import { $, commitAndRender, doc, redo, state, ui, undo } from "./app";
import { EditorContext, actions, caretNow, editorContext, editorOf } from "./editing";
import { clearSelection, copyItems, deleteItems, endSelectionWhenSomethingTakesFocus } from "./selection";
import { searchEverything, setQuery, showZoomOfNewHash, zoomTo } from "./navigation";
import { columnViewShown, focusCaret, render, textEditorFor, treeEditors } from "./render";
import { bindColumnCells, toggleColumnView } from "./columns";
import { openCapture } from "./capturing";
import { bindBoard, boardShown, toggleBoard } from "./board";
import { bindAgenda, openAgenda } from "./agenda";
import { bindPropertyChips } from "./propertyPicker";
import { bindPrivateKeys, openPrivateKeys } from "./privateItems";
import { bindPlugins, openPlugins, pluginCommands, pluginTarget } from "./pluginHost";

export function bindChrome(): void {
  bindSearchBox();
  bindMenu();
  bindToolbar();
  bindItemMenu();
  bindGlobalKeys();
  endSelectionWhenSomethingTakesFocus();
  bindColumnCells();
  bindBoard();
  bindAgenda();
  bindPropertyChips();

  window.addEventListener("hashchange", showZoomOfNewHash);
  window.addEventListener("scroll", () => document.body.classList.toggle("scrolled", window.scrollY > 4), { passive: true });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyAppearance);

  ui.addItem.addEventListener("click", () => {
    const created = insertChild(doc(), state.zoom, newChildIndex(doc(), state.zoom));
    commitAndRender(created.doc, { id: created.id, offset: 0 });
  });

  $("help-close").addEventListener("click", () => ui.help.close());
  ui.help.addEventListener("click", (event) => event.target === ui.help && ui.help.close());
  bindFormulaHelp();
  bindPrivateKeys();
  bindPlugins();
  $("build-commit").textContent = __BUILD_COMMIT__;
  document.querySelector(".menu-kbd")!.textContent = isMac ? "⌘K" : "Ctrl K";
}

// ---- keys that work everywhere ---------------------------------------------------

export const globalActions = {
  jump: () => searchEverything(paletteCommands()),
  jumpToItem: () => searchEverything(paletteCommands(), "Items"),
  runCommand: () => searchEverything(paletteCommands(), "Commands"),
  search: () => {
    ui.search.focus();
    ui.search.select();
  },
  help: () => (ui.help.open ? ui.help.close() : showHelp()),
  toggleCompleted: () => menuActions["toggle-completed"](),
  toggleColumns: () => toggleColumnView(),
  capture: () => openCapture(),
  undo: () => undo(),
  redo: () => redo(),
  clearSearch: (): boolean | void => {
    if (!state.query) return false;
    setQuery("");
  },
  startEditing: () => {
    const first = treeEditors()[0];
    if (first) focusCaret({ id: first.dataset.id!, offset: 0 });
    else ui.addItem.click();
  },
  zoomOut: () => {
    if (state.zoom !== ROOT) zoomTo(doc().items[state.zoom].parent ?? ROOT);
  },
};

function showHelp(): void {
  ui.helpGrid.innerHTML = describeKeys();
  ui.help.showModal();
}

function paletteCommands(): Command[] {
  const editor = editorOf(document.activeElement);
  const editing = editor ? editorContext(editor) : null;
  return [...keyCommands(editing), ...pluginCommands(pluginTarget(editing?.id ?? null)), ...menuCommands()];
}

const menuEntriesWithShortcuts = new Set(["jump", "agenda", "capture", "toggle-completed", "toggle-columns", "toggle-board", "help"]);

function menuCommands(): Command[] {
  return [...ui.menu.querySelectorAll<HTMLElement>(".menu-item[data-action]")]
    .filter((button) => !menuEntriesWithShortcuts.has(button.dataset.action!))
    .map((button) => {
      const section = button.closest(".menu-section")?.querySelector(".menu-label")?.textContent;
      const name = button.querySelector("span")!.textContent!;
      return { label: section ? `${section}: ${name}` : name, shortcut: "", run: () => button.click() };
    });
}

type FocusTarget = "page" | "field" | "overlay" | "control";

function focusTarget(target: EventTarget | null): FocusTarget {
  if (!(target instanceof Element) || target === document.body || target === document.documentElement) return "page";
  if (target.closest("dialog[open], [popover]:popover-open")) return "overlay";
  if (target instanceof HTMLInputElement || editorOf(target)) return "field";
  return "control";
}

function reaches(reach: Reach, target: FocusTarget): boolean {
  if (target === "overlay") return false;
  if (reach === "onPage") return target === "page";
  if (reach === "outsideFields") return target !== "field";
  return true;
}

function bindGlobalKeys(): void {
  window.addEventListener("keydown", (event) => runPrefixedKeys(event), true);
  window.addEventListener("keyup", () => (heldAfterSequence = null), true);
  const cancelPrefix = () => waitingAfterPrefix && stopWaitingAfterPrefix();
  window.addEventListener("blur", cancelPrefix);
  document.addEventListener("mousedown", cancelPrefix, true);
  document.addEventListener("focusin", cancelPrefix, true);
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const target = focusTarget(event.target);
    const selecting = state.selection && (target === "page" || target === "control");
    if (selecting && runSelectionKey(event)) {
      event.preventDefault();
      return;
    }
    const binding = bindingFor(event, "global");
    if (binding && reaches(binding.reach, target) && binding.run() !== false) event.preventDefault();
  });
}

// ---- the prefix key: ⌘J / Ctrl-J, then a letter ------------------------------------------

let waitingAfterPrefix = false;
let keysSoFar = PREFIX;
let panelTimer: number | undefined;

/** The key that finished a sequence, while it is held: its repeats neither type nor run it again. */
let heldAfterSequence: string | null = null;

/*
 * On the window in the capture phase, so it sees the key before the editor
 * and the completion list; a click, another field or another window cancels
 * the wait, so a stray ⌘J cannot turn a later letter into a command.
 */
function runPrefixedKeys(event: KeyboardEvent): void {
  if (event.isComposing || (waitingAfterPrefix && isModifierAlone(event))) return;
  const repeatOfHeld = event.repeat && (event.code === heldAfterSequence || (waitingAfterPrefix && isPrefix(event)));
  if (!repeatOfHeld && !waitingAfterPrefix && !(isPrefix(event) && focusTarget(event.target) !== "overlay")) return;
  event.preventDefault();
  event.stopPropagation();
  if (repeatOfHeld) return;
  if (!waitingAfterPrefix) return waitAfterKeys(PREFIX);
  if (event.key === "Escape") return stopWaitingAfterPrefix();
  const keys = extendSequence(keysSoFar, event);
  if (!bindingForKeys(keys, "editor") && !bindingForKeys(keys, "global") && sequenceContinues(keys)) return waitAfterKeys(keys);
  stopWaitingAfterPrefix();
  heldAfterSequence = event.code;
  runSequence(keys, event.target);
}

function waitAfterKeys(keys: string): void {
  waitingAfterPrefix = true;
  keysSoFar = keys;
  window.clearTimeout(panelTimer);
  prefixPanel().hidden = true;
  panelTimer = window.setTimeout(showKeysAfterPrefix, 400);
}

function stopWaitingAfterPrefix(): void {
  waitingAfterPrefix = false;
  window.clearTimeout(panelTimer);
  prefixPanel().hidden = true;
}

function runSequence(keys: string, target: EventTarget | null): void {
  const editor = editorOf(document.activeElement);
  const forItem = bindingForKeys(keys, "editor");
  if (forItem && editor) {
    forItem.run(editorContext(editor));
    return;
  }
  const forPage = bindingForKeys(keys, "global");
  if (forPage && reaches(forPage.reach, focusTarget(target))) forPage.run();
  else if (forItem) toast(`${forItem.label} works while editing an item`);
  else toast(`Nothing follows ${isMac ? "⌘J" : "Ctrl J"} with ${keys.slice(keys.indexOf(" ") + 1)}; pause after ${isMac ? "⌘J" : "Ctrl J"} to see what does`);
}

function showKeysAfterPrefix(): void {
  const editing = Boolean(editorOf(document.activeElement));
  const panel = prefixPanel();
  panel.innerHTML =
    `<div class="prefix-title">${prettySequence(keysSoFar)} then</div>` +
    keysAfter(keysSoFar)
      .map(({ key, label, needsItem }) => `<div class="prefix-key${needsItem && !editing ? " unavailable" : ""}">${key}<span>${escape(label)}</span></div>`)
      .join("");
  panel.hidden = false;
}

function prefixPanel(): HTMLElement {
  let panel = document.getElementById("prefix-keys");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "prefix-keys";
    panel.className = "prefix-keys";
    panel.setAttribute("role", "status");
    panel.hidden = true;
    document.body.append(panel);
  }
  return panel;
}

function runSelectionKey(event: KeyboardEvent): boolean {
  const binding = bindingFor(event, "selection");
  if (binding) {
    binding.run();
    return true;
  }
  const typesACharacter = !event.metaKey && !event.ctrlKey && event.key.length === 1;
  if (typesACharacter) clearSelection();
  return false;
}

// ---- search box, menu and toolbar ------------------------------------------------

function bindSearchBox(): void {
  ui.search.addEventListener("input", () => setQuery(ui.search.value));
  ui.search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setQuery("");
      ui.search.blur();
    } else if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      const first = ui.tree.querySelector<HTMLElement>(".match > .row .text") ?? treeEditors()[0];
      if (first) focusCaret({ id: first.dataset.id!, offset: (first.textContent ?? "").length });
    }
  });
}

const menuActions: Record<string, () => void> = {
  agenda: () => {
    ui.menu.hidePopover();
    openAgenda();
  },
  jump: () => {
    ui.menu.hidePopover();
    searchEverything(paletteCommands());
  },
  capture: () => {
    ui.menu.hidePopover();
    openCapture();
  },
  "toggle-columns": () => toggleColumnView(),
  "toggle-board": () => toggleBoard(),
  "toggle-completed": () => {
    updatePrefs({ showCompleted: !state.prefs.showCompleted });
    render(caretNow());
  },
  "expand-all": () => commitAndRender(setCollapsedEverywhere(doc(), state.zoom, false), null),
  "collapse-all": () => commitAndRender(setCollapsedEverywhere(doc(), state.zoom, true), null),
  "clear-page": () => {
    ui.menu.hidePopover();
    const items = doc().items[state.zoom].children;
    if (items.length > 0) deleteItems(items);
  },
  "delete-completed": () => {
    ui.menu.hidePopover();
    const result = removeCompleted(doc(), state.zoom);
    if (result.count === 0) {
      toast("Nothing completed on this page");
      return;
    }
    commitAndRender(result.doc, null);
    toastWithUndo(`Deleted ${result.count} completed ${result.count === 1 ? "item" : "items"}`);
  },
  "export-markdown": () => download(`${pageSlug()}.md`, "text/markdown", exportMarkdown(doc(), state.zoom)),
  "export-opml": () => download(`${pageSlug()}.opml`, "text/x-opml", exportOpml(doc(), state.zoom)),
  "export-json": () =>
    download(`outliner-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json", exportJson(doc())),
  import: () => ui.importFile.click(),
  help: () => {
    ui.menu.hidePopover();
    showHelp();
  },
  "private-keys": () => {
    ui.menu.hidePopover();
    openPrivateKeys();
  },
  plugins: () => {
    ui.menu.hidePopover();
    void openPlugins();
  },
  "formula-help": () => {
    ui.menu.hidePopover();
    formulaHelp().showModal();
  },
  "clear-search": () => setQuery(""),
};

// ---- formula help -------------------------------------------------------------------

const formulaHelp = () => $<HTMLDialogElement>("formula-help");

function bindFormulaHelp(): void {
  $("formula-help-body").innerHTML = formulaHelpHtml();
  formulaHelp().addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target === formulaHelp() || target.closest("[data-close-dialog]")) formulaHelp().close();
    const example = target.closest<HTMLElement>("[data-formula-example]");
    if (example) addFormulaExample(FORMULA_EXAMPLES[Number(example.dataset.formulaExample)]);
  });
}

function addFormulaExample(example: FormulaExample): void {
  formulaHelp().close();
  const result = graft(doc(), parseIndentedText(example.outline), state.zoom, newChildIndex(doc(), state.zoom));
  commitAndRender(result.doc, null);
  zoomTo(result.ids[0]);
}

function pageSlug(): string {
  return (state.zoom !== ROOT && slug(doc().items[state.zoom].text)) || "outline";
}

function bindMenu(): void {
  document.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-action]");
    if (button && !button.closest("#toolbar")) menuActions[button.dataset.action!]?.();
  });

  ui.menu.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-pref] [data-value]");
    if (!button) return;
    const pref = button.closest<HTMLElement>("[data-pref]")!.dataset.pref as AppearancePref;
    updatePrefs({ [pref]: button.dataset.value });
    applyAppearance();
  });

  ui.importFile.addEventListener("change", async () => {
    const file = ui.importFile.files?.[0];
    ui.importFile.value = "";
    if (!file) return;
    try {
      const incoming = importText(await file.text());
      const count = Object.keys(incoming.items).length - 1;
      commitAndRender(graft(doc(), incoming, state.zoom, doc().items[state.zoom].children.length).doc, null);
      toastWithUndo(`Imported ${itemCount(count)} from ${file.name}`);
    } catch (error) {
      toast(`Could not import ${file.name}: ${(error as Error).message}`);
    }
  });
}

const toolbarActions: Record<string, keyof typeof actions> = {
  indent: "indent",
  outdent: "outdent",
  "move-up": "moveUp",
  "move-down": "moveDown",
  complete: "complete",
  note: "toggleNote",
  property: "setProperty",
  done: "blur",
};

function bindToolbar(): void {
  ui.toolbar.addEventListener("pointerdown", (event) => event.preventDefault());
  ui.toolbar.addEventListener("pointerup", (event) => {
    const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;
    const editor = editorOf(document.activeElement);
    if (!action || !editor) return;
    if (action === "undo") undo();
    else if (toolbarActions[action]) actions[toolbarActions[action]](editorContext(editor));
  });
  keepToolbarAboveKeyboard();
}

function keepToolbarAboveKeyboard(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const place = () => {
    const keyboard = window.innerHeight - viewport.height - viewport.offsetTop;
    ui.toolbar.style.setProperty("--keyboard", `${Math.max(0, keyboard)}px`);
  };
  viewport.addEventListener("resize", place);
  viewport.addEventListener("scroll", place);
  place();
}

// ---- the item menu (long press or right click on a bullet) ----------------------

let menuItem: ItemId | null = null;
let menuOpenedByTouch = false;

export function openItemMenu(id: ItemId, anchor: HTMLElement, byTouch: boolean): void {
  menuItem = id;
  menuOpenedByTouch = byTouch;
  const menu = $("item-menu");
  const item = doc().items[id];
  $("item-menu-title").textContent = itemLabel(item.text, 40);
  menu.querySelector('[data-item-action="complete"] span')!.textContent = item.completed ? "Uncomplete" : "Complete";
  menu.querySelector('[data-item-action="note"] span')!.textContent = item.note ? "Edit note" : "Add a note";
  const fold = menu.querySelector<HTMLElement>('[data-item-action="fold"]')!;
  fold.hidden = item.children.length === 0 || Boolean(state.results);
  fold.querySelector("span")!.textContent = item.collapsed ? "Expand" : "Collapse";
  menu.showPopover();
  const rect = anchor.getBoundingClientRect();
  const height = menu.offsetHeight;
  const fitsBelow = rect.bottom + 4 + height < window.innerHeight;
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - height - 4)}px`;
  menu.querySelector<HTMLElement>("[data-item-action]")!.focus();
}

const itemActions: Record<string, (c: EditorContext) => void> = {
  zoom: (c) => zoomTo(c.id),
  fold: (c) => commitAndRender(setCollapsed(doc(), c.id, !doc().items[c.id].collapsed), null),
  note: (c) => actions.toggleNote(c),
  complete: (c) => actions.complete(c),
  duplicate: (c) => actions.duplicate(c),
  move: (c) => actions.moveToPicker(c),
  attach: (c) => actions.attachFile(c),
  property: (c) => actions.setProperty(c),
  private: (c) => actions.makePrivate(c),
  copy: (c) => {
    copyItems([c.id]);
    toast("Copied as text");
  },
  delete: (c) => actions.deleteItem(c),
};

const itemActionsThatType = new Set(["note", "move", "property"]);

function bindItemMenu(): void {
  $("item-menu").addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLElement>("[data-item-action]")?.dataset.itemAction;
    const editor = menuItem && doc().items[menuItem] ? textEditorFor(menuItem) : null;
    if (!action || !editor) return;
    $("item-menu").hidePopover();
    itemActions[action](editorContext(editor));
    if (menuOpenedByTouch && !itemActionsThatType.has(action)) editorOf(document.activeElement)?.blur();
  });
}

// ---- preferences and toasts -------------------------------------------------------

function updatePrefs(change: Partial<Prefs>): void {
  state.prefs = { ...state.prefs, ...change };
  savePrefs(state.prefs);
  renderMenuState();
}

export function renderMenuState(): void {
  for (const group of ui.menu.querySelectorAll<HTMLElement>("[data-pref]")) {
    const current = state.prefs[group.dataset.pref as AppearancePref];
    for (const button of group.querySelectorAll<HTMLElement>("[data-value]")) {
      button.setAttribute("aria-checked", String(button.dataset.value === current));
    }
  }
  ui.completedSwitch.classList.toggle("on", state.prefs.showCompleted);
  $("columns-switch").classList.toggle("on", columnViewShown());
  $("board-switch").classList.toggle("on", boardShown());
}

export function applyAppearance(): void {
  const { theme, textSize } = state.prefs;
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  if (textSize === "medium") delete root.dataset.size;
  else root.dataset.size = textSize;
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')!.setAttribute("content", dark ? "#17181c" : "#f7f5f0");
}

let toastTimer: number | undefined;

export function toast(message: string, action?: { label: string; run: () => void }, { stays = false } = {}): void {
  window.clearTimeout(toastTimer);
  ui.toast.innerHTML = `<span>${escape(message)}</span>`;
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      ui.toast.hidden = true;
      action.run();
    });
    ui.toast.append(button);
  }
  ui.toast.hidden = false;
  if (!stays) toastTimer = window.setTimeout(() => (ui.toast.hidden = true), 5000);
}

export function toastWithUndo(message: string): void {
  toast(message, { label: "Undo", run: undo });
}

export function itemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}
