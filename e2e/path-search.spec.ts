import { expect, test } from "@playwright/test";
import { clickEnd, expectOutline, freshOutline } from "./helpers";

const WORLD = "Test\n  PayoutID\n    IEx\n    Other\nPlans\n  IEx notes\nTODO:\n  Inbox:\n  Next:";

test.describe("path search", { tag: "@keys" }, () => {
  test("a path query in the jump palette finds the item and Enter zooms to it", async ({ page }) => {
    await freshOutline(page, WORLD);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("ID/IEx");
    await expect(page.locator("#palette li").first()).toContainText("IEx");
    await expect(page.locator("#palette li").first()).toContainText("PayoutID");
    await page.keyboard.press("Enter");
    await expect(page.locator("#title")).toHaveText("IEx");
  });

  test("Move to takes a path with a column and a slash", async ({ page }) => {
    await freshOutline(page, "TODO:\n  Inbox:\n    card\n  Next:");
    await clickEnd(page, "card");
    await page.keyboard.press("Control+j");
    await page.keyboard.press("m");
    await page.keyboard.type("TODO: / Next");
    await page.keyboard.press("Enter");
    await expectOutline(page, "TODO:\n  Inbox:\n  Next:\n    card");
  });
});
