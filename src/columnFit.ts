import { ItemId } from "./model";
import { Cell, Column } from "./properties";
import { swallowNextClick } from "./clicks";

/*
 * On a phone a column is as wide as its widest value, and columns that need more than 55% of the screen
 * scroll sideways under a fixed window (doc/adr/0074).
 */

export interface WidthOf {
  name(key: string): number;
  value(text: string): number;
}

export interface ColumnsWindow {
  needed: number;
  window: number;
  range: number;
}

interface FittedView {
  columns: Pick<Column, "key">[];
  cells: Map<ItemId, Map<string, Pick<Cell, "text">>>;
}

const PHONE = "(max-width: 640px)";
const CELL_PADDING = 8;
const GAP = 2;
const LEAD = 10;
const SHARE_OF_SCREEN = 0.55;
const SLOP = 10;
const LINE_PIXELS = 16;

interface ColumnsPlace {
  page: HTMLElement;
  head: HTMLElement;
}

let place: ColumnsPlace | null = null;
let fitted: { view: FittedView | null; zoom: ItemId } | null = null;
let range = 0;
let shift = 0;

export function fitColumns(view: FittedView | null, zoom: ItemId): void {
  if (!place) return;
  if (zoom !== fitted?.zoom) shift = 0;
  fitted = { view, zoom };
  const fonts = view?.columns.length && matchMedia(PHONE).matches ? headFonts(place.head) : null;
  if (!view || !fonts) return unfit(place.page);
  const widths = fittedWidths(view.columns, view.cells, measuredIn(fonts));
  const columns = columnsWindow(widths, window.innerWidth);
  place.page.style.setProperty("--column-widths", widths.map((width) => `${width}px`).join(" "));
  place.page.style.setProperty("--columns-window", `${columns.window}px`);
  range = columns.range;
  place.page.classList.toggle("columns-scroll", range > 0);
  shiftColumnsTo(shift);
}

export function refitColumns(): void {
  if (fitted) fitColumns(fitted.view, fitted.zoom);
}

export function columnsScrollUnder(target: Element): boolean {
  return Boolean(place?.page.classList.contains("columns-scroll")) && target.closest(".cells") !== null;
}

export function scrollCutCellIntoView(cell: HTMLElement): void {
  if (!columnsScrollUnder(cell)) return;
  const left = scrollingNumbersLeft(cell);
  const right = cell.closest(".cells")!.getBoundingClientRect().right;
  const { left: cellLeft, right: cellRight } = cell.getBoundingClientRect();
  if (cellLeft < left) shiftColumnsTo(shift - (left - cellLeft));
  else if (cellRight > right) shiftColumnsTo(shift + (cellRight - right));
}

export function scrollingNumbersLeft(inside: Element): number {
  const box = inside.closest(".cells")!;
  return box.getBoundingClientRect().left + parseFloat(getComputedStyle(box).paddingLeft);
}

export function enableColumnScroll(page: HTMLElement, head: HTMLElement): void {
  place = { page, head };
  page.addEventListener("pointerdown", (event) => {
    const target = event.target as Element;
    if (event.pointerType !== "touch" || !event.isPrimary || target.closest(".cell-input") || !columnsScrollUnder(target)) return;
    followDrag(event);
  });
  page.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || !columnsScrollUnder(event.target as Element)) return;
      event.preventDefault();
      shiftColumnsTo(shift + event.deltaX * wheelPixels(event));
    },
    { passive: false },
  );
  let fittedWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === fittedWidth) return;
    fittedWidth = window.innerWidth;
    refitColumns();
  });
}

export function fittedWidths(columns: Pick<Column, "key">[], cells: Map<ItemId, Map<string, Pick<Cell, "text">>>, widthOf: WidthOf): number[] {
  return columns.map(({ key }) => {
    let widest = widthOf.name(key);
    for (const row of cells.values()) {
      const text = row.get(key)?.text;
      if (text) widest = Math.max(widest, widthOf.value(text.replace(/\d/g, "0")));
    }
    return Math.ceil(widest) + CELL_PADDING;
  });
}

export function columnsWindow(widths: number[], screenWidth: number): ColumnsWindow {
  const needed = LEAD + widths.reduce((sum, width) => sum + width, 0) + GAP * Math.max(0, widths.length - 1);
  const window = Math.min(needed, Math.floor(screenWidth * SHARE_OF_SCREEN));
  return { needed, window, range: needed - window };
}

function followDrag(start: PointerEvent): void {
  const startShift = shift;
  let dragging = false;

  const move = (event: PointerEvent) => {
    if (event.pointerId !== start.pointerId) return;
    const dx = event.clientX - start.clientX;
    const dy = event.clientY - start.clientY;
    if (!dragging) {
      if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) return stop();
      if (Math.abs(dx) < SLOP || Math.abs(dx) < 2 * Math.abs(dy)) return;
      dragging = true;
    }
    shiftColumnsTo(startShift - dx);
  };

  const end = (event: PointerEvent) => {
    if (event.pointerId !== start.pointerId) return;
    stop();
    if (dragging) swallowNextClick();
  };

  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function shiftColumnsTo(wanted: number): void {
  const page = place!.page;
  shift = Math.min(Math.max(wanted, 0), range);
  page.style.setProperty("--columns-shift", `${shift}px`);
  page.classList.toggle("columns-more-left", shift > 0);
  page.classList.toggle("columns-more-right", shift < range);
}

function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return LINE_PIXELS;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return window.innerWidth;
  return 1;
}

function unfit(page: HTMLElement): void {
  range = 0;
  for (const property of ["--column-widths", "--columns-window", "--columns-shift"]) page.style.removeProperty(property);
  page.classList.remove("columns-scroll", "columns-more-left", "columns-more-right");
}

interface HeadFonts {
  value: string;
  name: string;
  nameLetterSpacing: number;
}

function headFonts(head: HTMLElement): HeadFonts | null {
  const total = head.querySelector(".column-total");
  const name = head.querySelector(".column-name");
  if (!total || !name) return null;
  return { value: fontOf(total), name: fontOf(name), nameLetterSpacing: parseFloat(getComputedStyle(name).letterSpacing) || 0 };
}

function measuredIn(fonts: HeadFonts): WidthOf {
  return {
    name: (key) => {
      const shown = capitalized(key);
      return textWidth(fonts.name, shown) + fonts.nameLetterSpacing * [...shown].length;
    },
    value: (text) => textWidth(fonts.value, text),
  };
}

function capitalized(key: string): string {
  return key.replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase());
}

function fontOf(element: Element): string {
  const style = getComputedStyle(element);
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

let context: CanvasRenderingContext2D | null = null;
const measured = new Map<string, number>();

function textWidth(font: string, text: string): number {
  const cacheKey = `${font}\n${text}`;
  let width = measured.get(cacheKey);
  if (width === undefined) {
    context ??= document.createElement("canvas").getContext("2d")!;
    context.font = font;
    width = context.measureText(text).width;
    measured.set(cacheKey, width);
  }
  return width;
}
