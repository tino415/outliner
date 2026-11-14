import { Page, expect, test } from "@playwright/test";
import { expectOutline, freshOutline, outlineText, row } from "./helpers";

const TEMPLATES = `
Templates
  Meal | :capture: Food/Monday; :ask: kcal; :key: m
  Idea | :capture: Ideas; :at: top; :key: i
Food
  Monday
Ideas
  older idea
`;

test("Ctrl-J N captures with a template picked by its key, asking for its properties", async ({ page }) => {
  await freshOutline(page, TEMPLATES);
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("n");
  await expect(page.locator("#capture-dialog")).toBeVisible();
  await page.keyboard.press("m");
  await expect(page.locator("#capture-text")).toBeFocused();
  await page.keyboard.type("Oats");
  await page.locator('#capture-fields input[data-key="kcal"]').fill("300 kcal");
  await page.keyboard.press("Enter");
  await expect(page.locator("#capture-dialog")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Captured to “Monday”");
  await expect(row(page, "Oats").locator(".prop-chip")).toHaveText("kcal 300 kcal");
  await expectOutline(page, "Templates\n  Meal\n  Idea\nFood\n  Monday\n    Oats\nIdeas\n  older idea");
});

test("a template filing at the top, and Go there", async ({ page }) => {
  await freshOutline(page, TEMPLATES);
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("n");
  await page.keyboard.press("i");
  await page.keyboard.type("new idea");
  await page.keyboard.press("Enter");
  await page.locator("#toast button").click();
  await expect(page.locator("#title")).toHaveText("Ideas");
  await expectOutline(page, "new idea\nolder idea");
});

const PLAN = `
Templates
  Plan | :capture: Plan/{date}; :key: p
  Idea | :capture: Ideas; :key: i
Plan | :new: top
  older day
Ideas
  older idea
`;

async function expectToday(page: Page) {
  await expect(page.locator("#title")).toHaveText(new RegExp(String.raw`^\d{4}-\d{2}-\d{2}$`));
  await expectOutline(page, "");
}

test("Ctrl-J W then a template's key goes to its target, creating today first and filing nothing", async ({ page }) => {
  await freshOutline(page, PLAN);
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("w");
  await expect(page.locator("#capture-dialog")).toBeVisible();
  await expect(page.locator("#capture-text")).toBeHidden();
  await page.keyboard.press("p");
  await expect(page.locator("#capture-dialog")).toBeHidden();
  await expectToday(page);
});

test("Go there in the Capture dialog opens the target without capturing", async ({ page }) => {
  await freshOutline(page, PLAN);
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("n");
  await page.keyboard.press("i");
  await page.keyboard.type("not filed");
  await page.getByRole("button", { name: "Go there" }).click();
  await expect(page.locator("#title")).toHaveText("Ideas");
  await expectOutline(page, "older idea");
});

test("Ctrl-K offers Go to target for each template", async ({ page }) => {
  await freshOutline(page, PLAN);
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type(">go to target: idea");
  await page.keyboard.press("Enter");
  await expect(page.locator("#title")).toHaveText("Ideas");
});

test("a click on the value of a :capture: chip goes to its target, the key still edits", async ({ page }) => {
  await freshOutline(page, PLAN);
  await row(page, "Idea").locator('.prop-chip[data-key="capture"] .prop-key').click();
  await expect(page.locator("#palette")).toBeVisible();
  await page.keyboard.press("Escape");
  await row(page, "Idea").locator('.prop-chip[data-key="capture"] .prop-value').click();
  await expect(page.locator("#title")).toHaveText("Ideas");
});

test("?capture=Plan&go opens today's page under a parent keeping new pages on top", async ({ page }) => {
  await freshOutline(page, PLAN);
  await page.goto("./?capture=Plan&go");
  await expectToday(page);
  expect(new URL(page.url()).search).toBe("");
  await page.keyboard.press("Control+[");
  await expect(page.locator("#title")).toHaveText("Plan");
  await expect.poll(() => outlineText(page)).toMatch(/^\d{4}-\d{2}-\d{2}\nolder day$/);
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

test("Capture from the app's icon while the app is already open opens capture there", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const launches: { targetURL: string }[] = [{ targetURL: location.href }];
    let consumer: ((params: { targetURL: string }) => void) | null = null;
    Object.defineProperty(window, "launchQueue", { value: { setConsumer: (each: typeof consumer) => ((consumer = each), launches.splice(0).forEach((params) => consumer!(params))) } });
    Object.defineProperty(window, "launchAgain", { value: (url: string) => (consumer ? consumer({ targetURL: url }) : launches.push({ targetURL: url })) });
  });
  await freshOutline(page, "Inbox");
  await expect(page.locator("#capture-dialog")).toBeHidden();
  await page.evaluate(() => (window as unknown as { launchAgain: (url: string) => void }).launchAgain(new URL("./?capture&text=from the dock", location.href).href));
  await expect(page.locator("#capture-dialog")).toBeVisible();
  await expect(page.locator("#capture-text")).toHaveValue("from the dock");
  await page.evaluate(() => (window as unknown as { launchAgain: (url: string) => void }).launchAgain(new URL("./?capture", location.href).href));
  await expect(page.locator("#capture-dialog")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Capture from the app's icon when the app was closed opens capture once", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await freshOutline(page, "Inbox");
  await page.addInitScript(() => {
    Object.defineProperty(window, "launchQueue", { value: { setConsumer: (consumer: (params: { targetURL: string }) => void) => consumer({ targetURL: location.href }) } });
  });
  await page.goto("./?capture&text=cold start");
  await expect(page.locator("#capture-dialog")).toBeVisible();
  await expect(page.locator("#capture-text")).toHaveValue("cold start");
  expect(errors).toEqual([]);
});
