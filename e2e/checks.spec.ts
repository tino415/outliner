import { Page, expect, test } from "@playwright/test";
import { clickEnd, editor, freshOutline, row } from "./helpers";

const toast = (page: Page) => page.locator("#toast");

const todoWithEffort = "TODO:\n  Checks:\n    effort: one of\n      low\n      medium\n      epic\n    estimate: integer\n  Fix it";

test("under a Checks: child the effort picker lists the listed values only", async ({ page }) => {
  await freshOutline(page, todoWithEffort);
  await clickEnd(page, "Fix it");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("p");
  await page.keyboard.type("effort");
  await page.keyboard.press("Enter");
  await expect(page.locator("#palette li")).toHaveText(["low", "medium", "epic"]);
  await page.keyboard.type("huge");
  await expect(page.locator("#palette li")).not.toContainText(["Set to huge", "low"]);
  await page.keyboard.press("Escape");
});

test("a value that breaks its check is refused with a toast naming the check", async ({ page }) => {
  await freshOutline(page, todoWithEffort);
  await clickEnd(page, "Fix it");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("p");
  await page.keyboard.type("estimate");
  await page.keyboard.press("Enter");
  await page.keyboard.type("3h");
  await page.keyboard.press("Enter");
  await expect(toast(page)).toContainText('estimate must be an integer (checked under "TODO:")');
  await expect(row(page, "Fix it").locator(".prop-chip")).toHaveCount(0);
});

test("a :key: note line with a refused value stays in the note, with a toast", async ({ page }) => {
  await freshOutline(page, todoWithEffort);
  await clickEnd(page, "Fix it");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type(":estimate: 3h");
  await page.keyboard.press("Escape");
  await expect(toast(page)).toContainText("estimate must be an integer");
  await expect(row(page, "Fix it").locator(".note")).toHaveText(":estimate: 3h");
  await expect(row(page, "Fix it").locator(".prop-chip")).toHaveCount(0);
});

test("a value that already breaks its check shows as a red chip", async ({ page }) => {
  await freshOutline(page, "TODO:\n  Checks:\n    estimate: integer\nOld | :estimate: 3h; :other: x");
  await clickEnd(page, "Old");
  await page.keyboard.press("Tab");
  await expect(row(page, "Old").locator(".prop-chip.bad")).toHaveText("estimate 3h");
  await expect(row(page, "Old").locator(".prop-chip.bad")).toHaveAttribute("title", /must be an integer/);
  await expect(row(page, "Old").locator(".prop-chip:not(.bad)")).toHaveText("other x");
});

test("a note line after :key: offers the values of its enum", async ({ page }) => {
  await freshOutline(page, todoWithEffort);
  await clickEnd(page, "Fix it");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type(":effort: ");
  await expect(page.locator(".completion li")).toHaveText(["low", "medium", "epic"]);
});

test.describe("writing a check", () => {
  test("typing a type offers it, and a keystroke that starts none is refused", async ({ page }) => {
    await freshOutline(page, "TODO:\n  Checks:\n    estimate: \n  Fix it | :estimate: 2");
    await clickEnd(page, "estimate:");
    await page.keyboard.type(" in");
    await expect(page.locator(".completion li")).toHaveText(["integer"]);
    await page.keyboard.type("t");
    await page.keyboard.type("x");
    await expect(editor(page, "estimate: int")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(editor(page, "estimate: integer")).toBeVisible();
  });

  test("a pasted unknown type shows red and checks nothing", async ({ page }) => {
    await freshOutline(page, "TODO:\n  Checks:\n    estimat: integr\n  Fix it | :estimat: 3h");
    await expect(row(page, "estimat: integr").locator(".text")).toHaveAttribute("title", /Unknown type/);
    await expect(row(page, "Fix it").locator(".prop-chip.bad")).toHaveCount(0);
  });

  test("the keys in use under the parent are offered before the colon", async ({ page }) => {
    await freshOutline(page, "TODO:\n  Checks:\n    e\n  Fix it | :effort: low");
    await clickEnd(page, "e");
    await page.keyboard.type("f");
    await expect(page.locator(".completion li")).toHaveText(["effort:"]);
  });

  test("the values used under one of are offered", async ({ page }) => {
    await freshOutline(page, "TODO:\n  Checks:\n    effort: one of\n      low\n      high\n      l\n  Fix it | :effort: low");
    await clickEnd(page, "l");
    await page.keyboard.type("o");
    await expect(page.locator(".completion li")).toHaveText(["low"]);
  });
});

test("a board whose item has a Checks: child shows no Checks: column, and its button zooms into it", async ({ page }) => {
  await freshOutline(page, "Project | :view: board\n  Checks:\n    effort: integer\n  To do\n    write");
  await page.locator(".row").filter({ hasText: "Project" }).first().locator(".bullet").click();
  await expect(page.locator("#board")).toBeVisible();
  await expect(page.locator("#board .board-column-head .text")).toHaveText(["To do"]);
  await page.locator("[data-board-checks]").click();
  await expect(page.locator("#title")).toHaveText("Checks:");
});

test("the board's Checks button makes the Checks: child when there is none", async ({ page }) => {
  await freshOutline(page, "Project | :view: board\n  To do");
  await page.locator(".row").filter({ hasText: "Project" }).first().locator(".bullet").click();
  await page.locator("[data-board-checks]").click();
  await expect(page.locator("#title")).toHaveText("Checks:");
  await page.goBack();
  await expect(page.locator("#board .board-column-head .text")).toHaveText(["To do"]);
});

test("Ctrl-K, checks, Enter makes a Checks: child and zooms into it", async ({ page }) => {
  await freshOutline(page, "Garden\n  Tomatoes");
  await row(page, "Garden").locator(".bullet").click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#palette input").fill("checks");
  await page.keyboard.press("Enter");
  await expect(page.locator("#title")).toHaveText("Checks:");
  await page.goBack();
  await expect(page.locator("#tree .text")).toHaveText(["Tomatoes", "Checks:"]);
});

test("Bookmarks with key: unique one of 1..9 refuses a second key 1, naming the first bookmark", async ({ page }) => {
  await freshOutline(page, "Garden\nShed");
  for (const name of ["Garden", "Shed"]) {
    await row(page, name).locator(".bullet").click();
    await page.locator("#menu-button").click();
    await page.locator('[data-action="bookmark-page"]').click();
    await page.goBack();
  }
  await page.goto("./#/bookmarks");
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#palette input").fill("checks");
  await page.keyboard.press("Enter");
  await page.locator("#add-item").click();
  await page.keyboard.type("key: unique one of 1..9");
  await page.keyboard.press("Escape");
  await page.goBack();
  const bookmarks = page.locator("#tree .text").filter({ hasText: /^\[\[/ });
  for (const bookmark of [bookmarks.first(), bookmarks.last()]) {
    await bookmark.click();
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("p");
    await page.keyboard.type("key");
    await page.keyboard.press("Enter");
    await page.keyboard.type("1");
    await page.keyboard.press("Enter");
  }
  await expect(toast(page)).toContainText('key 1 is already on "[[id:');
});
