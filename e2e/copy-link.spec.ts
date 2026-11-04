import { Page, expect, test } from "@playwright/test";
import { expectOutline, freshOutline, row } from "./helpers";

async function recordClipboard(page: Page) {
  await page.addInitScript(() => {
    const written: string[] = [];
    (window as unknown as { written: string[] }).written = written;
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => void written.push(text) }, configurable: true });
  });
}

async function copied(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window as unknown as { written: string[] }).written.at(-1));
}

function addressWithout(page: Page): string {
  return page.url().replace(/#.*$/, "");
}

test.describe("copy link", { tag: "@keys" }, () => {
  test("the item menu copies a link to the item and says so", async ({ page }) => {
    await recordClipboard(page);
    await freshOutline(page, "a\nb\n  b1");
    await row(page, "b").locator(".bullet").click({ button: "right" });
    await page.locator('[data-item-action="copy-link"]').click();
    await expect.poll(() => copied(page)).toBe(`${addressWithout(page)}#/i1`);
    await expect(page.locator("#toast")).toContainText("Link copied");
  });

  test("Ctrl-J Y copies a link to the item being edited", async ({ page }) => {
    await recordClipboard(page);
    await freshOutline(page, "a\nb");
    await row(page, "b").locator(".text").click();
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("y");
    await expect.poll(() => copied(page)).toBe(`${addressWithout(page)}#/i1`);
    await expect(page.locator("#toast")).toContainText("Link copied");
  });

  test("Ctrl-J Y with no item being edited copies a link to the page zoomed into", async ({ page }) => {
    await recordClipboard(page);
    await freshOutline(page, "a\nb\n  b1");
    await row(page, "b").locator(".bullet").click();
    await expect(page.locator("#title")).toHaveText("b");
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("y");
    await expect.poll(() => copied(page)).toBe(`${addressWithout(page)}#/i1`);
  });

  test("the ⋯ menu copies a link to the page zoomed into, and offers none at the top", async ({ page }) => {
    await recordClipboard(page);
    await freshOutline(page, "a\nb\n  b1");
    await page.locator("#menu-button").click();
    await expect(page.getByRole("button", { name: "Copy link to this page" })).toBeHidden();
    await page.keyboard.press("Escape");
    await row(page, "b").locator(".bullet").click();
    await page.locator("#menu-button").click();
    await page.getByRole("button", { name: "Copy link to this page" }).click();
    await expect.poll(() => copied(page)).toBe(`${addressWithout(page)}#/i1`);
    await expect(page.locator("#toast")).toContainText("Link copied");
  });

  test("the palette has the command", async ({ page }) => {
    await recordClipboard(page);
    await freshOutline(page, "a\nb");
    await page.keyboard.press("ControlOrMeta+Shift+k");
    await page.locator("#palette input").fill("copy link");
    await page.keyboard.press("Enter");
    await expect.poll(() => copied(page)).toBe(`${addressWithout(page)}#/`);
  });

  test("a link-base property anywhere in the outline sets the base", async ({ page }) => {
    await recordClipboard(page);
    await freshOutline(page, "a\nsettings\n  links | :link-base: https://dev.example.test/outliner/");
    await row(page, "a").locator(".bullet").click({ button: "right" });
    await page.locator('[data-item-action="copy-link"]').click();
    await expect.poll(() => copied(page)).toBe("https://dev.example.test/outliner/#/i0");
  });

  test("a link opens the item zoomed in", async ({ page }) => {
    await freshOutline(page, "a\nb\n  b1");
    await page.evaluate(() => (location.hash = "#/i1"));
    await expect(page.locator("#title")).toHaveText("b");
    await expectOutline(page, "b1");
  });
});

test.describe("share on a phone", { tag: "@touch" }, () => {
  async function recordShares(page: Page) {
    await page.addInitScript(() => {
      const shares: unknown[] = [];
      (window as unknown as { shares: unknown[] }).shares = shares;
      Object.defineProperty(navigator, "share", { value: async (data: unknown) => void shares.push(data), configurable: true });
    });
  }

  async function openItemMenu(page: Page, text: string) {
    const bullet = row(page, text).locator(".bullet");
    const box = (await bullet.boundingBox())!;
    const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: "touch", pointerId: 7, isPrimary: true, button: 0 };
    await bullet.dispatchEvent("pointerdown", at);
    await page.waitForTimeout(600);
    await bullet.dispatchEvent("pointerup", at);
    await expect(page.locator("#item-menu")).toBeVisible();
  }

  const shares = (page: Page) => page.evaluate(() => (window as unknown as { shares: unknown[] }).shares);

  test("the item menu opens the share sheet with the link and the item's text", async ({ page }) => {
    await recordShares(page);
    await freshOutline(page, "a\n**Buy** milk");
    await openItemMenu(page, "**Buy** milk");
    await page.locator('[data-item-action="copy-link"]').tap();
    await expect.poll(() => shares(page)).toEqual([{ url: `${addressWithout(page)}#/i1`, title: "Buy milk" }]);
    await expect(page.locator("#toast")).toBeHidden();
  });

  test("a private item shares the link only", async ({ page }) => {
    await recordShares(page);
    await freshOutline(page, "a\nsecret plans | :private: mine");
    await openItemMenu(page, "secret plans");
    await page.locator('[data-item-action="copy-link"]').tap();
    await expect.poll(() => shares(page)).toEqual([{ url: `${addressWithout(page)}#/i1` }]);
  });

  test("cancelling the share sheet does nothing", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: async () => Promise.reject(new DOMException("cancelled", "AbortError")), configurable: true });
    });
    await freshOutline(page, "a\nb");
    await openItemMenu(page, "b");
    await page.locator('[data-item-action="copy-link"]').tap();
    await page.waitForTimeout(300);
    await expect(page.locator("#toast")).toBeHidden();
  });
});
