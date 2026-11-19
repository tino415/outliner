import { Page, expect, test } from "@playwright/test";
import { caret, choose, clickEnd, freshOutline } from "./helpers";

async function inEmptyItem(page: Page) {
  await freshOutline(page, "First");
  await clickEnd(page, "First");
  await page.keyboard.press("Enter");
}


test("/ in an empty item lists its commands and a tapped one runs in place of the /", { tag: "@phone" }, async ({ page, isMobile }) => {
  await inEmptyItem(page);
  await page.keyboard.type("/");
  await expect(page.locator("#palette")).toBeVisible();
  await choose(page.locator("#palette li", { hasText: /^Bold/ }), isMobile);
  expect(await caret(page)).toEqual({ text: "****", offset: 2 });
});

test("Escape leaves the / in the item", async ({ page }) => {
  await inEmptyItem(page);
  await page.keyboard.type("/");
  await expect(page.locator("#palette")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await caret(page)).toEqual({ text: "/", offset: 1 });
});

test("a / after a space opens the commands, and Escape keeps it", async ({ page }) => {
  await inEmptyItem(page);
  await page.keyboard.type("a /");
  await expect(page.locator("#palette")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await caret(page)).toEqual({ text: "a /", offset: 3 });
});

test("a / inside a word, a path or a URL opens nothing", async ({ page }) => {
  await inEmptyItem(page);
  await page.keyboard.type("a/b https://x");
  await expect(page.locator("#palette")).toBeHidden();
  expect(await caret(page)).toEqual({ text: "a/b https://x", offset: 13 });
});

test("a / in a note opens nothing", async ({ page }) => {
  await freshOutline(page, "First");
  await clickEnd(page, "First");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("/");
  await expect(page.locator("#palette")).toBeHidden();
});

test("a / inside an inline code span opens nothing", async ({ page }) => {
  await inEmptyItem(page);
  await page.keyboard.type("`cd /");
  await expect(page.locator("#palette")).toBeHidden();
});
