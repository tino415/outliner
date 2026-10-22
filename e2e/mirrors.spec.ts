import { Page, expect, test } from "@playwright/test";
import { clickEnd, editor, freshOutline, row } from "./helpers";

const OUTLINE = "Projects\n  Garden\n    Tomatoes\n    Beans\nToday\n  Tea";

async function mirrorGardenBelowTea(page: Page) {
  await clickEnd(page, "Tea");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("r");
  await expect(page.locator("#palette")).toBeVisible();
  await page.keyboard.type("garden");
  await page.keyboard.press("Enter");
  return page.locator(".item.mirror");
}

test("Ctrl-J R mirrors an item below: its text and children, live and read-only, with a hollow bullet", async ({ page }) => {
  await freshOutline(page, OUTLINE);
  const mirror = await mirrorGardenBelowTea(page);
  await expect(mirror.locator(".mirror-text")).toHaveText("Garden");
  await expect(mirror.locator(".mirror-text")).toBeFocused();
  await expect(mirror.locator(".mirror-children")).toHaveText(/Tomatoes\s*Beans/);
  await expect(mirror.locator(".mirror-text")).toHaveAttribute("contenteditable", "false");
  await expect(mirror.locator(":scope > .row .bullet")).toHaveAttribute("title", /^Mirror of Projects \/ Garden/);
  const dot = mirror.locator(":scope > .row > .bullet .dot");
  expect(await dot.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await expect(page.locator(".item:not(.mirror) > .row .text").filter({ hasText: /^Tea$/ })).toHaveCount(1);

  await page.keyboard.type("xyz");
  await expect(mirror.locator(".mirror-text")).toHaveText("Garden");

  await clickEnd(page, "Beans");
  await page.keyboard.type(" #green");
  await expect(mirror.locator(".mirror-children")).toContainText("Beans #green");
  await expect(mirror.locator(".mirror-children .tag")).toHaveText("#green");
});

test("Mirror here in Ctrl-K turns a blank item into the mirror", async ({ page }) => {
  await freshOutline(page, OUTLINE);
  await clickEnd(page, "Tea");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("Mirror here");
  await page.keyboard.press("Enter");
  await page.keyboard.type("tomat");
  await page.keyboard.press("Enter");
  const today = page.locator(".item", { has: editor(page, "Today") });
  await expect(today.locator(":scope > .children > .item")).toHaveCount(2);
  await expect(today.locator(":scope > .children > .item.mirror .mirror-text")).toHaveText("Tomatoes");
});

test("the bullet of a mirror zooms to the item, and Enter on it opens it", async ({ page }) => {
  await freshOutline(page, OUTLINE);
  const mirror = await mirrorGardenBelowTea(page);
  await mirror.locator(":scope > .row .bullet").click();
  await expect(page.locator("#title")).toHaveText("Garden");
  await page.goBack();
  await mirror.locator(".mirror-text").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#title")).toHaveText("Garden");
});

test("deleting a mirror leaves the item; a mirror of a deleted item shows as gone", async ({ page }) => {
  await freshOutline(page, OUTLINE);
  const mirror = await mirrorGardenBelowTea(page);
  await page.keyboard.press("ControlOrMeta+Shift+Backspace");
  await expect(mirror).toHaveCount(0);
  await expect(row(page, "Garden")).toHaveCount(1);
  await expect(row(page, "Tea")).toHaveCount(1);

  await mirrorGardenBelowTea(page);
  await page.locator(".item:not(.mirror) > .row > .body > .text", { hasText: /^Garden$/ }).click();
  await page.keyboard.press("ControlOrMeta+Shift+Backspace");
  await expect(mirror.locator(".mirror-text")).toHaveText("gone");
  await expect(mirror.locator(".mirror-children")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(mirror.locator(".mirror-text")).toHaveText("Garden");
});

test("a tap on a mirror opens the item", { tag: "@phone" }, async ({ page, hasTouch }) => {
  await freshOutline(page, OUTLINE);
  const mirror = await mirrorGardenBelowTea(page);
  await expect(mirror.locator(".mirror-text")).toHaveText("Garden");
  await page.keyboard.press("Escape");
  if (hasTouch) await mirror.locator(".mirror-text").tap();
  else await mirror.locator(".mirror-text").click();
  await expect(page.locator("#title")).toHaveText("Garden");
});
