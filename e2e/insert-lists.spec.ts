import { Page, expect, test } from "@playwright/test";
import { choose, clickEnd, expectOutline, freshOutline, row } from "./helpers";

const food = [
  "Food | :columns: kcal protein carbs fat",
  "  _settings",
  "    Insert",
  '      Foods | :query: under:"Food/Database" has:grams; :insert: link into food with grams',
  '      Earlier days | :query: under:"Food/Journal" -has:grams; :insert: copy contents, last first',
  "  Database",
  "    Portions",
  "      Greek yoghurt, cup | :grams: 120; :kcal: 116; :protein: 11; :carbs: 5; :fat: 6",
  "      Rye bread, 2 slices | :grams: 80; :kcal: 190",
  "  Journal",
  "    Monday",
  "      Breakfast",
  "Garden",
].join("\n");

async function longPress(page: Page, text: string) {
  const bullet = row(page, text).locator(".bullet");
  const box = (await bullet.boundingBox())!;
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: "touch", pointerId: 7, isPrimary: true, button: 0 };
  await bullet.dispatchEvent("pointerdown", at);
  await page.waitForTimeout(600);
  await bullet.dispatchEvent("pointerup", at);
  await expect(page.locator("#item-menu")).toBeVisible();
}

async function openInsertOnBreakfast(page: Page, isMobile: boolean) {
  await longPress(page, "Breakfast");
  const entry = page.locator("#item-menu").getByRole("button", { name: "Insert from a list…" });
  await expect(entry).toBeVisible();
  await choose(entry, isMobile);
  await expect(page.locator("#palette")).toBeVisible();
}

test.describe("Insert from a list", { tag: "@phone" }, () => {
  test("a long press on Breakfast offers Insert from a list…, with a tab per list", async ({ page, isMobile }) => {
    await freshOutline(page, food);
    await openInsertOnBreakfast(page, isMobile);
    await expect(page.locator("#palette .palette-modes button")).toHaveText(["Foods", "Earlier days"]);
    await expect(page.locator("#palette input")).toHaveAttribute("placeholder", "Insert under “Breakfast”…");
  });

  test("a row shows its parent and its values under its title", async ({ page, isMobile }) => {
    await freshOutline(page, food);
    await openInsertOnBreakfast(page, isMobile);
    await page.locator("#palette input").fill("yog");
    const option = page.locator("#palette li[data-index]");
    await expect(option.locator(".palette-text")).toHaveText(["Greek yoghurt, cup"]);
    await expect(option.locator(".palette-path")).toHaveText(["Portions · grams 120 · kcal 116 · protein 11 · carbs 5 · fat 6"]);
  });

  test("a tap adds a line that links the pick, and one undo takes it away", async ({ page, isMobile }) => {
    await freshOutline(page, food);
    await openInsertOnBreakfast(page, isMobile);
    await expect(page.locator("#palette .palette-hint")).toHaveText("Adds a line under “Breakfast” that links it");
    await page.locator("#palette input").fill("yog");
    await choose(page.locator("#palette li[data-index]").first(), isMobile);
    const line = row(page, "Breakfast").locator("xpath=..").locator(".children .row");
    await expect(line.locator(".text")).toHaveText(["Greek yoghurt, cup"]);
    await expect(line.locator(".prop-chip")).toHaveText(["food [[id:i7][Greek yoghurt, cup]]", "grams 120"]);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(row(page, "Breakfast").locator("xpath=..").locator(".children .row")).toHaveCount(0);
  });

  test("the second tab copies what is in an earlier meal", async ({ page, isMobile }) => {
    await freshOutline(page, food.replace("      Breakfast", "      Breakfast\n        Porridge | :grams: 250\n    Tuesday\n      Lunch"));
    await longPress(page, "Lunch");
    await choose(page.locator("#item-menu").getByRole("button", { name: "Insert from a list…" }), isMobile);
    await choose(page.locator("#palette .palette-modes button", { hasText: "Earlier days" }), isMobile);
    await expect(page.locator("#palette .palette-hint")).toHaveText("Adds copies of what is in it under “Lunch”");
    await choose(page.locator("#palette li[data-index]", { hasText: "Breakfast" }), isMobile);
    await expect(row(page, "Lunch").locator("xpath=..").locator(".children .text")).toHaveText(["Porridge"]);
    await expect(row(page, "Breakfast").locator("xpath=..").locator(".children .text")).toHaveText(["Porridge"]);
  });
});

test("an item with no lists above has no Insert entry, and Ctrl-J I I says so", async ({ page }) => {
  await freshOutline(page, food);
  await row(page, "Garden").locator(".bullet").click({ button: "right" });
  await expect(page.locator("#item-menu")).toBeVisible();
  await expect(page.locator("#item-menu").getByRole("button", { name: "Insert from a list…" })).toBeHidden();
  await page.keyboard.press("Escape");
  await clickEnd(page, "Garden");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("i");
  await page.keyboard.press("i");
  await expect(page.locator("#toast")).toContainText("No Insert lists above this item");
});

test("Ctrl-J I I on Breakfast opens the picker, and Enter adds the first match", async ({ page }) => {
  await freshOutline(page, food);
  await clickEnd(page, "Breakfast");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("i");
  await page.keyboard.press("i");
  await expect(page.locator("#palette")).toBeVisible();
  await page.keyboard.type("rye");
  await page.keyboard.press("Enter");
  await expect(row(page, "Breakfast").locator("xpath=..").locator(".children .text")).toHaveText(["Rye bread, 2 slices"]);
  await expect(page.locator(":focus")).toHaveText("Rye bread, 2 slices");
});

test("two lists with one title get tabs told apart", async ({ page }) => {
  await freshOutline(page, food.replace("Earlier days", "Foods"));
  await clickEnd(page, "Breakfast");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("i");
  await page.keyboard.press("i");
  await expect(page.locator("#palette .palette-modes button")).toHaveText(["Foods", "Foods 2"]);
  await page.locator("#palette .palette-modes button", { hasText: "Foods 2" }).click();
  await expect(page.locator("#palette .palette-hint")).toHaveText("Adds copies of what is in it under “Breakfast”");
});

test("a list with no query keeps its tab and says so", async ({ page }) => {
  await freshOutline(page, food.replace(":query: under:\"Food/Journal\" -has:grams; ", ""));
  await clickEnd(page, "Breakfast");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("i");
  await page.keyboard.press("i");
  await page.locator("#palette .palette-modes button", { hasText: "Earlier days" }).click();
  await expect(page.locator("#palette li")).toHaveText(["This list has no query"]);
});

test("Edit Insert lists of this page makes _settings > Insert and zooms into it", async ({ page }) => {
  await freshOutline(page, "Garden\n  Tomatoes");
  await row(page, "Garden").locator(".bullet").click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#palette input").fill("Edit Insert lists");
  await page.keyboard.press("Enter");
  await expect(page.locator("#title")).toHaveText("Insert");
  await page.goBack();
  await expectOutline(page, "Tomatoes\n_settings");
});
