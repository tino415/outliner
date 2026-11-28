import { Page, expect, test } from "@playwright/test";
import { caret, editor, expectOutline, freshOutline, row, storedValue } from "./helpers";

const PLAN = "Plan\n  Pro: one\n    a\n    b\n  Pro: two\n    c\n  Con: three\n    d\n      deep\n    e";

async function openPage(page: Page, outline = PLAN) {
  await freshOutline(page, outline);
  await page.locator(".row").filter({ hasText: "Plan" }).first().locator(".bullet").click();
  await expect(page.locator("#title")).toHaveText("Plan");
}

async function showAs(page: Page, view: "Outline" | "Board" | "Tree") {
  await page.locator("#menu-button").click();
  await page.locator("#view-choice").getByRole("radio", { name: view, exact: true }).click();
  await expect(page.locator("#view-choice").getByRole("radio", { name: view, exact: true })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
}

async function openTree(page: Page, outline = PLAN) {
  await openPage(page, outline);
  await showAs(page, "Tree");
  await expect(page.locator("#tree.sideways")).toBeVisible();
}

async function viewOfPlan(page: Page): Promise<string | undefined> {
  const stored = await storedValue<{ items: Record<string, { text: string; properties?: Record<string, string> }> }>(page, "doc");
  return Object.values(stored!.items).find((item) => item.text === "Plan")?.properties?.view;
}

type Box = { x: number; y: number; width: number; height: number };

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.describe("the tree view", { tag: "@keys" }, () => {
  test("Tree in the View row lays the page out from its title to the right, no two nodes touching", async ({ page }) => {
    await openTree(page);
    await expect.poll(() => viewOfPlan(page)).toBe("tree");
    const title = (await page.locator(".page-head").boundingBox())!;
    const nodes = await page.locator("#tree .row").evaluateAll((rows) => rows.map((each) => each.getBoundingClientRect().toJSON() as Box));
    expect(nodes).toHaveLength(9);
    for (const node of nodes) expect(node.x).toBeGreaterThan(title.x + title.width);
    for (const [index, node] of nodes.entries()) for (const other of nodes.slice(index + 1)) expect(overlap(node, other)).toBe(false);
    const level = async (text: string) => (await row(page, text).boundingBox())!.x;
    expect(await level("a")).toBeGreaterThan(await level("Pro: one"));
    expect(await level("deep")).toBeGreaterThan(await level("d"));
  });

  test("Enter adds a node below, Tab puts it under the node above and Shift-Tab brings it back", async ({ page }) => {
    await openTree(page);
    await editor(page, "b").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("new");
    await expectOutline(page, "Pro: one\n  a\n  b\n  new\nPro: two\n  c\nCon: three\n  d\n    deep\n  e");
    expect((await row(page, "new").boundingBox())!.y).toBeGreaterThan((await row(page, "b").boundingBox())!.y);
    await page.keyboard.press("Tab");
    await expectOutline(page, "Pro: one\n  a\n  b\n    new\nPro: two\n  c\nCon: three\n  d\n    deep\n  e");
    expect((await row(page, "new").boundingBox())!.x).toBeGreaterThan((await row(page, "b").boundingBox())!.x);
    await page.keyboard.press("Shift+Tab");
    await expectOutline(page, "Pro: one\n  a\n  b\n  new\nPro: two\n  c\nCon: three\n  d\n    deep\n  e");
  });

  test("typing in a node keeps the caret", async ({ page }) => {
    await openTree(page);
    await editor(page, "b").click();
    await page.keyboard.press("End");
    await page.keyboard.type("ranch");
    expect(await caret(page)).toEqual({ text: "branch", offset: 6 });
  });

  test("the fold button hides a branch and shows its count, and the outline shows it folded", async ({ page }) => {
    await openTree(page);
    await row(page, "Con: three").locator(".toggle").click();
    await expect(row(page, "d")).toHaveCount(0);
    await expect(row(page, "Con: three").locator(".fold-count")).toHaveText("2");
    await showAs(page, "Outline");
    await expect(page.locator("#tree.sideways")).toHaveCount(0);
    await expectOutline(page, "Pro: one\n  a\n  b\nPro: two\n  c\nCon: three");
  });

  test("the arrows go across the tree: down from a branch's last node to the next branch's first", async ({ page }) => {
    await openTree(page);
    await editor(page, "b").click();
    await page.keyboard.press("ArrowDown");
    expect(await caret(page)).toEqual({ text: "c", offset: 0 });
    await page.keyboard.press("ArrowDown");
    expect((await caret(page)).text).toBe("d");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowLeft");
    expect((await caret(page)).text).toBe("Con: three");
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    expect(await caret(page)).toEqual({ text: "d", offset: 0 });
    await page.locator("#title").click();
    await page.keyboard.press("ArrowDown");
    expect((await caret(page)).text).toBe("Pro: one");
    await page.keyboard.press("ArrowUp");
    expect((await caret(page)).text).toBe("Plan");
  });

  test("a drag onto a node's right third makes the item its last child, and onto its upper half puts it before", async ({ page }) => {
    await openTree(page);
    const drag = async (text: string, onto: string, at: (box: Box) => { x: number; y: number }) => {
      const from = (await row(page, text).locator(".bullet").boundingBox())!;
      const to = at((await row(page, onto).boundingBox())!);
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 10 });
      await page.mouse.up();
    };
    await drag("a", "c", (box) => ({ x: box.x + box.width - 4, y: box.y + box.height / 2 }));
    await expectOutline(page, "Pro: one\n  b\nPro: two\n  c\n    a\nCon: three\n  d\n    deep\n  e");
    await drag("e", "d", (box) => ({ x: box.x + 8, y: box.y + 3 }));
    await expectOutline(page, "Pro: one\n  b\nPro: two\n  c\n    a\nCon: three\n  e\n  d\n    deep");
  });

  test("Board in the View row makes the page a board, and Outline clears the view", async ({ page }) => {
    await openTree(page);
    await showAs(page, "Board");
    await expect(page.locator("#board")).toBeVisible();
    await expect.poll(() => viewOfPlan(page)).toBe("board");
    await showAs(page, "Outline");
    await expect(page.locator("#tree")).toBeVisible();
    await expect(page.locator("#tree.sideways")).toHaveCount(0);
    await expect.poll(() => viewOfPlan(page)).toBeUndefined();
  });

  test("the palette shows the page as a tree, and Columns is not offered there", async ({ page }) => {
    await openPage(page);
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type(">as a tree");
    await page.keyboard.press("Enter");
    await expect(page.locator("#tree.sideways")).toBeVisible();
    await page.locator("#menu-button").click();
    await expect(page.locator("#menu").getByText("Columns", { exact: true })).toBeHidden();
  });
});

test("on a phone a Tree page opens with its title in the window, and the node typed in stays in view", { tag: "@phone" }, async ({ page }) => {
  await openTree(page);
  await expect(page.locator(".page-head")).toBeInViewport();
  await editor(page, "deep").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and a longer text that wraps in its node");
  await expect(editor(page, "deep and a longer text that wraps in its node")).toBeInViewport();
});

test("a finger dragged sideways across a node scrolls the page and completes nothing", { tag: "@touch" }, async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "real touch input is sent through the Chromium DevTools protocol");
  await openTree(page);
  const scroller = page.locator("#page");
  const before = await scroller.evaluate((element) => element.scrollLeft);
  const box = (await editor(page, "a").boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width - 4;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - step * 15, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before + 50);
  await expect(page.locator(".swipe-band")).toHaveCount(0);
  await expect(page.locator("#item-menu")).toBeHidden();
  await expectOutline(page, "Pro: one\n  a\n  b\nPro: two\n  c\nCon: three\n  d\n    deep\n  e");
});
