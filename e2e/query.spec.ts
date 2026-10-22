import { Page, expect, test } from "@playwright/test";
import { freshOutline } from "./helpers";

const OUTLINE = [
  "Open features | :query: #feature is:open -draft",
  "Projects",
  "  Outliner",
  "    Query views #feature",
  "    Crash on paste #bug",
  "    Agenda #feature",
  "  Garden",
  "    Fence #feature 2026-10-15",
  "Inbox",
  "  Draft #feature",
  "This week | :query: #feature; :group: date",
].join("\n");

const queryRow = (page: Page, text: string) => page.locator("#agenda .agenda-item").filter({ has: page.locator(".text", { hasText: text }) });

async function openView(page: Page, id: string) {
  await page.clock.setFixedTime(new Date(2026, 9, 19, 12));
  await freshOutline(page, OUTLINE);
  await page.goto(`./#/${id}`);
}

test("an item with a :query: lists the matching items from all over the outline, under where they live", { tag: "@phone" }, async ({ page }, info) => {
  await openView(page, "i0");
  await expect(page.locator("#title")).toHaveText("Open features");
  await expect(page.locator("#tree")).toBeHidden();
  await expect(page.locator("#agenda .agenda-section h2")).toHaveText(["Projects / Outliner", "Projects / Garden"]);
  await expect(page.locator("#agenda .agenda-item .text")).toHaveText(["Query views #feature", "Agenda #feature", "Fence #feature 2026-10-15"]);
  await page.screenshot({ path: `screenshots/${info.project.name}-query-view.png` });
  await page.locator("#agenda .agenda-section h2 a", { hasText: "Projects / Garden" }).click();
  await expect(page.locator("#title")).toHaveText("Garden");
  await expect(page.locator(".tree .text")).toHaveText(["Fence #feature 2026-10-15"]);
});

test("items in a query view are edited and completed where they live, and leave a view that wants them open", async ({ page }) => {
  await openView(page, "i0");
  const agenda = queryRow(page, "Agenda").locator(".text");
  await agenda.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" built in");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator("#agenda .agenda-item .text")).toHaveText(["Query views #feature", "Fence #feature 2026-10-15"]);
  await page.goto("./#/i2");
  await expect(page.locator(".tree .completed > .row .text")).toHaveText(["Agenda #feature built in"]);
});

test("a query view with :group: date lists the overdue items, then by day, then those without a date", async ({ page }) => {
  await openView(page, "i10");
  await expect(page.locator("#agenda .agenda-section h2")).toHaveText(["Overdue", "Without a date"]);
  await expect(page.locator("#agenda .agenda-section").first().locator(".text")).toHaveText(["Fence #feature 2026-10-15"]);
  await expect(queryRow(page, "Fence").locator(".agenda-path")).toHaveText("Projects / Garden");
});

test("Enter in a query view's title adds no child", async ({ page }) => {
  await openView(page, "i0");
  await page.locator("#title").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.locator("#title")).not.toBeFocused();
  await expect(page.locator("#agenda .agenda-item")).toHaveCount(3);
});

test("a query that matches nothing says what it looked for", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 19, 12));
  await freshOutline(page, "Bugs | :query: #bug\nGroceries");
  await page.goto("./#/i0");
  await expect(page.locator("#agenda .agenda-empty")).toHaveText("Nothing matches #bug.");
});
