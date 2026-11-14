import { Page, expect, test } from "@playwright/test";
import { freshOutline, row } from "./helpers";

const toast = (page: Page) => page.locator("#toast");

async function bookmarkThroughMenu(page: Page) {
  await page.locator("#menu-button").click();
  await page.locator('[data-action="bookmark-page"]').click();
}

test.describe("bookmarks", { tag: "@keys" }, () => {
  test("Bookmarks is made at the top level on first run", async ({ page }) => {
    await freshOutline(page, "Garden\nShed");
    await expect(page.locator("#tree .text")).toHaveText(["Garden", "Shed", "Bookmarks", "About Bookmarks"]);
    await page.goto("./#/bookmarks");
    await expect(page.locator("#title")).toHaveText("Bookmarks");
  });

  test("Bookmark this page from the ⋯ menu adds a link, once", async ({ page }) => {
    await freshOutline(page, "Garden\n  Tomatoes\nShed");
    await row(page, "Garden").locator(".bullet").click();
    await bookmarkThroughMenu(page);
    await expect(toast(page)).toContainText("Added to Bookmarks");
    await bookmarkThroughMenu(page);
    await expect(toast(page)).toContainText("Already in Bookmarks");
    await page.goto("./#/bookmarks");
    await expect(page.locator("#tree .text")).toHaveText(["About Bookmarks", "[[id:i0][Garden]]"]);
  });

  test("Bookmark this page is in the Ctrl-K palette", async ({ page }) => {
    await freshOutline(page, "Garden\nShed");
    await row(page, "Shed").locator(".bullet").click();
    await page.keyboard.press("ControlOrMeta+k");
    await page.locator("#palette input").fill("Bookmark this");
    await page.keyboard.press("Enter");
    await expect(toast(page)).toContainText("Added to Bookmarks");
  });

  test("Ctrl-J with a digit opens the bookmark that has that key, and Ctrl-J 0 the list", async ({ page }) => {
    await freshOutline(page, "Garden\n  Tomatoes\nShed");
    await row(page, "Garden").locator(".bullet").click();
    await bookmarkThroughMenu(page);
    await page.goto("./#/bookmarks");
    await page.locator("#tree .text").last().click();
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("p");
    await page.keyboard.type("key");
    await page.keyboard.press("Enter");
    await page.keyboard.type("2");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await page.goto("./#/i2");
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("2");
    await expect(page.locator("#title")).toHaveText("Garden");
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("0");
    await expect(page.locator("#title")).toHaveText("Bookmarks");
  });

  test("Bookmarks cannot be deleted, and says so", async ({ page }) => {
    await freshOutline(page, "Garden");
    await row(page, "Bookmarks").locator(".text").click();
    await page.keyboard.press("ControlOrMeta+Shift+Backspace");
    await expect(toast(page)).toContainText("Bookmarks stays; empty it instead");
    await expect(row(page, "Bookmarks")).toBeVisible();
  });

  test("Bookmarks opens with the About item collapsed and a key column", async ({ page }) => {
    await freshOutline(page, "Garden");
    await page.goto("./#/bookmarks");
    await expect(page.locator("#tree .text")).toHaveText(["About Bookmarks"]);
    await expect(page.locator("#columns-head")).toContainText("key");
    await row(page, "About Bookmarks").locator(".bullet").click();
    await expect(page.locator("#tree .text")).toHaveText([
      "Add a bookmark",
      "Add an item here with a link to a page or a web address",
      "Open the page, tap ⋯ and tap Bookmark this page",
      "Tap or click a bookmark's link to open its page; a web address opens in a new tab",
      "To give a bookmark a shortcut, write a digit from 1 to 9 in its key column",
    ]);
  });

  test("About Bookmarks cannot be deleted, and says so", async ({ page }) => {
    await freshOutline(page, "Garden");
    await page.goto("./#/bookmarks");
    await row(page, "About Bookmarks").locator(".text").click();
    await page.keyboard.press("ControlOrMeta+Shift+Backspace");
    await expect(toast(page)).toContainText("About Bookmarks stays");
    await expect(row(page, "About Bookmarks")).toBeVisible();
  });

  test("the jump palette lists bookmarks first", async ({ page }) => {
    await freshOutline(page, "Garden\nShed");
    await row(page, "Shed").locator(".bullet").click();
    await bookmarkThroughMenu(page);
    await page.goto("./#/");
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("j");
    await expect(page.locator("#palette li").first()).toContainText("Shed");
  });
});
