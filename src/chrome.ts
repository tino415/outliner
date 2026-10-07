import { ItemId, ROOT, descendantCount, insertChild, removeAll, removeCompleted, setCollapsedEverywhere } from "./model";
import { Prefs, savePrefs } from "./storage";
import { escape, plainText } from "./inline";
import { download, exportJson, exportMarkdown, exportOpml, graft, importText, subtreesAsText } from "./transfer";
import { bindingFor, describeKeys } from "./keys";
import { isMac } from "./platform";
import { $, commitAndRender, doc, state, ui, undo, redo } from "./app";
import { actions, caretNow, editorContext, editorOf } from "./editing";
import { clearSelection, copyText, handleSelectionKey } from "./selection";
import { changeQuery, clearQuery, jumpToItem, showZoom, zoomTo } from "./navigation";
import { focusCaret, render, textEditorFor } from "./render";

// ---- chrome: search box, menu, toolbar, help, toasts ---------------------------

export function bindChrome(): void {
  ui.search.addEventListener("input", () => {
    changeQuery(ui.search.value);
    render(null);
  });
  ui.search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      clearQuery();
      render(null);
      ui.search.blur();
    } else if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      const first = ui.tree.querySelector<HTMLElement>(".match > .row .text") ?? ui.tree.querySelector<HTMLElement>(".text");
      if (first) focusCaret({ id: first.dataset.id!, offset: (first.textContent ?? "").length });
    }
  });

  window.addEventListener("hashchange", showZoom);
  window.addEventListener("scroll", () => document.body.classList.toggle("scrolled", window.scrollY > 4), { passive: true });

  ui.tree.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest(".bullet")) event.preventDefault();
  });

  ui.addItem.addEventListener("click", () => {
    const created = insertChild(doc(), state.zoom, doc().items[state.zoom].children.length);
    commitAndRender(created.doc, { id: created.id, offset: 0 });
  });

  document.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!button || button.closest("#toolbar")) return;
    runMenuAction(button.dataset.action!);
  });

  ui.menu.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-pref] [data-value]");
    if (!button) return;
    const pref = button.closest<HTMLElement>("[data-pref]")!.dataset.pref as "theme" | "textSize";
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
      const result = graft(doc(), incoming, state.zoom, doc().items[state.zoom].children.length);
      commitAndRender(result.doc, null);
      toast(`Imported ${count} item${count === 1 ? "" : "s"} from ${file.name}`, { label: "Undo", run: undo });
    } catch (error) {
      toast(`Could not import ${file.name}: ${(error as Error).message}`);
    }
  });

  ui.toolbar.addEventListener("pointerdown", (event) => event.preventDefault());
  ui.toolbar.addEventListener("pointerup", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-action]");
    const editor = editorOf(document.activeElement);
    if (!button || !editor) return;
    runToolbarAction(button.dataset.action!, editor);
  });
  keepToolbarAboveKeyboard();

  $("help-close").addEventListener("click", () => ui.help.close());
  ui.help.addEventListener("click", (event) => event.target === ui.help && ui.help.close());
  ui.helpGrid.innerHTML = describeKeys();
  $("build-info").textContent = `Stored only in this browser · build ${__BUILD_COMMIT__}`;
  document.querySelector(".menu-kbd")!.textContent = isMac ? "⌘K" : "Ctrl K";

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyAppearance);
}

function runMenuAction(action: string): void {
  const page = state.zoom === ROOT ? "outline" : slug(doc().items[state.zoom].text) || "outline";
  switch (action) {
    case "jump":
      ui.menu.hidePopover();
      jumpToItem();
      break;
    case "toggle-completed":
      updatePrefs({ showCompleted: !state.prefs.showCompleted });
      render(caretNow());
      break;
    case "expand-all":
      commitAndRender(setCollapsedEverywhere(doc(), state.zoom, false), null);
      break;
    case "collapse-all":
      commitAndRender(setCollapsedEverywhere(doc(), state.zoom, true), null);
      break;
    case "clear-page": {
      ui.menu.hidePopover();
      const items = doc().items[state.zoom].children;
      if (items.length === 0) break;
      const count = items.reduce((sum, id) => sum + 1 + descendantCount(doc(), id), 0);
      commitAndRender(removeAll(doc(), items), null);
      toast(`Deleted ${count} item${count === 1 ? "" : "s"}`, { label: "Undo", run: undo });
      break;
    }
    case "delete-completed": {
      const result = removeCompleted(doc(), state.zoom);
      ui.menu.hidePopover();
      if (result.count === 0) {
        toast("Nothing completed on this page");
        break;
      }
      commitAndRender(result.doc, null);
      toast(`Deleted ${result.count} completed item${result.count === 1 ? "" : "s"}`, { label: "Undo", run: undo });
      break;
    }
    case "export-markdown":
      download(`${page}.md`, "text/markdown", exportMarkdown(doc(), state.zoom));
      break;
    case "export-opml":
      download(`${page}.opml`, "text/x-opml", exportOpml(doc(), state.zoom));
      break;
    case "export-json":
      download(`outliner-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json", exportJson(doc()));
      break;
    case "import":
      ui.importFile.click();
      break;
    case "help":
      ui.menu.hidePopover();
      ui.help.showModal();
      break;
    case "clear-search":
      clearQuery();
      render(null);
      break;
  }
}

function runToolbarAction(action: string, editor: HTMLElement): void {
  const names: Record<string, keyof typeof actions> = {
    indent: "indent",
    outdent: "outdent",
    "move-up": "moveUp",
    "move-down": "moveDown",
    complete: "complete",
    note: "toggleNote",
    undo: "undo",
    done: "blur",
  };
  const name = names[action];
  if (name) actions[name](editorContext(editor));
}

// ---- the item menu (long press or right click on a bullet) ----------------------

let menuItem: ItemId | null = null;
let menuOpenedByTouch = false;

export function openItemMenu(id: ItemId, anchor: HTMLElement, byTouch: boolean): void {
  menuItem = id;
  menuOpenedByTouch = byTouch;
  const menu = $("item-menu");
  const item = doc().items[id];
  $("item-menu-title").textContent = shortLabel(item.text, 40) || "Untitled";
  menu.querySelector('[data-item-action="complete"] span')!.textContent = item.completed ? "Uncomplete" : "Complete";
  menu.querySelector('[data-item-action="note"] span')!.textContent = item.note ? "Edit note" : "Add a note";
  menu.showPopover();
  const rect = anchor.getBoundingClientRect();
  const height = menu.offsetHeight;
  const fitsBelow = rect.bottom + 4 + height < window.innerHeight;
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - height - 4)}px`;
  menu.querySelector<HTMLElement>("[data-item-action]")!.focus();
}

export function bindItemMenu(): void {
  $("item-menu").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-item-action]");
    if (!button || !menuItem || !doc().items[menuItem]) return;
    $("item-menu").hidePopover();
    runItemAction(button.dataset.itemAction!, menuItem);
  });
}

