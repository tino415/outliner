import { expect, test } from "@playwright/test";
import { caret, editor, expectOutline, freshOutline, row } from "./helpers";

async function virtualKey(page: import("@playwright/test").Page, inputType: string) {
  await page.evaluate((type) => {
    const event = new InputEvent("beforeinput", { inputType: type, bubbles: true, cancelable: true });
    if (document.activeElement!.dispatchEvent(event)) throw new Error(`${type} was not handled`);
  }, inputType);
}

test("the toolbar appears while editing and its buttons act on the item", async ({ page }) => {
  await freshOutline(page, "a\nb\nc");
  await expect(page.locator("#toolbar")).toBeHidden();
  await editor(page, "b").tap();
  await expect(page.locator("#toolbar")).toBeVisible();

  await page.getByRole("button", { name: "Indent" }).tap();
  await expectOutline(page, "a\n  b\nc");
  await page.getByRole("button", { name: "Outdent" }).tap();
  await page.getByRole("button", { name: "Move up" }).tap();
  await expectOutline(page, "b\na\nc");
  await page.getByRole("button", { name: "Complete" }).tap();
  await expectOutline(page, "b [x]\na\nc");
  await expect.poll(async () => (await caret(page)).text).toBe("b");

  await page.getByRole("button", { name: "Undo" }).tap();
  await expectOutline(page, "b\na\nc");
  await page.getByRole("button", { name: "Done editing" }).tap();
  await expect(page.locator("#toolbar")).toBeHidden();
});

test("the toolbar's Property button sets a property without typing a line", async ({ page }) => {
  await freshOutline(page, "Oats | :kcal: 300 kcal\nSoup");
  await editor(page, "Soup").tap();
  await page.getByRole("button", { name: "Property" }).tap();
  await page.locator("#palette li", { hasText: "kcal" }).tap();
  await page.locator("#palette li", { hasText: "300 kcal" }).tap();
  await expect(row(page, "Soup").locator(".prop-chip")).toHaveText("kcal 300 kcal");
});

test("Enter and Backspace from a virtual keyboard split and join items", async ({ page }) => {
  await freshOutline(page, "hello world");
  await editor(page, "hello world").tap();
  await page.evaluate(() => {
    const target = document.activeElement!;
    const range = document.createRange();
    range.setStart(target.firstChild!, 5);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await virtualKey(page, "insertParagraph");
  await expectOutline(page, "hello\n world");
  await virtualKey(page, "deleteContentBackward");
  await expectOutline(page, "hello world");
});

test("a long press on a bullet opens the item menu instead of zooming", async ({ page }) => {
  await freshOutline(page, "projects\n  garden\nother");
  const bullet = row(page, "projects").locator(".bullet");
  const box = (await bullet.boundingBox())!;
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: "touch", pointerId: 7, isPrimary: true, button: 0 };
  await bullet.dispatchEvent("pointerdown", at);
  await page.waitForTimeout(600);
  await bullet.dispatchEvent("pointerup", at);
  await expect(page.locator("#item-menu")).toBeVisible();
  await expect(page.locator("#title")).toHaveText("Test");
  await page.locator('[data-item-action="complete"]').tap();
  await expect(row(page, "projects").locator("xpath=..")).toHaveClass(/completed/);
});

test("the item menu stays open after a real long press ends, and its actions leave the keyboard closed", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "real touch input is sent through the Chromium DevTools protocol");
  await freshOutline(page, "projects\nother");
  const box = (await row(page, "projects").locator(".bullet").boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await page.waitForTimeout(800);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  await expect(page.locator("#item-menu")).toBeVisible();
  await page.locator('[data-item-action="delete"]').tap();
  await expectOutline(page, "other");
  await expect(page.locator("#toolbar")).toBeHidden();
});

async function swipe(page: import("@playwright/test").Page, text: string, distance: number) {
  const box = (await editor(page, text).boundingBox())!;
  const y = box.y + box.height / 2;
  const x = distance > 0 ? box.x + 30 : box.x + box.width - 10;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (distance * step) / 8, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(250);
}

