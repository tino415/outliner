import { ItemId, setItemProperty } from "./model";
import { commitAndRender, doc, state, ui } from "./app";
import { caretNow } from "./editing";
import { columnViewShown, render } from "./render";
import { savePrefs } from "./storage";

/** Switches the column view of the current page, remembering the choice for that page. */
export function toggleColumnView(): void {
  state.prefs = { ...state.prefs, columnPages: { ...state.prefs.columnPages, [state.zoom]: !columnViewShown() } };
  savePrefs(state.prefs);
  render(caretNow());
}

/** A click on an item's own cell turns it into a field; Enter or leaving it writes the property. */
export function bindColumnCells(): void {
  ui.tree.addEventListener("click", (event) => {
    const cell = (event.target as Element).closest<HTMLElement>(".cell");
    if (!cell || cell.classList.contains("rolled") || cell.querySelector("input")) return;
    const id = cell.closest<HTMLElement>(".item")!.dataset.id!;
    editCell(cell, id, cell.dataset.key!);
  });
}

function editCell(cell: HTMLElement, id: ItemId, key: string): void {
  const shown = [...cell.childNodes];
  const input = Object.assign(document.createElement("input"), {
    className: "cell-input",
    value: doc().items[id].properties[key] ?? "",
  });
  input.setAttribute("aria-label", key);
  cell.replaceChildren(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    const next = save && doc().items[id] ? setItemProperty(doc(), id, key, input.value) : doc();
    if (next === doc()) {
      cell.replaceChildren(...shown);
      return;
    }
    commitAndRender(next, caretNow());
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finish(true);
    else if (event.key === "Escape") finish(false);
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  input.addEventListener("blur", () => setTimeout(() => finish(true)));
}

/** Notes are edited without renders, so cells catch up when a note loses focus. */
export function refreshAfterNoteEdit(): void {
  if (columnViewShown()) setTimeout(() => render(caretNow()));
}
