export interface Selection {
  start: number;
  end: number;
}

export function selectionIn(element: HTMLElement): Selection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null;
  return {
    start: offsetOf(element, range.startContainer, range.startOffset),
    end: offsetOf(element, range.endContainer, range.endOffset),
  };
}

function offsetOf(element: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(node, offset);
  return range.toString().length;
}

export function select(element: HTMLElement, start: number, end = start): void {
  const range = document.createRange();
  const [startNode, startOffset] = pointAt(element, start);
  const [endNode, endOffset] = pointAt(element, end);
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function pointAt(element: HTMLElement, offset: number): [Node, number] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (remaining <= node.length) return [node, remaining];
    remaining -= node.length;
    last = node;
  }
  return last ? [last, last.length] : [element, element.childNodes.length];
}

export function caretRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[0];
  return null;
}

export function isCaretOnFirstLine(element: HTMLElement): boolean {
  const current = selectionIn(element);
  if (!current || current.start === 0) return true;
  const rect = caretRect();
  if (!rect) return true;
  return rect.top - element.getBoundingClientRect().top < lineHeight(element) * 0.75;
}

export function isCaretOnLastLine(element: HTMLElement): boolean {
  const current = selectionIn(element);
  if (!current || current.end === (element.textContent ?? "").length) return true;
  const rect = caretRect();
  if (!rect) return true;
  return element.getBoundingClientRect().bottom - rect.bottom < lineHeight(element) * 0.75;
}

function lineHeight(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
}

/** Text offset inside `element` nearest to the point, or null when the point misses it. */
export function offsetAtPoint(element: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y);
    if (position) [node, offset] = [position.offsetNode, position.offset];
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    if (range) [node, offset] = [range.startContainer, range.startOffset];
  }
  if (!node || !element.contains(node)) return null;
  return offsetOf(element, node, offset);
}
