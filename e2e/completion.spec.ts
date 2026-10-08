import { expect, test } from "@playwright/test";
import { clickEnd, editor, expectOutline, freshOutline, row } from "./helpers";

test("typing : at the start of a note line offers the keys in use", async ({ page }) => {
  await freshOutline(page, "Oats | :calories: 300 kcal; :protein: 10 g\nSoup | :calories: 250\nBread");
  await clickEnd(page, "Bread");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type(":");
  const list = page.locator(".completion");
  await expect(list).toBeVisible();
  await expect(list.locator("li")).toHaveText([":calories:", ":protein:"]);
  await page.keyboard.type("pr");
  await expect(list.locator("li")).toHaveText([":protein:"]);
  await page.keyboard.press("Enter");
  await page.keyboard.type("4 g");
  await expect(list).toBeHidden();
  await expect(row(page, "Bread").locator(".note")).toHaveText(":protein: 4 g");
  await expectOutline(page, "Oats\nSoup\nBread");
});

test("# offers the tags in use, most used first, and Escape closes the list", async ({ page }) => {
  await freshOutline(page, "a #work\nb #work #home\nc");
  await clickEnd(page, "c");
  await page.keyboard.type(" #");
  const list = page.locator(".completion");
  await expect(list.locator("li")).toHaveText(["#work", "#home"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expectOutline(page, "a #work\nb #work #home\nc #home ");
  await page.keyboard.type("#w");
  await expect(list.locator("li")).toHaveText(["#work"]);
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(editor(page, "c #home #w")).toBeFocused();
});

test("Alt-Shift-T adds a tag at the end of the item", async ({ page }) => {
  await freshOutline(page, "write report #work\nbuy milk");
  await editor(page, "buy milk").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Alt+Shift+t");
  await expect(page.locator(".completion li")).toHaveText(["#work"]);
  await page.keyboard.press("Enter");
  await expectOutline(page, "write report #work\nbuy milk #work ");
});

test("tags show as chips whose text is still the raw text", async ({ page }) => {
  await freshOutline(page, "plan #ideas");
  const tag = row(page, "plan #ideas").locator(".tag");
  await expect(tag).toHaveText("#ideas");
  await expect(tag.locator(".tag-hash")).toHaveText("#");
});
