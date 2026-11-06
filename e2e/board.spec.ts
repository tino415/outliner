import { Page, expect, test } from "@playwright/test";
import { freshOutline, reloadOnceStored, row, storedValue } from "./helpers";

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
  await card(page, "write").locator(":scope > .row > .text").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("review");
  await expectBoard(page, "To do: write, review, test\nDoing: \nDone: ");
  await reloadOnceStored(page, "review");
  await expectBoard(page, "To do: write, review, test\nDoing: \nDone: ");
});

test("Alt-Shift-arrows move a card to the next column and back", { tag: "@phone" }, async ({ page }) => {
  await openProject(page);
  await card(page, "test").locator(":scope > .row > .text").click();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expectBoard(page, "To do: write\nDoing: \nDone: test");
  await page.keyboard.type("ed");
  await expectBoard(page, "To do: write\nDoing: \nDone: tested");
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await expectBoard(page, "To do: write\nDoing: tested\nDone: ");
});

test("a card dragged by its bullet lands where it is dropped", { tag: "@phone" }, async ({ page }) => {
  await openProject(page);
  const handle = card(page, "write").locator(":scope > .row > .bullet");
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
  const from = (await card(page, "test").locator(":scope > .row > .bullet").boundingBox())!;
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
  await card(page, "test").locator(":scope > .row > .text").click();
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
  await card(page, "write").locator(":scope > .row > .text").click();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expectBoard(page, "To do: test\nDoing: write, draft, review\nDone: ");
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await expectBoard(page, "To do: write, test\nDoing: draft, review\nDone: ");
});

test("the toolbar's indent and outdent buttons move a card between columns on a board", { tag: "@touch" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "test").locator(":scope > .row > .text").tap();
  await page.getByRole("button", { name: "Indent" }).tap();
  await expectBoard(page, "To do: write\nDoing: draft, test, review\nDone: ");
  await page.getByRole("button", { name: "Outdent" }).tap();
  await expectBoard(page, "To do: write, test\nDoing: draft, review\nDone: ");
});

test("Enter makes a card: after a card with children, first on a column title, and after an empty last card", { tag: ["@phone", "@keys"] }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "write").locator(":scope > .row > .text").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("plan");
  await expectBoard(page, "To do: write, plan, test\nDoing: draft, review\nDone: ");
  await expect(card(page, "write").locator(".board-child > .row > .text")).toHaveText(["outline"]);

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
  await card(page, "draft").locator(":scope > .row > .text").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await columnTitle(page, "Doing").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await card(page, "test").locator(":scope > .row > .text").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Delete");
  await columnTitle(page, "To do").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Delete");
  await expectBoard(page, unchanged);

  await card(page, "review").locator(":scope > .row > .text").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await expectBoard(page, "To do: write, test\nDoing: draftreview\nDone: ");
});

test("Ctrl-[ on a card's page goes back to the board, past the column", { tag: ["@phone", "@keys"] }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "draft").locator(":scope > .row > .bullet").click();
  await expect(page.locator("#title")).toHaveText("draft");
  await page.locator("#title").click();
  await page.keyboard.press("Control+[");
  await expect(page.locator("#title")).toHaveText("Project");
  await expect(page.locator("#board")).toBeVisible();
  await expect.poll(() => caretText(page)).toBe("draft");

  await card(page, "draft").locator(":scope > .row > .bullet").click();
  await expect(page.locator("#title")).toHaveText("draft");
  await expect(page.locator("#crumbs")).toContainText("Doing");
  await page.keyboard.press("Control+[");
  await expect(page.locator("#title")).toHaveText("Project");
  await expect(page.locator("#board")).toBeVisible();
});

test("on a board the help, the palette and the menu offer what works there, and the outline's keys are back off it", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "write").locator(":scope > .row > .text").click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type(">column");
  await expect(page.locator("#palette li")).toContainText(["To the column on the right"]);
  await expect(page.locator("#palette")).not.toContainText("Show / hide columns");
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+/");
  await expect(page.locator("#help")).toContainText("To the column on the right");
  await expect(page.locator("#help")).not.toContainText("Indent");
  await expect(page.locator("#help")).toContainText("Fold / unfold");
  await page.locator("#help-close").click();

  await page.locator("#menu-button").click();
  await expect(page.locator("#menu").getByText("Board", { exact: true })).toBeVisible();
  await expect(page.locator("#menu").getByText("Columns", { exact: true })).toBeHidden();
  await expect(page.locator("#menu").getByText("Collapse all", { exact: true })).toBeVisible();
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
  await card(page, "write").locator(":scope > .row > .text").click();
  await card(page, "test").locator(":scope > .row > .text").click();
  await expect(page.locator("#board .row.focused")).toHaveCount(1);
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.locator("#board .item.selected")).not.toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#board .item.selected")).toHaveCount(0);
});

