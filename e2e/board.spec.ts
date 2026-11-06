import { Page, expect, test } from "@playwright/test";
import { freshOutline, reloadOnceStored, row } from "./helpers";

/** The board as text: one column per line, "Column: card, card". */
async function boardText(page: Page): Promise<string> {
  return page.evaluate(() =>
    [...document.querySelectorAll("#board .board-column")]
      .map((column) => {
        const title = column.querySelector(".board-column-head .text")!.textContent;
        const cards = [...column.querySelectorAll(".board-card > .row > .text")].map((card) => card.textContent);
        return `${title}: ${cards.join(", ")}`;
      })
      .join("\n"),
  );
}

async function expectBoard(page: Page, expected: string) {
  await expect.poll(() => boardText(page)).toBe(expected);
}

function card(page: Page, text: string) {
  return page.locator(".board-card").filter({ has: page.locator(":scope > .row > .text", { hasText: new RegExp(`^${text}$`) }) });
}

async function openProject(page: Page) {
  await openBoard(page, "Project\n  To do\n    write\n    test\n  Doing\n  Done");
  await expectBoard(page, "To do: write, test\nDoing: \nDone: ");
}

async function openBoard(page: Page, outline: string) {
  await freshOutline(page, outline);
  await page.locator(".row").filter({ hasText: "Project" }).first().locator(".bullet").click();
  await expect(page.locator("#title")).toHaveText("Project");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("b");
  await expect(page.locator("#board")).toBeVisible();
}

test("a page shown as a board has its children as columns and theirs as cards", { tag: "@phone" }, async ({ page }, info) => {
  await openProject(page);
  await expect(page.locator("#tree")).toBeHidden();
  await page.screenshot({ path: `screenshots/${info.project.name}-board.png` });
  await card(page, "write").locator(".text").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("review");
  await expectBoard(page, "To do: write, review, test\nDoing: \nDone: ");
  await reloadOnceStored(page, "review");
  await expectBoard(page, "To do: write, review, test\nDoing: \nDone: ");
});

test("Alt-Shift-arrows move a card to the next column and back", { tag: "@phone" }, async ({ page }) => {
  await openProject(page);
  await card(page, "test").locator(".text").click();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expectBoard(page, "To do: write\nDoing: \nDone: test");
  await page.keyboard.type("ed");
  await expectBoard(page, "To do: write\nDoing: \nDone: tested");
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await expectBoard(page, "To do: write\nDoing: tested\nDone: ");
});

test("a card dragged by its handle lands where it is dropped", { tag: "@phone" }, async ({ page }) => {
  await openProject(page);
  const handle = card(page, "write").locator(".board-handle");
  const target = page.locator(".board-column").nth(1).locator(".board-cards");
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 20, to.y + 4, { steps: 10 });
  await page.mouse.up();
  await expectBoard(page, "To do: test\nDoing: write\nDone: ");
});

test("a card dragged with a finger moves to another column", { tag: "@phone" }, async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || !isMobile, "real touch input is sent through the Chromium DevTools protocol, on the phone");
  await openProject(page);
  const from = (await card(page, "test").locator(".board-handle").boundingBox())!;
  const to = (await page.locator(".board-column").nth(1).locator(".board-cards").boundingBox())!;
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + 30, y: to.y + 4 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  for (let step = 1; step <= 12; step++) {
    const point = { x: start.x + ((end.x - start.x) * step) / 12, y: start.y + ((end.y - start.y) * step) / 12 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expectBoard(page, "To do: write\nDoing: test\nDone: ");
});

test("buttons add cards and columns, and the board turns back into the outline", { tag: "@phone" }, async ({ page }) => {
  await openProject(page);
  await page.locator(".board-column").nth(2).getByRole("button", { name: "+ Add a card" }).click();
  await page.keyboard.type("ship it");
  await page.getByRole("button", { name: "+ Column" }).click();
  await page.keyboard.type("Later");
  await expectBoard(page, "To do: write, test\nDoing: \nDone: ship it\nLater: ");
  await page.locator("#title").click();
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("b");
  await expect(page.locator("#board")).toBeHidden();
  await expect(page.locator("#tree")).toContainText("ship it");
});

