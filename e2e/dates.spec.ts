import { Page, expect, test } from "@playwright/test";
import { caret, clickEnd, editor, freshOutline, row } from "./helpers";

async function onMonday(page: Page, outline: string) {
  await page.clock.setFixedTime(new Date(2026, 9, 19, 12));
  await freshOutline(page, outline);
}

test("an ISO date shows as a chip that says when, red once past, and as written while editing", async ({ page }, info) => {
  await onMonday(page, "Pay rent 2026-10-18\nDentist 2026-10-20 9:30\nTrip 2026-10-23 #travel\nNot one 2026-13-01");
  await expect(row(page, "Pay rent 2026-10-18").locator(".date")).toHaveAttribute("data-label", "yesterday");
  await expect(row(page, "Pay rent 2026-10-18").locator(".date")).toHaveClass(/past/);
  await expect(row(page, "Dentist 2026-10-20 9:30").locator(".date")).toHaveAttribute("data-label", "tomorrow 9:30");
  await expect(row(page, "Trip 2026-10-23 #travel").locator(".date")).toHaveAttribute("data-label", "Fri 23 Oct");
  await expect(row(page, "Not one 2026-13-01").locator(".date")).toHaveCount(0);
  await page.screenshot({ path: `screenshots/${info.project.name}-dates.png` });
  const trip = editor(page, "Trip 2026-10-23 #travel");
  await trip.click({ position: { x: 4, y: 8 } });
  await expect(trip.locator(".date-raw")).toBeVisible();
  await expect(trip).toHaveText("Trip 2026-10-23 #travel");
});

test("Ctrl-J I D picks a date and writes it at the caret, apart from the word before", async ({ page }) => {
  await onMonday(page, "Call the bank");
  await clickEnd(page, "Call the bank");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("i");
  await page.keyboard.press("d");
  await expect(page.locator("#palette")).toBeVisible();
  await expect(page.locator("#palette li").first()).toHaveText("2026-10-19Mon 19 Oct");
  await page.keyboard.type("fri");
  await expect(page.locator("#palette li")).toHaveCount(1);
  await expect(page.locator("#palette li .date")).toHaveAttribute("data-label", "Fri 23 Oct");
  await page.keyboard.press("Enter");
  expect(await caret(page)).toEqual({ text: "Call the bank 2026-10-23", offset: 24 });
  await page.keyboard.type(" at noon");
  await page.keyboard.press("Escape");
  await expect(row(page, "Call the bank 2026-10-23 at noon").locator(".date")).toHaveAttribute("data-label", "Fri 23 Oct");
});

test("typing !! asks for a date and the date replaces it; Escape keeps the !!", async ({ page }) => {
  await onMonday(page, "Renew passport");
  await clickEnd(page, "Renew passport");
  await page.keyboard.type(" by !!");
  await expect(page.locator("#palette")).toBeVisible();
  await page.keyboard.type("14.11.");
  await page.keyboard.press("Enter");
  expect(await caret(page)).toEqual({ text: "Renew passport by 2026-11-14", offset: 28 });
  await page.keyboard.type(" wow!!");
  await expect(page.locator("#palette")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await caret(page)).toEqual({ text: "Renew passport by 2026-11-14 wow!!", offset: 34 });
});

test("a click on a date chip changes the date, or removes it", async ({ page }) => {
  await onMonday(page, "Call 2026-10-20 about it");
  await row(page, "Call 2026-10-20 about it").locator(".date").click();
  await expect(page.locator("#palette input")).toHaveAttribute("placeholder", "Change 2026-10-20 to…");
  await page.keyboard.type("+1w");
  await page.keyboard.press("Enter");
  const changed = row(page, "Call 2026-10-26 about it");
  await expect(changed.locator(".date")).toHaveAttribute("data-label", "Mon 26 Oct");
  await changed.locator(".date").click();
  await page.locator("#palette li", { hasText: "Remove the date" }).click();
  await expect(row(page, "Call about it")).toBeVisible();
});

test("due and scheduled take their value from the date picker and show it as a date", async ({ page }) => {
  await onMonday(page, "File taxes");
  await clickEnd(page, "File taxes");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("p");
  await page.keyboard.type("due");
  await page.keyboard.press("Enter");
  await expect(page.locator("#palette .palette-hint")).toContainText("tomorrow, fri, +3d");
  await page.keyboard.type("tomorrow");
  await page.keyboard.press("Enter");
  const chip = row(page, "File taxes").locator(".prop-chip");
  await expect(chip).toHaveText("due tomorrow");
  await expect(chip).toHaveAttribute("title", "due: 2026-10-20");
  await chip.click();
  await expect(page.locator("#palette li").first()).toHaveText("2026-10-20Tue 20 Oct");
  await page.locator("#palette li", { hasText: "Remove due" }).click();
  await expect(row(page, "File taxes").locator(".prop-chip")).toHaveCount(0);
});

test("search understands due:, date: and is:overdue", async ({ page }) => {
  await onMonday(page, "Pay rent | :due: 2026-10-18\nPay phone | :due: 2026-10-19\nGym 2026-10-24\nRead");
  await page.locator("#search").fill("due:today");
  await expect(page.locator(".tree .match .text")).toHaveText(["Pay phone"]);
  await page.locator("#search").fill("is:overdue");
  await expect(page.locator(".tree .match .text")).toHaveText(["Pay rent"]);
  await page.locator("#search").fill("date:this-week");
  await expect(page.locator(".tree .match .text")).toHaveText(["Pay phone", "Gym 2026-10-24"]);
});

test.describe("a UTC time", () => {
  test.use({ timezoneId: "Europe/Bratislava" });

  test("shows in the reader's local time and day, and as written with its Z while editing", async ({ page }) => {
    await onMonday(page, "Deploy 2026-10-19 9:00Z\nRelease 2026-10-19 23:30Z\nSync 2026-10-20 9:00");
    await expect(row(page, "Deploy 2026-10-19 9:00Z").locator(".date")).toHaveAttribute("data-label", "today 11:00");
    await expect(row(page, "Release 2026-10-19 23:30Z").locator(".date")).toHaveAttribute("data-label", "tomorrow 1:30");
    await expect(row(page, "Sync 2026-10-20 9:00").locator(".date")).toHaveAttribute("data-label", "tomorrow 9:00");
    const deploy = editor(page, "Deploy 2026-10-19 9:00Z");
    await deploy.click({ position: { x: 4, y: 8 } });
    await expect(deploy).toHaveText("Deploy 2026-10-19 9:00Z");
  });
});
