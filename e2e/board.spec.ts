import { Page, expect, test } from "@playwright/test";
import { freshOutline } from "./helpers";

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
  await freshOutline(page, "Project\n  To do\n    write\n    test\n  Doing\n  Done");
  await page.locator(".row").filter({ hasText: "Project" }).first().locator(".bullet").click();
  await expect(page.locator("#title")).toHaveText("Project");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("b");
  await expectBoard(page, "To do: write, test\nDoing: \nDone: ");
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
  await page.reload();
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