test("a short board reaches the bottom of the window, so its scrollbar is there, and the page does not scroll", { tag: "@phone" }, async ({ page }) => {
  await openProject(page);
  const box = (await page.locator("#board").boundingBox())!;
  const height = await page.evaluate(() => window.innerHeight);
  expect(box.y + box.height).toBeGreaterThanOrEqual(height - 1);
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight)).toBeLessThanOrEqual(height + 1);
});

test("the line between two columns adds an empty column there and puts the caret in its name", { tag: ["@phone", "@keys"] }, async ({ page, isMobile }) => {
  await openProject(page);
  const line = page.locator(".board-gap").nth(1);
  await expect(page.locator(".board-gap")).toHaveCount(3);
  if (isMobile) await line.tap();
  else await line.click();
  await expectBoard(page, "To do: write, test\n: \nDoing: \nDone: ");
  await page.keyboard.type("Blocked");
  await expectBoard(page, "To do: write, test\nBlocked: \nDoing: \nDone: ");
  await reloadOnceStored(page, "Blocked");
  await expectBoard(page, "To do: write, test\nBlocked: \nDoing: \nDone: ");
});

test("the line before the first column adds an empty column in front", { tag: ["@phone", "@keys"] }, async ({ page, isMobile }) => {
  await openProject(page);
  const line = page.locator(".board-gap").first();
  if (isMobile) await line.tap();
  else await line.click();
  await expectBoard(page, ": \nTo do: write, test\nDoing: \nDone: ");
  await page.keyboard.type("Backlog");
  await expectBoard(page, "Backlog: \nTo do: write, test\nDoing: \nDone: ");
  await reloadOnceStored(page, "Backlog");
  await expectBoard(page, "Backlog: \nTo do: write, test\nDoing: \nDone: ");
});

// ---- the board's own key map --------------------------------------------------------------

const twoColumns = "Project\n  To do\n    write\n      outline\n    test\n  Doing\n    draft\n    review\n  Done";

function columnTitle(page: Page, text: string) {
  return page.locator(".board-column-head .text", { hasText: new RegExp(`^${text}$`) });
}

async function caretText(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.textContent ?? null);
}

test("Tab and Shift-Tab move a card to the next column at its height, and a column one place over", { tag: ["@phone", "@keys"] }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "test").locator(".text").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await expectBoard(page, "To do: write\nDoing: draft, test, review\nDone: ");
  await page.keyboard.type("ed");
  await expectBoard(page, "To do: write\nDoing: draft, tested, review\nDone: ");
  await page.keyboard.press("Shift+Tab");
  await expectBoard(page, "To do: write, tested\nDoing: draft, review\nDone: ");

  await columnTitle(page, "Doing").click();
  await page.keyboard.press("Tab");
  await expectBoard(page, "To do: write, tested\nDone: \nDoing: draft, review");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expectBoard(page, "Doing: draft, review\nTo do: write, tested\nDone: ");
  expect(await caretText(page)).toBe("Doing");
});

test("Alt-Shift-arrows keep the card's height as Tab does", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "write").locator(".text").click();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expectBoard(page, "To do: test\nDoing: write, draft, review\nDone: ");
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await expectBoard(page, "To do: write, test\nDoing: draft, review\nDone: ");
});

test("the toolbar's indent and outdent buttons move a card between columns on a board", { tag: "@touch" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "test").locator(".text").tap();
  await page.getByRole("button", { name: "Indent" }).tap();
  await expectBoard(page, "To do: write\nDoing: draft, test, review\nDone: ");
  await page.getByRole("button", { name: "Outdent" }).tap();
  await expectBoard(page, "To do: write, test\nDoing: draft, review\nDone: ");
});

