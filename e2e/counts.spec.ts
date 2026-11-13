import { expect, test } from "@playwright/test";
import { editor, freshOutline, row } from "./helpers";

test("a folded row counts its direct children and how many are done", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "Page\n  a\n    deep\n  b\n  c");
  await row(page, "Page").locator(".toggle").click();
  await expect(row(page, "Page").locator(".fold-count")).toHaveText("3");

  await row(page, "Page").locator(".toggle").click();
  await editor(page, "b").click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await row(page, "Page").locator(".toggle").click();
  await expect(row(page, "Page").locator(".fold-count")).toHaveText("1/3 done");

  await row(page, "Page").locator(".toggle").click();
  await expect(row(page, "Page").locator(".fold-count")).toHaveCount(0);
});

test("a board column counts its cards and how many are done", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "Project\n  To do\n    write\n    test\n  Done");
  await row(page, "Project").locator(".bullet").click();
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("b");
  const count = (column: string) => page.locator(".board-column").filter({ hasText: column }).locator(".board-count");
  await expect(count("To do")).toHaveText("2");
  await page.locator(".board-card").filter({ hasText: "write" }).locator(".text").click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(count("To do")).toHaveText("1/2 done");
});

test("the count sits on the title's line, right after it", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "Page\n  a\n  b");
  await row(page, "Page").locator(".toggle").click();
  const title = (await editor(page, "Page").boundingBox())!;
  const count = (await row(page, "Page").locator(".fold-count").boundingBox())!;
  expect(count.y).toBeLessThan(title.y + title.height);
  expect(count.y + count.height).toBeGreaterThan(title.y);
  expect(count.x).toBeGreaterThanOrEqual(title.x + title.width - 1);
  expect(count.x - (title.x + title.width)).toBeLessThan(40);
});

test("the add-property + does not cover the count", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "Page\n  a\n  b");
  await row(page, "Page").locator(".toggle").click();
  await row(page, "Page").hover();
  const count = (await row(page, "Page").locator(".fold-count").boundingBox())!;
  const plus = (await row(page, "Page").locator(".prop-add").boundingBox())!;
  expect(plus.x).toBeGreaterThanOrEqual(count.x + count.width);
});
