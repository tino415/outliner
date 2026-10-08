import { expect, test } from "@playwright/test";
import { expectOutline, freshOutline, row } from "./helpers";

const TEMPLATES = `
Templates
  Meal | :capture: Food/Monday; :ask: kcal; :key: m
  Idea | :capture: Ideas; :at: top; :key: i
Food
  Monday
Ideas
  older idea
`;

test("Alt-Shift-N captures with a template picked by its key, asking for its properties", async ({ page }) => {
  await freshOutline(page, TEMPLATES);
  await page.keyboard.press("Alt+Shift+n");
  await expect(page.locator("#capture-dialog")).toBeVisible();
  await page.keyboard.press("m");
  await expect(page.locator("#capture-text")).toBeFocused();
  await page.keyboard.type("Oats");
  await page.locator('#capture-fields input[data-key="kcal"]').fill("300 kcal");
  await page.keyboard.press("Enter");
  await expect(page.locator("#capture-dialog")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Captured to “Monday”");
  await expect(row(page, "Oats").locator(".note")).toHaveText(":kcal: 300 kcal");
  await expectOutline(page, "Templates\n  Meal\n  Idea\nFood\n  Monday\n    Oats\nIdeas\n  older idea");
});

test("a template filing at the top, and Go there", async ({ page }) => {
  await freshOutline(page, TEMPLATES);
  await page.keyboard.press("Alt+Shift+n");
  await page.keyboard.press("i");
  await page.keyboard.type("new idea");
  await page.keyboard.press("Enter");
  await page.locator("#toast button").click();
  await expect(page.locator("#title")).toHaveText("Ideas");
  await expectOutline(page, "new idea\nolder idea");
});

test("a share opens capture with the shared text, into an Inbox when there are no templates", async ({ page }) => {
  await freshOutline(page, "a");
  await page.goto("./?title=Local-first&text=Local-first&url=https%3A%2F%2Finkandswitch.com");
  await expect(page.locator("#capture-text")).toHaveValue("Local-first https://inkandswitch.com");
  expect(new URL(page.url()).search).toBe("");
  await expect(page.locator("#capture-target")).toHaveText("Goes to Inbox");
  await page.keyboard.press("Enter");
  await expectOutline(page, "a\nInbox\n  Local-first https://inkandswitch.com");
});

test("the menu and Ctrl-K open capture", async ({ page }) => {
  await freshOutline(page, "a");
  await page.locator("#menu-button").click();
  await page.getByRole("button", { name: "Capture…" }).click();
  await expect(page.locator("#capture-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type(">capture");
  await page.keyboard.press("Enter");
  await expect(page.locator("#capture-dialog")).toBeVisible();
});