test.describe("swipes on rows", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "real touch input is sent through the Chromium DevTools protocol");

  test("swiping right completes an item and swiping right again reopens it", async ({ page }) => {
    await freshOutline(page, "task\nother");
    await swipe(page, "task", 120);
    await expectOutline(page, "task [x]\nother");
    await expect(page.locator("#toolbar")).toBeHidden();
    await swipe(page, "task", 120);
    await expectOutline(page, "task\nother");
  });

  test("swiping left folds and unfolds an item with children", async ({ page }) => {
    await freshOutline(page, "parent\n  child\nleaf");
    await swipe(page, "parent", -120);
    await expectOutline(page, "parent\nleaf");
    await swipe(page, "parent", -120);
    await expectOutline(page, "parent\n  child\nleaf");
  });

  test("swiping further left on an item with children opens its menu instead of folding", async ({ page }) => {
    await freshOutline(page, "parent\n  child");
    await swipe(page, "parent", -200);
    await expect(page.locator("#item-menu")).toBeVisible();
    await expect(page.locator("#item-menu-title")).toHaveText("parent");
    await expectOutline(page, "parent\n  child");
  });

  test("swiping left on an item without children opens its menu", async ({ page }) => {
    await freshOutline(page, "leaf");
    await swipe(page, "leaf", -120);
    await expect(page.locator("#item-menu")).toBeVisible();
    await expect(page.locator("#item-menu-title")).toHaveText("leaf");
  });

  test("a tap right after a swipe is not swallowed", async ({ page }) => {
    // 60 px is past the slop but short of the threshold: long enough to start a swipe, too slow for Chrome to treat the
    // next tap as stopping a fling, which it would swallow by itself. Folding reacts to the click, unlike editing.
    await freshOutline(page, "task\nparent\n  child");
    await swipe(page, "task", 60);
    await row(page, "parent").locator(".toggle").tap();
    await expectOutline(page, "task\nparent");
  });

  test("the swipe band lies under the row being swiped, not under its children", async ({ page }) => {
    await freshOutline(page, "first\nsecond\n  child a\n  child b\nthird");
    const box = (await editor(page, "second").boundingBox())!;
    const point = { x: box.x + 30, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    for (let step = 1; step <= 4; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x + step * 10, y: point.y }] });
    }
    const band = (await page.locator(".swipe-band").boundingBox())!;
    const swiped = (await row(page, "second").boundingBox())!;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect(Math.abs(band.y - swiped.y)).toBeLessThan(2);
    expect(Math.abs(band.height - swiped.height)).toBeLessThan(2);
  });

  test("a short swipe does nothing and a tap still edits", async ({ page }) => {
    await freshOutline(page, "task");
    await swipe(page, "task", 40);
    await expectOutline(page, "task");
    await editor(page, "task").tap();
    await expect(editor(page, "task")).toBeFocused();
  });

  test("fold targets are on screen and reach left of the chevron", async ({ page }) => {
    await freshOutline(page, "top\n  parent\n    child");
    const top = (await row(page, "top").locator(".toggle").boundingBox())!;
    expect(top.x).toBeGreaterThanOrEqual(0);
    expect(top.width).toBeGreaterThanOrEqual(24);
    const nested = (await row(page, "parent").locator(".toggle").boundingBox())!;
    await page.touchscreen.tap(nested.x - 10, nested.y - 4);
    await expectOutline(page, "top\n  parent");
  });
});

test.describe("menus on a short screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 420 });
  });

  async function reachable(page: import("@playwright/test").Page, selector: string) {
    const target = page.locator(selector);
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(420);
  }

  test("the main menu scrolls to its last line", async ({ page }) => {
    await freshOutline(page, "a");
    await page.locator("#menu-button").tap();
    await reachable(page, "#build-info");
  });

  test("the item menu scrolls to its last action", async ({ page }) => {
    await freshOutline(page, "a");
    const bullet = row(page, "a").locator(".bullet");
    const box = (await bullet.boundingBox())!;
    const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: "touch", pointerId: 7, isPrimary: true, button: 0 };
    await bullet.dispatchEvent("pointerdown", at);
    await page.waitForTimeout(600);
    await bullet.dispatchEvent("pointerup", at);
    await expect(page.locator("#item-menu")).toBeVisible();
    await reachable(page, "#item-menu-title");
    await reachable(page, '[data-item-action="delete"]');
  });
});

test("tapping a bullet zooms in and the home crumb zooms out", async ({ page }) => {
  await freshOutline(page, "projects\n  garden");
  await row(page, "projects").locator(".bullet").tap();
  await expect(page.locator("#title")).toHaveText("projects");
  await page.locator(".crumb.home").tap();
  await expect(page.locator("#title")).toHaveText("Test");
});

test("capture from the menu files into the Inbox", async ({ page }) => {
  await freshOutline(page, "a");
  await page.locator("#menu-button").tap();
  await page.getByRole("button", { name: "Capture…" }).tap();
  await page.locator("#capture-text").fill("call the plumber");
  await page.getByRole("button", { name: "Capture", exact: true }).tap();
  await expectOutline(page, "a\nInbox\n  call the plumber");
});

test("a virtual keyboard's Enter in a note starts a new line", async ({ page }) => {
  await freshOutline(page, "item | first");
  await row(page, "item").locator(".note").tap();
  await page.keyboard.press("End");
  await virtualKey(page, "insertParagraph");
  await page.keyboard.type("second");
  await expect(row(page, "item").locator(".note")).toHaveText("first\nsecond");
});
