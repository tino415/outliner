import { expect, test } from "@playwright/test";
import { clickEnd, editor, expectOutline, freshOutline, row } from "./helpers";

test("typing : at the start of a note line offers the keys in use", async ({ page }) => {
  await freshOutline(page, "Oats | :calories: 300 kcal; :protein: 10 g\nSoup | :calories: 250\nBread");
  await clickEnd(page, "Bread");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type(":");
  const list = page.locator(".completion");
  await expect(list).toBeVisible();
  await expect(list.locator("li")).toHaveText([":calories:", ":protein:", ":columns:"]);
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
  await expectOutline(page, "a #work\nb #work #home\nc #home");
  await page.keyboard.type(" #w");
  await expect(list.locator("li")).toHaveText(["#work"]);
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(editor(page, "c #w")).toBeFocused();
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

  test("Ctrl-J K sets the kind and leaves the caret where it was", async ({ page }) => {
    await freshOutline(page, "Question: one\nwhy is it slow");
    await editor(page, "why is it slow").click();
    await page.keyboard.press("Home");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("k");
    await expect(page.locator("#palette li").first()).toHaveText("Question");
    await page.keyboard.press("Enter");
    await page.keyboard.type("!");
    await expectOutline(page, "Question: one\nQuestion: why! is it slow");
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("k");
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

test("Ctrl-J T adds a tag at the end of the item", async ({ page }) => {
  await freshOutline(page, "write report #work\nbuy milk");
  await editor(page, "buy milk").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("t");
  await expect(page.locator(".completion li")).toHaveText(["#work"]);
  await page.keyboard.press("Enter");
  await expectOutline(page, "write report #work\nbuy milk #work");
});

test("a title that is only a tag keeps it in the text, as a tag", async ({ page }) => {
  await freshOutline(page, "#ideas");
  const tag = editor(page, "#ideas").locator(".tag");
  await expect(tag).toHaveText("#ideas");
  await expect(tag.locator(".tag-hash")).toHaveText("#");
});

test("a #tag typed in a title becomes a chip after the title when the title is left", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "the jump\nnext");
  await editor(page, "the jump").click();
  await page.keyboard.press("Home");
  await page.keyboard.type("Fix #bug ");
  await editor(page, "next").click();
  await expectOutline(page, "Fix the jump #bug\nnext");
  await expect(row(page, "Fix the jump").locator(".props .tag-chip")).toHaveText("#bug");
});

test("a #tag typed in a note becomes a chip and leaves the note when the note is left", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "plan\nnext");
  await clickEnd(page, "plan");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("see #feature");
  await editor(page, "next").click();
  await expect(row(page, "plan").locator(".props .tag-chip")).toHaveText("#feature");
  await expect(row(page, "plan").locator(".note")).toHaveText("see");
});

test("a tag picked from completion goes straight to the chips", async ({ page }) => {
  await freshOutline(page, "a #work\nb");
  await expect(row(page, "a").locator(".props .tag-chip")).toHaveText("#work");
  await clickEnd(page, "b");
  await page.keyboard.type(" #w");
  await page.keyboard.press("Enter");
  await expect(row(page, "b").locator(".props .tag-chip")).toHaveText("#work");
  await expectOutline(page, "a #work\nb #work");
});

test("a tag chip searches for the tag", async ({ page }) => {
  await freshOutline(page, "a #work\nb");
  await row(page, "a").locator(".tag-chip").click();
  await expect(page.locator("#search")).toHaveValue("#work");
});