test("Enter makes a card: after a card with children, first on a column title, and after an empty last card", { tag: ["@phone", "@keys"] }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "write").locator(".text").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("plan");
  await expectBoard(page, "To do: write, plan, test\nDoing: draft, review\nDone: ");
  await expect(card(page, "write").locator(".board-inside")).toHaveText("1 inside");

  await columnTitle(page, "Done").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("ship");
  await expectBoard(page, "To do: write, plan, test\nDoing: draft, review\nDone: ship");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("party");
  await expectBoard(page, "To do: write, plan, test\nDoing: draft, review\nDone: ship, , party");
});

test("Backspace and Delete join two cards of a column but never reach across columns", { tag: ["@phone", "@keys"] }, async ({ page }) => {
  await openBoard(page, twoColumns);
  const unchanged = "To do: write, test\nDoing: draft, review\nDone: ";
  await card(page, "draft").locator(".text").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await columnTitle(page, "Doing").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await card(page, "test").locator(".text").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Delete");
  await columnTitle(page, "To do").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Delete");
  await expectBoard(page, unchanged);

  await card(page, "review").locator(".text").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await expectBoard(page, "To do: write, test\nDoing: draftreview\nDone: ");
});

test("Ctrl-[ on a card's page goes back to the board, past the column", { tag: ["@phone", "@keys"] }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "draft").locator(".board-bullet").click();
  await expect(page.locator("#title")).toHaveText("draft");
  await page.locator("#title").click();
  await page.keyboard.press("Control+[");
  await expect(page.locator("#title")).toHaveText("Project");
  await expect(page.locator("#board")).toBeVisible();
  await expect.poll(() => caretText(page)).toBe("draft");

  await card(page, "draft").locator(".board-bullet").click();
  await expect(page.locator("#title")).toHaveText("draft");
  await expect(page.locator("#crumbs")).toContainText("Doing");
  await page.keyboard.press("Control+[");
  await expect(page.locator("#title")).toHaveText("Project");
  await expect(page.locator("#board")).toBeVisible();
});

test("on a board the help, the palette and the menu offer what works there, and the outline's keys are back off it", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "write").locator(".text").click();
  await page.keyboard.press("Control+.");
  await page.keyboard.press("ControlOrMeta+ArrowUp");
  await expect(card(page, "write").locator(".board-inside")).toHaveText("1 inside");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type(">column");
  await expect(page.locator("#palette li")).toContainText(["To the column on the right"]);
  await expect(page.locator("#palette")).not.toContainText("Show / hide columns");
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type(">fold");
  await expect(page.locator("#palette")).not.toContainText("Fold / unfold");
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+/");
  await expect(page.locator("#help")).toContainText("To the column on the right");
  await expect(page.locator("#help")).not.toContainText("Indent");
  await expect(page.locator("#help")).not.toContainText("Fold / unfold");
  await page.locator("#help-close").click();

  await page.locator("#menu-button").click();
  await expect(page.locator("#menu").getByText("Board", { exact: true })).toBeVisible();
  await expect(page.locator("#menu").getByText("Columns", { exact: true })).toBeHidden();
  await expect(page.locator("#menu").getByText("Collapse all", { exact: true })).toBeHidden();
  await page.locator("#menu").getByText("Board", { exact: true }).click();
  await expect(page.locator("#tree")).toBeVisible();
  await expect(page.locator("#menu").getByText("Columns", { exact: true })).toBeVisible();
  await expect(page.locator("#menu").getByText("Collapse all", { exact: true })).toBeVisible();
  await expect(row(page, "outline")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+/");
  await expect(page.locator("#help")).toContainText("Indent");
  await expect(page.locator("#help")).not.toContainText("To the column on the right");
});

test("on a board the selection highlight and the focused row clear as in the outline", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "write").locator(".text").click();
  await card(page, "test").locator(".text").click();
  await expect(page.locator("#board .row.focused")).toHaveCount(1);
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.locator("#board .item.selected")).not.toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#board .item.selected")).toHaveCount(0);
});
