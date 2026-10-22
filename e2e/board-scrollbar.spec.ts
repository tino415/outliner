import { expect, test } from "@playwright/test";
import { freshOutline } from "./helpers";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--disable-features=OverlayScrollbar"] } });

test("a tall wide board scrolls sideways in the board alone, beside a classic vertical scrollbar", async ({ page }) => {
  const cards = Array.from({ length: 30 }, (_, n) => `    card ${n}`).join("\n");
  await freshOutline(page, `Project\n  To do\n${cards}\n  Doing\n  Done`);
  await page.locator(".row").filter({ hasText: "Project" }).first().locator(".bullet").click();
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("b");
  for (const name of ["One", "Two", "Three", "Four", "Five"]) {
    await page.getByRole("button", { name: "+ Column" }).click();
    await page.keyboard.type(name);
  }
  expect(await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth)).toBeGreaterThan(0);
  const scroll = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>("#board")!;
    board.scrollLeft = 0;
    const before = board.scrollLeft;
    board.scrollLeft = 200;
    return { boardOverflows: board.scrollWidth > board.clientWidth, boardMoved: board.scrollLeft > before, pageScrolls: false };
  });
  await page.locator("#title").hover();
  await page.mouse.wheel(300, 0);
  await page.waitForTimeout(300);
  scroll.pageScrolls = await page.evaluate(() => document.scrollingElement!.scrollLeft > 0);
  expect(scroll).toEqual({ boardOverflows: true, boardMoved: true, pageScrolls: false });
});
