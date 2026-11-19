import { expect, test } from "@playwright/test";
import { clickEnd, expectOutline, freshOutline, row } from "./helpers";

test("typing past 200 characters in a title stops at 200 and toasts", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "x");
  await clickEnd(page, "x");
  await page.keyboard.insertText("a".repeat(250));
  await expect(page.locator("#toast")).toContainText("200");
  const title = page.locator(".text:focus");
  expect((await title.textContent())?.length).toBe(200);
  await expect(title).toHaveAttribute("data-count", "200/200");
});

test("a note with three list lines, left, gives three children and keeps its prose", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "Shopping");
  await clickEnd(page, "Shopping");
  await page.keyboard.press("Shift+Enter");
  for (const line of ["Buy for Sunday", "- eggs", "- milk", "- flour"]) {
    await page.keyboard.type(line);
    if (line !== "- flour") await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Escape");
  await expectOutline(page, "Shopping\n  eggs\n  milk\n  flour");
  await expect(row(page, "Shopping").locator(".note")).toHaveText("Buy for Sunday");
});