function bulletOf(item: ReturnType<typeof card>) {
  return item.locator(":scope > .row > .bullet");
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

function centre(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("a right click on a card's bullet opens the item menu, which moves the card to the next column", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await bulletOf(card(page, "test")).click({ button: "right" });
  const menu = page.locator("#item-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Collapse" })).toBeHidden();
  await menu.getByRole("button", { name: "To the column on the right" }).click();
  await expectBoard(page, "To do: write\nDoing: draft, test, review\nDone: ");
  await bulletOf(card(page, "test")).click({ button: "right" });
  await menu.getByRole("button", { name: "To the column on the left" }).click();
  await expectBoard(page, "To do: write, test\nDoing: draft, review\nDone: ");

  await page.locator(".board-column").nth(1).locator(".board-column-head .bullet").click({ button: "right" });
  await expect(page.locator("#item-menu-title")).toHaveText("Doing");
  await expect(menu.getByRole("button", { name: "To the column on the right" })).toBeHidden();
});

test("a long press on a card's bullet opens the item menu and does not open the card", { tag: "@touch" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  const bullet = bulletOf(card(page, "draft"));
  const box = (await bullet.boundingBox())!;
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: "touch", pointerId: 7, isPrimary: true, button: 0 };
  await bullet.dispatchEvent("pointerdown", at);
  await page.waitForTimeout(600);
  await bullet.dispatchEvent("pointerup", at);
  await expect(page.locator("#item-menu")).toBeVisible();
  await expect(page.locator("#title")).toHaveText("Project");
  await page.getByRole("button", { name: "To the column on the right" }).tap();
  await expectBoard(page, "To do: write, test\nDoing: review\nDone: draft");
});

test("a column dragged by its bullet moves among the columns, and a card dropped outside every column goes back", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  const doing = page.locator(".board-column").nth(1);
  const toDo = (await page.locator(".board-column").first().boundingBox())!;
  await drag(page, centre((await doing.locator(".board-column-head .bullet").boundingBox())!), { x: toDo.x + 20, y: toDo.y + 20 });
  await expectBoard(page, "Doing: draft, review\nTo do: write, test\nDone: ");

  const title = (await page.locator("#title").boundingBox())!;
  await drag(page, centre((await bulletOf(card(page, "test")).boundingBox())!), centre(title));
  await expect(page.locator(".drop-indicator")).toHaveCount(0);
  await expectBoard(page, "Doing: draft, review\nTo do: write, test\nDone: ");
});

test("a card is dropped between two cards, and its bullet still opens it", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  const review = (await card(page, "review").boundingBox())!;
  await drag(page, centre((await bulletOf(card(page, "write")).boundingBox())!), { x: review.x + 40, y: review.y + 4 });
  await expectBoard(page, "To do: test\nDoing: draft, write, review\nDone: ");
  await bulletOf(card(page, "write")).click();
  await expect(page.locator("#title")).toHaveText("write");
});

test("+ property on a card and on a column title sets a property shown as a chip there", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "draft").locator(":scope > .row > .text").click();
  await card(page, "draft").locator(".prop-add").click();
  await expect(page.locator("#palette input")).toHaveAttribute("placeholder", "Property…");
  await page.keyboard.type("effort");
  await page.keyboard.press("Enter");
  await page.keyboard.type("2h");
  await page.keyboard.press("Enter");
  await expect(card(page, "draft").locator(".prop-chip")).toHaveText("effort 2h");

  const head = page.locator(".board-column-head").nth(1);
  await head.locator(".text").click();
  await head.locator(".prop-add").click();
  await page.keyboard.type("limit");
  await page.keyboard.press("Enter");
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  await expect(head.locator(".prop-chip")).toHaveText("limit 3");
});

test("a file dropped on a card is attached to that card", { tag: "@phone" }, async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "only Chromium carries files on a synthetic drop event");
  await openBoard(page, twoColumns);
  await card(page, "review").locator(":scope > .row > .text").evaluate((text) => {
    const data = new DataTransfer();
    data.items.add(new File(["notes"], "notes.txt", { type: "text/plain" }));
    text.dispatchEvent(new DragEvent("dragover", { dataTransfer: data, bubbles: true, cancelable: true }));
    text.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(card(page, "review").locator(".note")).toContainText("notes.txt");
});

