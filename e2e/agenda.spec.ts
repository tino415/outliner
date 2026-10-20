import { Page, expect, test } from "@playwright/test";
import { caret, editor, freshOutline } from "./helpers";

async function onMonday(page: Page, outline: string) {
  await page.clock.setFixedTime(new Date(2026, 9, 19, 12));
  await freshOutline(page, outline);
}

const OUTLINE = [
  "Home",
  "  Pay rent 2026-10-15",
  "  Water plants 2026-10-21",
  "Work",
  "  Standup 2026-10-19 9:15",
  "  Review 2026-10-19",
  "  Write report #todo",
  "  Plan next year 2026-12-01",
].join("\n");

const agendaRow = (page: Page, text: string) => page.locator("#agenda .agenda-item").filter({ has: page.locator(".text", { hasText: text }) });

test("⋯ → Agenda lists what is overdue, each day of the week and the undated #todo items, with where each lives", async ({ page }, info) => {
  await onMonday(page, OUTLINE);
  await page.locator("#menu-button").click();
  await page.locator('[data-action="agenda"]').click();
  await expect(page).toHaveTitle("Agenda · Outliner");
  await expect(page.locator("#tree")).toBeHidden();
  await expect(page.locator("#agenda .agenda-section h2")).toHaveText(["Overdue", "Today · Mon 19 Oct", "Wed 21 Oct", "To do, without a date"]);
  await expect(page.locator("#agenda .agenda-item .text")).toHaveText([
    "Pay rent 2026-10-15",
    "Standup 2026-10-19 9:15",
    "Review 2026-10-19",
    "Water plants 2026-10-21",
    "Write report #todo",
  ]);
  await expect(agendaRow(page, "Standup").locator(".agenda-path")).toHaveText("Work");
  await page.screenshot({ path: `screenshots/${info.project.name}-agenda.png` });
  await agendaRow(page, "Standup").locator(".agenda-path").click();
  await expect(page.locator("#title")).toHaveText("Work");
});

test("Ctrl-J G opens the agenda, and items are edited and completed where they live", async ({ page }) => {
  await onMonday(page, OUTLINE);
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("g");
  const review = agendaRow(page, "Review").locator(".text");
  await review.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" the PR");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(agendaRow(page, "Review 2026-10-19 the PR")).toHaveClass(/completed/);
  await agendaRow(page, "Review 2026-10-19 the PR").locator(".agenda-path").click();
  await expect(page.locator("#title")).toHaveText("Work");
  await expect(page.locator(".tree .completed > .row .text")).toHaveText(["Review 2026-10-19 the PR"]);
});

test("in the agenda, keys that would move an item in the outline do nothing", async ({ page }) => {
  await onMonday(page, OUTLINE);
  await page.goto("./#agenda");
  const water = agendaRow(page, "Water plants").locator(".text");
  await water.click();
  await page.keyboard.press("End");
  for (const key of ["Tab", "Shift+Tab", "Alt+Shift+ArrowUp", "Alt+Shift+Enter", "Enter"]) await page.keyboard.press(key);
  await expect(water).not.toBeFocused();
  await water.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  expect(await caret(page)).toEqual({ text: "Water plants 2026-10-21", offset: 0 });
  await page.locator(".crumb.home").click();
  await page.locator(".tree .text", { hasText: /^Home$/ }).locator("xpath=ancestor::div[contains(@class,'row')]/button[contains(@class,'bullet')]").click();
  await expect(page.locator(".tree > .item > .row .text")).toHaveText(["Pay rent 2026-10-15", "Water plants 2026-10-21"]);
  await expect(editor(page, "Water plants 2026-10-21")).toBeVisible();
});

test("an agenda with nothing in it says how to date an item", async ({ page }) => {
  await onMonday(page, "Groceries\nIdeas");
  await page.goto("./#agenda");
  await expect(page.locator("#agenda .agenda-empty")).toContainText("Nothing dated this week");
});
