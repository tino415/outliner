import { expect, test } from "@playwright/test";
import { shownCrumbs, zoomIntoClothes } from "./helpers";

test("a wide window shows the whole path, a narrow one puts the levels that do not fit behind a button", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await zoomIntoClothes(page);
  await expect.poll(() => shownCrumbs(page)).toEqual(["Home", "Projects", "Travel", "Weekend in Vienna", "Packing"]);

  await page.setViewportSize({ width: 420, height: 800 });
  await expect(page.locator("#crumbs").getByRole("button", { name: "Whole path" })).toBeVisible();
});

test.describe("Show the path", { tag: "@keys" }, () => {
  test.beforeEach(async ({ page }) => zoomIntoClothes(page));

  test("Mod-J U opens the path on the parent, and Enter shows the parent", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("u");
    await expect(page.locator("#path-menu").getByRole("button", { name: "Packing" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#title")).toHaveText("Packing");
  });

  test("ArrowUp and Enter show the level above the parent, and Escape closes the list on the same page", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("u");
    await expect(page.locator("#path-menu").getByRole("button", { name: "Packing" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.locator("#title")).toHaveText("Weekend in Vienna");

    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("u");
    await expect(page.locator("#path-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#path-menu")).toBeHidden();
    await expect(page.locator("#title")).toHaveText("Weekend in Vienna");
  });

  test("the palette finds Zoom out with no item being edited", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("zoom");
    await page.locator("#palette li").filter({ hasText: /^Zoom out/ }).click();
    await expect(page.locator("#title")).toHaveText("Packing");
  });
});
