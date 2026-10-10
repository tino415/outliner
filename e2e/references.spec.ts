import { expect, test } from "@playwright/test";
import { clickEnd, expectOutline, freshOutline, row } from "./helpers";

test("typing [[ picks an item and writes a link that opens it, and the item lists what links to it", async ({ page }) => {
  await freshOutline(page, "Garden\n  Tomatoes\nPlans\n  water");
  await clickEnd(page, "water");
  await page.keyboard.type(" the [[");
  await expect(page.locator("#palette")).toBeVisible();
  await page.keyboard.type("tomat");
  await page.keyboard.press("Enter");
  await page.keyboard.type(" daily");
  const water = page.locator(".tree .text").nth(3);
  await expect(water).toHaveText(/^water the \[\[id:\w+\]\[Tomatoes\]\] daily$/);
  await page.keyboard.press("Escape");
  await expect(water.locator(".ref")).toHaveText("Tomatoes");
  await water.locator(".ref").click();
  await expect(page.locator("#title")).toHaveText("Tomatoes");
  await expect(page.locator("#backlinks")).toContainText("Linked from");
  await page.locator("#backlinks a").click();
  await expect(page.locator("#title")).toHaveText(/^water the/);
});

test("Ctrl-J L links to an item at the caret", async ({ page }) => {
  await freshOutline(page, "Reading list\nsee ");
  await clickEnd(page, "see");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("l");
  await page.keyboard.type("reading");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tree .text").nth(1)).toHaveText(/^see\[\[id:\w+\]\[Reading list\]\]$/);
});

test("a link by text opens the first item with that text, or says there is none", async ({ page }) => {
  await freshOutline(page, "Reading list\nsee [[reading list]]\nsee [[Missing]]");
  await row(page, "see [[reading list]]").locator(".ref").click();
  await expect(page.locator("#title")).toHaveText("Reading list");
  await page.goBack();
  await row(page, "see [[Missing]]").locator(".ref").click();
  await expect(page.locator("#toast")).toContainText("Nothing called “Missing” yet");
  await expectOutline(page, "Reading list\nsee [[reading list]]\nsee [[Missing]]");
});
