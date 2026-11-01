import { expect, test } from "@playwright/test";
import { caret, clickEnd, editor, freshOutline, row } from "./helpers";

test("Ctrl-; sets a property by key and value, and the caret stays where it was", async ({ page }, info) => {
  await freshOutline(page, "Oats | :kcal: 300 kcal\nSoup");
  await clickEnd(page, "Soup");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("p");
  await expect(page.locator("#palette li").first()).toHaveText("kcal");
  await page.keyboard.press("Enter");
  await expect(page.locator("#palette li").first()).toHaveText("300 kcal");
  await page.keyboard.type("250 kcal");
  await expect(page.locator("#palette li").first()).toHaveText("Set to 250 kcal");
  await page.keyboard.press("Enter");
  await expect(row(page, "Soup").locator(".prop-chip")).toHaveText("kcal 250 kcal");
  expect(await caret(page)).toEqual({ text: "Soup", offset: 4 });
  await expect(row(page, "Soup").locator(".note")).toBeHidden();
  await page.screenshot({ path: `screenshots/${info.project.name}-properties.png` });
});

test("a new key is offered as typed", async ({ page }) => {
  await freshOutline(page, "Task");
  await clickEnd(page, "Task");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("p");
  await page.keyboard.type("effort");
  await page.keyboard.press("Enter");
  await page.keyboard.type("45m");
  await page.keyboard.press("Enter");
  await expect(row(page, "Task").locator(".prop-chip")).toHaveText("effort 45m");
});

test("a + button on the row under the mouse adds a property, without moving the rows", async ({ page }) => {
  await freshOutline(page, "Oats\nSoup");
  const add = row(page, "Soup").getByRole("button", { name: "Add a property" });
  await expect(add).toBeHidden();
  const before = await row(page, "Soup").boundingBox();
  await row(page, "Soup").hover();
  expect(await row(page, "Soup").boundingBox()).toEqual(before);
  await add.click();
  await page.keyboard.type("effort");
  await page.keyboard.press("Enter");
  await page.keyboard.type("1h");
  await page.keyboard.press("Enter");
  await expect(row(page, "Soup").locator(".prop-chip")).toHaveText("effort 1h");
});

test("a click on a chip changes or removes its value", async ({ page }) => {
  await freshOutline(page, "Task | :effort: 1h");
  await row(page, "Task").locator(".prop-chip").click();
  await expect(page.locator("#palette input")).toHaveAttribute("placeholder", "effort: 1h");
  await page.keyboard.type("2h");
  await page.keyboard.press("Enter");
  await expect(row(page, "Task").locator(".prop-chip")).toHaveText("effort 2h");
  await row(page, "Task").locator(".prop-chip").click();
  await page.keyboard.type("remove");
  await page.locator("#palette li", { hasText: "Remove effort" }).click();
  await expect(row(page, "Task").locator(".prop-chip")).toHaveCount(0);
  await expect(editor(page, "Task")).toBeVisible();
});

test("the private chip offers to make the item public again, as Make private… does", async ({ page }) => {
  await freshOutline(page, "Journal\n  secret");
  await editor(page, "Journal").click();
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("x");
  await page.keyboard.type("personal");
  await page.keyboard.press("Enter");
  await row(page, "Journal").locator(".prop-chip").first().click();
  await expect(page.locator("#palette input")).toHaveAttribute("placeholder", "Make private with the key…");
  await page.locator("#palette li", { hasText: "Make public again" }).click();
  await expect(row(page, "Journal").locator(".prop-chip")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("outliner-lab:doc:v1")!).items).some((id) => id.includes("~")))).toBe(false);
});

test("settings of a page show as muted chips under its title", async ({ page }) => {
  await freshOutline(page, "Plan | :columns: effort\n  Task | :effort: 1h");
  await row(page, "Plan").locator(".bullet").click();
  await expect(page.locator("#title-props .prop-chip.setting")).toHaveText("columns effort");
  await expect(row(page, "Task").locator(".prop-chip")).toHaveCount(0);
});

test("a value written as =… shows its result in the chip, the formula on hover, and follows the values it reads", async ({ page }) => {
  await freshOutline(page, "Shopping\n  Apples | :count: 3; :price: =count * 2");
  const price = row(page, "Apples").locator(".prop-chip", { hasText: "price" });
  await expect(price).toHaveText("price 6");
  await expect(price).toHaveClass(/computed/);
  await expect(price).toHaveAttribute("title", "price: =count * 2");
  await row(page, "Apples").locator(".prop-chip", { hasText: "count" }).click();
  await page.keyboard.type("4");
  await page.keyboard.press("Enter");
  await expect(price).toHaveText("price 8");
});

test("a formula with nothing to compute shows as computed and empty, not as its raw text", async ({ page }) => {
  await freshOutline(page, "Shopping\n  Apples | :price: =count * 2");
  const price = row(page, "Apples").locator(".prop-chip", { hasText: "price" });
  await expect(price).toHaveClass(/computed/);
  await expect(price).toHaveText("price –");
});
