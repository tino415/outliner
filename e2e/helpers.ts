import { Page, expect } from "@playwright/test";

export function row(page: Page, text: string) {
  const exact = new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return page.locator(".row").filter({ has: page.locator(":scope > .body > .text", { hasText: exact }) });
}

export function editor(page: Page, text: string) {
  return row(page, text).locator(".text");
}

/** Opens the app on a clean origin, seeded with `outline` (indented text) or the welcome outline. */
export async function freshOutline(page: Page, outline?: string) {
  const seed = outline === undefined ? null : JSON.stringify(docFrom(outline));
  await page.addInitScript((doc) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "yes");
    localStorage.clear();
    if (doc) localStorage.setItem("outliner-lab:doc:v1", doc);
  }, seed);
  await page.goto("./");
  await page.locator(".tree .text").first().waitFor();
}

function docFrom(outline: string) {
  const root = { id: "root", text: "Test", note: "", parent: null as string | null, children: [] as string[], collapsed: false, completed: false, updated: 0 };
  const items: Record<string, typeof root> = { root };
  const stack: { indent: number; item: typeof root }[] = [{ indent: -1, item: root }];
  outline
    .replace(/^\n/, "")
    .trimEnd()
    .split("\n")
    .forEach((line, i) => {
      const indent = line.length - line.trimStart().length;
      while (stack.at(-1)!.indent >= indent) stack.pop();
      const parent = stack.at(-1)!.item;
      const [text, note = ""] = line.trim().split(" | ");
      const item = { ...root, id: `i${i}`, text, note: note.replaceAll("; ", "\n"), parent: parent.id, children: [] as string[] };
      items[item.id] = item;
      parent.children.push(item.id);
      stack.push({ indent, item });
    });
  return { items };
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

export type StoredKey = "doc" | "sync";

/** What the app keeps in IndexedDB under `key` (src/stateStore.ts), or null. */
export async function storedValue<T = any>(page: Page, key: StoredKey): Promise<T | null> {
  return page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const opening = indexedDB.open("outliner-lab-state", 1);
        opening.onerror = () => reject(opening.error);
        opening.onupgradeneeded = () => opening.result.createObjectStore("state");
        opening.onsuccess = () => {
          const request = opening.result.transaction("state").objectStore("state").get(name);
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error);
        };
      }),
    key,
  ) as Promise<T | null>;
}

/** Writes `value` the way another tab's save does, and tells the tabs of this browser. */
export async function storeValue(page: Page, key: StoredKey, value: unknown, { announce = true } = {}): Promise<void> {
  await page.evaluate(
    ([name, stored, tell]) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("outliner-lab-state", 1);
        opening.onerror = () => reject(opening.error);
        opening.onupgradeneeded = () => opening.result.createObjectStore("state");
        opening.onsuccess = () => {
          const transaction = opening.result.transaction("state", "readwrite");
          transaction.objectStore("state").put(stored, name as string);
          transaction.oncomplete = () => {
            if (tell) {
              const channel = new BroadcastChannel("outliner-lab:stored");
              channel.postMessage(name);
              channel.close();
            }
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    [key, value, announce] as const,
  );
}

/** Drops `key` from IndexedDB without telling the app, as if an older build had never moved it there. */
export async function removeStored(page: Page, key: StoredKey): Promise<void> {
  await page.evaluate(
    (name) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("outliner-lab-state", 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const transaction = opening.result.transaction("state", "readwrite");
          transaction.objectStore("state").delete(name);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    key,
  );
}
