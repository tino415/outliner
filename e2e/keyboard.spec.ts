import { Page, expect, test } from "@playwright/test";
import { caret, clickEnd, editor, expectOutline, freshOutline, row } from "./helpers";

async function onAMac(page: Page) {
  await page.addInitScript(() => Object.defineProperty(navigator, "platform", { get: () => "MacIntel" }));
}

test.describe("Emacs keys on a Mac", { tag: "@phone" }, () => {
  test.beforeEach(async ({ page }) => onAMac(page));

  test("Ctrl-A and Ctrl-E go to the start and end of the item", async ({ page }) => {
    await freshOutline(page, "hello world\nnext");
    await clickEnd(page, "hello world");
    await page.keyboard.press("Control+a");
    await page.keyboard.type(">");
    await page.keyboard.press("Control+e");
    await page.keyboard.type("<");
    await expectOutline(page, ">hello world<\nnext");
  });

  test("Ctrl-F and Ctrl-B move a character, and past the end into the next item", async ({ page }) => {
    await freshOutline(page, "ab\ncd");
    await clickEnd(page, "ab");
    await page.keyboard.press("Control+b");
    await page.keyboard.type("1");
    await page.keyboard.press("Control+f");
    await page.keyboard.press("Control+f");
    await page.keyboard.type("2");
    expect(await caret(page)).toEqual({ text: "2cd", offset: 1 });
  });

  test("⌘F still searches and ⌘B still makes bold", async ({ page }) => {
    await freshOutline(page, "word");
    await clickEnd(page, "word");
    await page.keyboard.press("Shift+Home");
    await page.keyboard.press("Meta+b");
    await expectOutline(page, "**word**");
    await page.keyboard.press("Meta+f");
    await expect(page.locator("#search")).toBeFocused();
  });
});

test.describe("Ctrl keys elsewhere", { tag: "@phone" }, () => {
  test("Ctrl-F searches and Ctrl-E formats code, as before", async ({ page }) => {
    await freshOutline(page, "word");
    await clickEnd(page, "word");
    await page.keyboard.press("Shift+Home");
    await page.keyboard.press("Control+e");
    await expectOutline(page, "`word`");
    await page.keyboard.press("Control+f");
    await expect(page.locator("#search")).toBeFocused();
  });

  test("the shortcut list leaves out Ctrl keys that belong to something else here", async ({ page }) => {
    await freshOutline(page, "a");
    await page.keyboard.press("?");
    await expect(page.locator("#help")).toContainText("Next item");
    await expect(page.locator("#help")).not.toContainText("End of the item");
  });
});

test("Ctrl-. folds and unfolds the item", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "parent\n  child\nother");
  await clickEnd(page, "parent");
  await page.keyboard.press("Control+.");
  await expectOutline(page, "parent\nother");
  await page.keyboard.press("Control+.");
  await expectOutline(page, "parent\n  child\nother");
  expect((await caret(page)).text).toBe("parent");
});

test("Ctrl-U goes up to the parent item, from a note to its own item, and from the top to the page title", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "parent\n  child | a note");
  await row(page, "child").locator(".note").click();
  await page.keyboard.press("Control+u");
  expect((await caret(page)).text).toBe("child");
  await page.keyboard.press("Control+u");
  expect((await caret(page)).text).toBe("parent");
  await page.keyboard.press("Control+u");
  await expect(page.locator("#title")).toBeFocused();
});

test("⌥→ no longer zooms in, it moves by word on a Mac", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "projects\n  garden");
  await clickEnd(page, "projects");
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator("#title")).toHaveText("Test");
});

test.describe("Ctrl-K", { tag: "@phone" }, () => {
  test("runs a command on the item being edited and shows its shortcut", async ({ page }) => {
    await freshOutline(page, "a\nb");
    await clickEnd(page, "b");
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type(">indent");
    const option = page.locator("#palette li.active");
    await expect(option).toContainText("Indent");
    await expect(option.locator(".palette-shortcut")).toContainText("Tab");
    await page.keyboard.press("Enter");
    await expectOutline(page, "a\n  b");
    expect((await caret(page)).text).toBe("b");
  });

  test("lists menu commands after the items, so Enter still jumps", async ({ page }) => {
    await freshOutline(page, "Collapse the garden\n  x");
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("collapse");
    await expect(page.locator("#palette li").first()).toContainText("Collapse the garden");
    await expect(page.locator("#palette li").last()).toContainText("Collapse all");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expectOutline(page, "Collapse the garden");
  });

  test("Ctrl-N and Ctrl-P choose", async ({ page }) => {
    await freshOutline(page, "apple one\napple two\napple three");
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("apple");
    await page.keyboard.press("Control+n");
    await page.keyboard.press("Control+n");
    await page.keyboard.press("Control+p");
    await page.keyboard.press("Enter");
    await expect(page.locator("#title")).toHaveText("apple two");
  });
});

test("Ctrl-J C toggles columns from the palette too", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "a");
  await editor(page, "a").click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type(">columns");
  await expect(page.locator("#palette li.active .palette-shortcut")).not.toBeEmpty();
  await page.keyboard.press("Enter");
  await expect(row(page, "a")).toBeVisible();
  await expect(page.locator("#columns-head")).toBeVisible();
});

test("Alt-Shift with a letter is left to typing: the app takes none of them", { tag: "@phone" }, async ({ page }) => {
  await freshOutline(page, "item");
  await clickEnd(page, "item");
  const taken = await page.evaluate(() =>
    [..."abcdefghijklmnopqrstuvwxyz"].filter((letter) => {
      const event = new KeyboardEvent("keydown", { key: letter.toUpperCase(), code: `Key${letter.toUpperCase()}`, altKey: true, shiftKey: true, bubbles: true, cancelable: true });
      return !document.activeElement!.dispatchEvent(event);
    }),
  );
  expect(taken).toEqual([]);
});