function runItemAction(action: string, id: ItemId): void {
  const editor = textEditorFor(id);
  if (!editor) return;
  const c = editorContext(editor);
  switch (action) {
    case "zoom":
      zoomTo(id);
      break;
    case "note":
      actions.toggleNote(c);
      break;
    case "complete":
      actions.complete(c);
      break;
    case "duplicate":
      actions.duplicate(c);
      break;
    case "move":
      actions.moveToPicker(c);
      break;
    case "copy":
      copyText(subtreesAsText(doc(), [id]));
      toast("Copied as text");
      break;
    case "delete":
      actions.deleteItem(c);
      break;
  }
  const wantsTyping = action === "note" || action === "move";
  if (menuOpenedByTouch && !wantsTyping) editorOf(document.activeElement)?.blur();
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

function updatePrefs(change: Partial<Prefs>): void {
  state.prefs = { ...state.prefs, ...change };
  savePrefs(state.prefs);
  renderMenuState();
}

export function renderMenuState(): void {
  for (const group of ui.menu.querySelectorAll<HTMLElement>("[data-pref]")) {
    const current = state.prefs[group.dataset.pref as "theme" | "textSize"];
    for (const button of group.querySelectorAll<HTMLElement>("[data-value]")) {
      button.setAttribute("aria-checked", String(button.dataset.value === current));
    }
  }
  ui.completedSwitch.classList.toggle("on", state.prefs.showCompleted);
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

export function bindGlobalKeys(): void {
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const typingSomewhere = event.target instanceof HTMLElement && Boolean(event.target.closest("input, dialog, .text, .note"));
    if (state.selection && !typingSomewhere && handleSelectionKey(event)) {
      event.preventDefault();
      return;
    }
    const onPage = event.target === document.body || event.target === document.documentElement;
    const inField = event.target instanceof HTMLInputElement || Boolean(editorOf(event.target));
    const binding = bindingFor(event, "global");
    const inOverlay = event.target instanceof Element && Boolean(event.target.closest("dialog, [popover]"));
    if (!binding || inOverlay) return;
    if (binding.id === "escape" && !state.query) return;
    if (binding.typing && (inField || (binding.id === "focus-first" && !onPage))) return;
    if (inField && !["search", "help", "jump", "toggle-completed"].includes(binding.id!)) return;
    event.preventDefault();
    runGlobal(binding.id!);
  });
}

function runGlobal(id: string): void {
  if (["search", "help", "jump"].includes(id)) clearSelection();
  switch (id) {
    case "search":
      ui.search.focus();
      ui.search.select();
      break;
    case "help":
      ui.help.open ? ui.help.close() : ui.help.showModal();
      break;
    case "undo":
      undo();
      break;
    case "redo":
      redo();
      break;
    case "jump":
      jumpToItem();
      break;
    case "toggle-completed":
      runMenuAction("toggle-completed");
      break;
    case "escape":
      if (state.query) {
        clearQuery();
        render(null);
      }
      break;
    case "focus-first": {
      const first = ui.tree.querySelector<HTMLElement>(".text");
      if (first) focusCaret({ id: first.dataset.id!, offset: 0 });
      else ui.addItem.click();
      break;
    }
    case "zoom-out":
      if (state.zoom !== ROOT) zoomTo(doc().items[state.zoom].parent ?? ROOT);
      break;
  }
}

let toastTimer: number | undefined;

export function toast(message: string, action?: { label: string; run: () => void }): void {
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
  toastTimer = window.setTimeout(() => (ui.toast.hidden = true), 5000);
}

export function shortLabel(text: string, length: number): string {
  const plain = plainText(text).trim();
  return plain.length > length ? `${plain.slice(0, length - 1).trimEnd()}…` : plain;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
