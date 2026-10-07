import { Page, expect } from "@playwright/test";

export function row(page: Page, text: string) {
  return page.locator(".row").filter({ has: page.locator(":scope > .body > .text", { hasText: text }) });
}

export function editor(page: Page, text: string) {
  return row(page, text).locator(".text");
}

export async function freshOutline(page: Page, outline?: string) {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(".tree .text").first().waitFor();
  if (outline === undefined) return;
  await page.evaluate((text) => {
    const lines = text.trim().split("\n");
    const items: Record<string, unknown> = {};
    const root = { id: "root", text: "Test", note: "", parent: null, children: [] as string[], collapsed: false, completed: false, updated: 0 };
    items.root = root;
    const stack: { indent: number; item: typeof root }[] = [{ indent: -1, item: root }];
    lines.forEach((line, i) => {
      const indent = line.length - line.trimStart().length;
      while (stack.at(-1)!.indent >= indent) stack.pop();
      const parent = stack.at(-1)!.item;
      const item = { ...root, id: `i${i}`, text: line.trim(), parent: parent.id, children: [] as string[] };
      items[item.id] = item;
      parent.children.push(item.id);
      stack.push({ indent, item });
    });
    localStorage.setItem("outliner-lab:doc:v1", JSON.stringify({ items }));
  }, outline);
  await page.reload();
  await page.locator(".tree .text").first().waitFor();
}

/** The visible outline as indented text, two spaces per level. */
export async function outlineText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const lines: string[] = [];
    const walk = (list: Element, depth: number) => {
      for (const li of Array.from(list.children)) {
        const text = li.querySelector(":scope > .row .text")!.textContent;
        const done = li.classList.contains("completed") ? " [x]" : "";
        lines.push("  ".repeat(depth) + text + done);
        const children = li.querySelector(":scope > .children");
        if (children) walk(children, depth + 1);
      }
    };
    walk(document.getElementById("tree")!, 0);
    return lines.join("\n");
  });
}

export async function expectOutline(page: Page, expected: string) {
  const normalized = expected.replace(/^\n/, "").replace(/\n\s*$/, "");
  const indent = Math.min(...normalized.split("\n").map((line) => line.length - line.trimStart().length));
  const dedented = normalized
    .split("\n")
    .map((line) => line.slice(indent))
    .join("\n");
  await expect.poll(() => outlineText(page)).toBe(dedented);
}

export async function caret(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(active);
    range.setEnd(selection.anchorNode!, selection.anchorOffset);
    return { text: active.textContent, offset: range.toString().length };
  });
}

export async function clickEnd(page: Page, text: string) {
  const target = editor(page, text);
  await target.click();
  await page.keyboard.press("End");
}