test("+ Add a card puts the card first in a column with :new: top", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, "Project\n  Inbox | :new: top\n    older\n  Done\n    shipped");
  await page.locator(".board-column").first().getByRole("button", { name: "+ Add a card" }).click();
  await page.keyboard.type("newest");
  await page.locator(".board-column").nth(1).getByRole("button", { name: "+ Add a card" }).click();
  await page.keyboard.type("last");
  await expectBoard(page, "Inbox: newest, older\nDone: shipped, last");
});


type StoredItem = { text: string; note: string; collapsed: boolean };

async function reloadOnceItemStored(page: Page, text: string, stored: (item: StoredItem) => boolean) {
  await expect
    .poll(async () => Object.values((await storedValue<{ items: Record<string, StoredItem> }>(page, "doc"))?.items ?? {}).some((item) => item.text === text && stored(item)))
    .toBe(true);
  await page.reload();
}
function childRows(item: ReturnType<typeof card>) {
  return item.locator(".board-child > .row > .text");
}

test("a card shows its children until it is folded, by the arrow, Ctrl-. or Mod-arrows, and stays folded on reload", { tag: ["@phone", "@keys"] }, async ({ page }) => {
  await openBoard(page, "Project\n  To do\n    write\n      outline\n        headings\n      draft\n    test\n  Done");
  const write = card(page, "write");
  await expect(childRows(write)).toHaveText(["outline", "draft"]);
  await expect(write.locator(".board-child").first().locator(".board-inside")).toHaveText("1 inside");
  await expect(write.locator(":scope > .row > .board-inside")).toHaveCount(0);

  await write.locator(":scope > .row > .text").click();
  await page.keyboard.press("Control+.");
  await expect(childRows(write)).toHaveCount(0);
  await expect(write.locator(":scope > .row > .board-inside")).toHaveText("2 inside");
  await expect(write).toHaveClass(/folded/);
  await reloadOnceItemStored(page, "write", (item) => item.collapsed);
  await expect(card(page, "write").locator(":scope > .row > .board-inside")).toHaveText("2 inside");

  await card(page, "write").locator(":scope > .row > .toggle").click();
  await expect(childRows(card(page, "write"))).toHaveText(["outline", "draft"]);
  await card(page, "write").locator(":scope > .row > .text").click();
  await page.keyboard.press("ControlOrMeta+ArrowUp");
  await expect(childRows(card(page, "write"))).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+ArrowDown");
  await expect(childRows(card(page, "write"))).toHaveText(["outline", "draft"]);

  await columnTitle(page, "To do").click();
  await page.keyboard.press("Control+.");
  await expect(childRows(card(page, "write"))).toHaveText(["outline", "draft"]);
  await expect(card(page, "test")).toBeVisible();
});

test("Enter in a card's children makes a child of the card, and Tab there leaves it in the card", { tag: ["@phone", "@keys"] }, async ({ page }) => {
  await openBoard(page, twoColumns);
  const write = card(page, "write");
  await childRows(write).first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("research");
  await expect(childRows(write)).toHaveText(["outline", "research"]);
  await expectBoard(page, "To do: write, test\nDoing: draft, review\nDone: ");
  await page.keyboard.press("Tab");
  await expect(childRows(write)).toHaveText(["outline", "research"]);
  await expectBoard(page, "To do: write, test\nDoing: draft, review\nDone: ");
});

test("the item menu and ⋯ → Collapse all fold cards on a board, and a column's menu has no Collapse", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await card(page, "write").locator(":scope > .row > .bullet").click({ button: "right" });
  await page.locator("#item-menu").getByRole("button", { name: "Collapse" }).click();
  await expect(childRows(card(page, "write"))).toHaveCount(0);

  await page.locator(".board-column-head .bullet").first().click({ button: "right" });
  await expect(page.locator("#item-menu").getByRole("button", { name: /^(Collapse|Expand)$/ })).toBeHidden();
  await page.keyboard.press("Escape");

  await page.locator("#menu-button").click();
  await page.locator("#menu").getByText("Expand all", { exact: true }).click();
  await expect(childRows(card(page, "write"))).toHaveText(["outline"]);
});

