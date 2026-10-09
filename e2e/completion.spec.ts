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

test.describe("kinds", () => {
  test("typing at the start of an item offers the kinds in use", async ({ page }) => {
    await freshOutline(page, "Question: one\nQuestion: two\nNeeds you: three\nlast");
    await clickEnd(page, "last");
    await page.keyboard.press("Enter");
    await page.keyboard.type("N");
    const list = page.locator(".completion");
    await expect(list.locator("li")).toHaveText(["Needs you:"]);
    await page.keyboard.press("Enter");
    await page.keyboard.type("four");
    await expectOutline(page, "Question: one\nQuestion: two\nNeeds you: three\nlast\nNeeds you: four");
  });

  test("Alt-Shift-K sets the kind and leaves the caret where it was", async ({ page }) => {
    await freshOutline(page, "Question: one\nwhy is it slow");
    await editor(page, "why is it slow").click();
    await page.keyboard.press("Home");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Alt+Shift+k");
    await expect(page.locator("#palette li").first()).toHaveText("Question");
    await page.keyboard.press("Enter");
    await page.keyboard.type("!");
    await expectOutline(page, "Question: one\nQuestion: why! is it slow");
    await page.keyboard.press("Alt+Shift+k");
    await page.keyboard.type("Waiting");
    await expect(page.locator("#palette li").first()).toHaveText("New kind: Waiting");
    await page.keyboard.press("Enter");
    await expectOutline(page, "Question: one\nWaiting: why! is it slow");
  });

  test("a kind shows as a badge, and a click on it searches for it", async ({ page }) => {
    await freshOutline(page, "Question: one\nplain\nQuestion: two");
    const badge = row(page, "Question: one").locator(".kind");
    await expect(badge).toHaveText("Question:");
    await badge.click();
    await expect(page.locator("#search")).toHaveValue("Question:");
    await expectOutline(page, "Question: one\nQuestion: two");
  });
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
