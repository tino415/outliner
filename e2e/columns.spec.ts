import { Page, expect, test } from "@playwright/test";
import { editor, freshOutline, row } from "./helpers";

const WEEK = `
Week 41 | :columns: calories{+} protein{+}
  Monday
    Breakfast
      Oats | :calories: 300 kcal; :protein: 10 g
      Coffee | :calories: 20 kcal
    Lunch
      Soup | :calories: 250 kcal; :protein: 12 g
  Tuesday
    Brunch | :calories: 400 kcal; :protein: 20 g
`;

function cell(page: Page, text: string, key: string) {
  return row(page, text).locator(`.cell[data-key="${key}"]`);
}

test("a page with :columns: shows sums per meal, day and week", async ({ page }, info) => {
  await freshOutline(page, WEEK);
  await row(page, "Week 41").locator(".bullet").click();
  await expect(page.locator("#columns-head")).toBeVisible();
  await expect(page.locator("#columns-head .column-name")).toHaveText(["calories", "protein"]);
  await expect(page.locator("#columns-head .column-total")).toHaveText(["970 kcal", "42 g"]);
  await expect(cell(page, "Breakfast", "calories")).toHaveText("320 kcal");
  await expect(cell(page, "Breakfast", "calories")).toHaveClass(/rolled/);
  await expect(cell(page, "Monday", "calories")).toHaveText("570 kcal");
  await expect(cell(page, "Oats", "calories")).toHaveText("300 kcal");
  await expect(cell(page, "Coffee", "protein")).toHaveText("");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `screenshots/${info.project.name}-columns.png` });
});

test("editing a cell writes the property and updates every total above it", async ({ page }) => {
  await freshOutline(page, WEEK);
  await row(page, "Week 41").locator(".bullet").click();
  await cell(page, "Coffee", "calories").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("120 kcal");
  await page.keyboard.press("Enter");
  await expect(cell(page, "Coffee", "calories")).toHaveText("120 kcal");
  await expect(cell(page, "Breakfast", "calories")).toHaveText("420 kcal");
  await expect(page.locator("#columns-head .column-total").first()).toHaveText("1070 kcal");
  await expect(row(page, "Coffee").locator(".note")).toHaveText(":calories: 120 kcal");

  await cell(page, "Coffee", "protein").click();
  await page.keyboard.type("1 g");
  await page.keyboard.press("Enter");
  await expect(cell(page, "Breakfast", "protein")).toHaveText("11 g");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(cell(page, "Breakfast", "protein")).toHaveText("10 g");
});

test("typing a property into a note updates the columns when the note is left", async ({ page }) => {
  await freshOutline(page, WEEK);
  await row(page, "Week 41").locator(".bullet").click();
  await editor(page, "Soup").click();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(":calories: 300 kcal");
  await page.keyboard.press("Escape");
  await expect(cell(page, "Lunch", "calories")).toHaveText("300 kcal");
});

test("the menu switches columns on for any page, inferring them from properties", async ({ page }) => {
  await freshOutline(page, "Project\n  Design | :effort: 1h30m\n  Build | :effort: 2d\nPlain");
  await expect(page.locator("#columns-head")).toBeHidden();
  await page.locator("#menu-button").click();
  await page.getByRole("button", { name: "Columns" }).click();
  await expect(page.locator("#columns-head .column-name")).toHaveText(["effort"]);
  await expect(cell(page, "Project", "effort")).toHaveText("49h 30m");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+Shift+c");
  await expect(page.locator("#columns-head")).toBeHidden();
});

test("properties show as key and value outside editing", async ({ page }) => {
  await freshOutline(page, "Oats | from the market; :calories: 300 kcal");
  const property = row(page, "Oats").locator(".prop");
  await expect(property.locator(".prop-key")).toHaveText("calories");
  await expect(property.locator(".prop-value")).toHaveText("300 kcal");
  await expect(row(page, "Oats").locator(".note")).toHaveText("from the market\n:calories: 300 kcal");
});

test("a computed column plans start times from the durations before each item", async ({ page }) => {
  await freshOutline(page, "Monday | :start: 9:00; :columns: effort start{=parent.start + before(effort)}\n  Standup | :effort: 15m\n  Write | :effort: 1h30m\n  Lunch | :effort: 1h");
  await row(page, "Monday").locator(".bullet").click();
  await expect(cell(page, "Lunch", "start")).toHaveText("10:45");
  await expect(cell(page, "Lunch", "start")).toHaveClass(/computed/);
  await editor(page, "Standup").click();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(":effort: 45m");
  await page.keyboard.press("Escape");
  await expect(cell(page, "Lunch", "start")).toHaveText("11:15");
});