test("Ctrl-Shift-. on a column folds and unfolds all its cards, and on a card everything inside it", { tag: ["@phone", "@keys"] }, async ({ page }) => {
  await openBoard(page, "Project\n  To do\n    write\n      outline\n        headings\n      draft\n    test\n      unit\n  Done");
  await columnTitle(page, "To do").click();
  await page.keyboard.press("Control+Shift+Period");
  await expect(card(page, "write")).toHaveClass(/folded/);
  await expect(card(page, "test")).toHaveClass(/folded/);
  await page.keyboard.press("Control+Shift+Period");
  await expect(childRows(card(page, "write"))).toHaveText(["outline", "draft"]);
  await expect(childRows(card(page, "test"))).toHaveText(["unit"]);

  await card(page, "write").locator(":scope > .row > .text").click();
  await page.keyboard.press("Control+Shift+Period");
  await expect(card(page, "write")).toHaveClass(/folded/);
  await expect(childRows(card(page, "test"))).toHaveText(["unit"]);

  await card(page, "write").locator(":scope > .row > .bullet").click({ button: "right" });
  await page.locator("#item-menu").getByRole("button", { name: "Expand everything inside" }).click();
  await expect(childRows(card(page, "write"))).toHaveText(["outline", "draft"]);
  await reloadOnceItemStored(page, "outline", (item) => !item.collapsed);
  await expect(childRows(card(page, "write"))).toHaveText(["outline", "draft"]);
});

test("a column shows its note under its title, editable in place", { tag: ["@phone", "@keys"] }, async ({ page }) => {
  await openBoard(page, "Project\n  Deciding | Cards waiting on an answer\n    pick a name\n  Done");
  const note = page.locator(".board-column-head .note").first();
  await expect(note).toHaveText("Cards waiting on an answer");
  await expect(page.locator(".board-column-head .note").nth(1)).toBeHidden();
  await note.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" from someone");
  await reloadOnceItemStored(page, "Deciding", (item) => item.note.endsWith("from someone"));
  await expect(page.locator(".board-column-head .note").first()).toHaveText("Cards waiting on an answer from someone");

  await columnTitle(page, "Done").click();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("shipped this week");
  await expect(page.locator(".board-column-head .note").nth(1)).toHaveText("shipped this week");
});

test("Mod-J O lists the other columns, narrows as you type and sends the card where the column files new cards", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, "Project\n  To do\n    write\n  Doing | :new: top\n    draft\n  Done");
  await card(page, "write").locator(":scope > .row > .text").click();
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("o");
  await expect(page.locator("#palette li")).toHaveText(["Doing", "Done"]);
  await page.keyboard.type("do");
  await expect(page.locator("#palette li")).toHaveText(["Doing", "Done"]);
  await page.keyboard.type("ne");
  await expect(page.locator("#palette li")).toHaveText(["Done"]);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("in");
  await page.keyboard.press("Enter");
  await expectBoard(page, "To do: \nDoing: write, draft\nDone: ");
  await page.locator("#toast button").dispatchEvent("click");
  await expectBoard(page, "To do: write\nDoing: draft\nDone: ");
});

test("Send to column is not offered in the outline or from the title", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await page.locator("#menu-button").click();
  await page.locator("#menu").getByText("Board", { exact: true }).click();
  await page.keyboard.press("Escape");
  await row(page, "write").locator(".text").click();
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("o");
  await expect(page.locator("#palette")).toBeHidden();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type(">column");
  await expect(page.locator("#palette")).not.toContainText("Send to column");
});

test("the item menu lists the other columns as Send to entries, one tap sends the card", { tag: "@phone" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  await bulletOf(card(page, "test")).click({ button: "right" });
  const menu = page.locator("#item-menu");
  await expect(menu.getByRole("button", { name: /^Send to / })).toHaveText(["Send to Doing", "Send to Done"]);
  await menu.getByRole("button", { name: "Send to Done" }).click();
  await expectBoard(page, "To do: write\nDoing: draft, review\nDone: test");
  await page.locator("#toast button").dispatchEvent("click");
  await expectBoard(page, "To do: write, test\nDoing: draft, review\nDone: ");

  await page.locator(".board-column").nth(1).locator(".board-column-head .bullet").click({ button: "right" });
  await expect(menu.getByRole("button", { name: /^Send to / })).toHaveCount(0);
});

test("a long press on a card opens a menu whose Send to entry is one tap", { tag: "@touch" }, async ({ page }) => {
  await openBoard(page, twoColumns);
  const bullet = bulletOf(card(page, "draft"));
  const box = (await bullet.boundingBox())!;
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: "touch", pointerId: 7, isPrimary: true, button: 0 };
  await bullet.dispatchEvent("pointerdown", at);
  await page.waitForTimeout(600);
  await bullet.dispatchEvent("pointerup", at);
  await page.getByRole("button", { name: "Send to Done" }).tap();
  await expectBoard(page, "To do: write, test\nDoing: review\nDone: draft");
});
