import { expect, test } from "@playwright/test";
import { caret, clickEnd, editor, expectOutline, freshOutline, outlineText, row } from "./helpers";

async function selectDown(page: import("@playwright/test").Page, from: string, steps: number) {
  await clickEnd(page, from);
  for (let i = 0; i < steps; i++) await page.keyboard.press("Shift+ArrowDown");
}

async function pasteText(page: import("@playwright/test").Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

test("keys typed into the search box do not act on a selection", async ({ page }) => {
  await freshOutline(page, "a\nb\nc");
  await selectDown(page, "b", 1);
  await page.keyboard.press("ControlOrMeta+f");
  await page.keyboard.press("Backspace");
  await expectOutline(page, "a\nb\nc");
});

test("keys typed into the palette do not act on a selection", async ({ page }) => {
  await freshOutline(page, "a\nb\nc");
  await selectDown(page, "b", 1);
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await expectOutline(page, "a\nb\nc");
});

test("undo while the page title has focus shows the undone title", async ({ page }) => {
  await freshOutline(page, "Page\n  child");
  await row(page, "Page").locator(".bullet").click();
  await page.locator("#title").click();
  await page.keyboard.press("End");
  await page.keyboard.type("XYZ");
  await page.waitForTimeout(1300);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("#title")).toHaveText("Page");
  await page.keyboard.type("!");
  await expect(page.locator("#title")).toHaveText("Page!");
});

test("pasting lines into the page title adds them at the top of the page", async ({ page }) => {
  await freshOutline(page, "P\n  c\nQ");
  await page.locator("#title").click();
  await pasteText(page, "x\ny");
  await expectOutline(page, "x\ny\nP\n  c\nQ");

  await row(page, "P").locator(".bullet").click();
  await page.locator("#title").click();
  await pasteText(page, "x2\ny2");
  await expectOutline(page, "x2\ny2\nc");
});

test("deleting a selection that starts at the first item and ends inside a subtree", async ({ page }) => {
  await freshOutline(page, "A\n  A1\n  A2\nB");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await selectDown(page, "A", 1);
  await page.keyboard.press("Backspace");
  await expectOutline(page, "B");
  expect(errors).toEqual([]);
});

test("Enter during a search keeps the new item on screen with the caret in it", async ({ page }) => {
  await freshOutline(page, "apple pie\nbanana");
  await page.locator("#search").fill("apple");
  await editor(page, "apple pie").click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Q");
  await expectOutline(page, "apple p\nQie");
});

test("completing an expanded item while completed items are hidden moves the caret past its children", async ({ page }) => {
  await freshOutline(page, "P\n  c1\n  c2\nQ");
  await page.keyboard.press("ControlOrMeta+o");
  await clickEnd(page, "P");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expectOutline(page, "Q");
  expect((await caret(page)).text).toBe("Q");
});

test("Ctrl-O toggles completed items while editing", async ({ page }) => {
  await freshOutline(page, "a\nb");
  await clickEnd(page, "a");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.press("ControlOrMeta+o");
  await expectOutline(page, "b");
});

test("shortcuts follow the typed letter, not the key position (QWERTZ)", async ({ page }) => {
  await freshOutline(page, "a");
  await clickEnd(page, "a");
  await page.keyboard.type("bc");
  await page.waitForTimeout(1300);
  await page.keyboard.type("d");
  await page.evaluate(() => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", code: "KeyY", ctrlKey: true, bubbles: true, cancelable: true }),
    );
  });
  await expectOutline(page, "abc");
});

test("Backspace on an empty item with a note keeps the note", async ({ page }) => {
  await freshOutline(page, "a\nb");
  await clickEnd(page, "b");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("important note");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expectOutline(page, "a");
  await expect(row(page, "a").locator(".note")).toHaveText("important note");
});

test("a change from another tab is not overwritten by this tab's pending save", async ({ context }) => {
  const first = await context.newPage();
  await freshOutline(first, "a");
  const second = await context.newPage();
  await second.goto("./");
  await second.locator(".tree .text").first().waitFor();

  await first.waitForTimeout(400);
  await clickEnd(first, "a");
  await first.keyboard.type("1");
  await second.evaluate(() => {
    const key = "outliner-lab:doc:v1";
    const doc = JSON.parse(localStorage.getItem(key)!);
    doc.items.i0.text = "from the other tab";
    localStorage.setItem(key, JSON.stringify(doc));
  });
  await first.waitForTimeout(600);

  const stored = await first.evaluate(() => JSON.parse(localStorage.getItem("outliner-lab:doc:v1")!).items.i0.text);
  expect(stored).toBe("from the other tab");
  expect(await outlineText(first)).toBe(stored);
});

test("a malformed address still opens the outline", async ({ page }) => {
  await freshOutline(page, "a");
  await page.goto("./#/%");
  await page.reload();
  await expectOutline(page, "a");
});

test("deleting the first item on a page moves the caret to the next one", async ({ page }) => {
  await freshOutline(page, "a\nb");
  await clickEnd(page, "a");
  await page.keyboard.press("ControlOrMeta+Shift+Backspace");
  await expectOutline(page, "b");
  expect((await caret(page)).text).toBe("b");
});

test("Enter while items are selected leaves the selection", async ({ page }) => {
  await freshOutline(page, "a\nb\nc");
  await selectDown(page, "a", 1);
  await page.keyboard.press("Enter");
  await expect(page.locator(".item.selected")).toHaveCount(0);
});

test("undo after Ctrl-B shows the text without the markers", async ({ page }) => {
  await freshOutline(page, "alpha\nbeta");
  await clickEnd(page, "alpha");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("ControlOrMeta+z");
  await expectOutline(page, "alpha\nbeta");
  await page.keyboard.press("End");
  await page.keyboard.type("X");
  await expectOutline(page, "alphaX\nbeta");
});

for (const surface of ["help", "menu", "item-menu"] as const) {
  test(`Escape closes the ${surface}`, async ({ page }) => {
    await freshOutline(page, "a");
    if (surface === "help") await page.keyboard.press("?");
    if (surface === "menu") await page.locator("#menu-button").click();
    if (surface === "item-menu") await row(page, "a").locator(".bullet").click({ button: "right" });
    const opened = page.locator({ help: "#help", menu: "#menu", "item-menu": "#item-menu" }[surface]);
    await expect(opened).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(opened).toBeHidden();
  });
}

test("folding is unavailable during a search and the outline is unchanged after it", async ({ page }) => {
  await freshOutline(page, "parent apple\n  child\nother");
  await page.locator("#search").fill("apple");
  await expect(row(page, "parent apple").locator(".toggle")).toBeHidden();
  await editor(page, "parent apple").click();
  await page.keyboard.press("ControlOrMeta+ArrowUp");
  await page.keyboard.press("Escape");
  await page.locator("#search").fill("");
  await expectOutline(page, "parent apple\n  child\nother");
});

test("an item edited during a search stays in the results", async ({ page }) => {
  await freshOutline(page, "apple one\napple two\nbanana");
  await page.locator("#search").fill("apple");
  await editor(page, "apple one").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("xyz");
  await clickEnd(page, "apple two");
  await page.keyboard.press("Enter");
  await page.keyboard.type("new");
  await expectOutline(page, "xyz\napple two\nnew");
});

test("a block of roots from different parents does not move apart", async ({ page }) => {
  await freshOutline(page, "a\n  a1\n  a2\nb\nc");
  await clickEnd(page, "a2");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Alt+Shift+ArrowUp");
  await expectOutline(page, "a\n  a1\n  a2\nb\nc");
});

test("Shift-click extends an existing selection", async ({ page }) => {
  await freshOutline(page, "a\nb\nc\nd");
  await clickEnd(page, "a");
  await page.keyboard.press("Shift+ArrowDown");
  await editor(page, "d").click({ modifiers: ["Shift"] });
  await expect(page.locator(".item.selected")).toHaveCount(4);
});

test("copying a selection without the clipboard API keeps the selection", async ({ page }) => {
  await freshOutline(page, "a\nb\nc");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: undefined }));
  await clickEnd(page, "a");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.locator(".item.selected")).toHaveCount(2);
  await page.keyboard.press("Tab");
  await expectOutline(page, "a\nb\nc");
  await expect(page.locator(".item.selected")).toHaveCount(2);
});

test("the item menu takes keyboard focus when it opens", async ({ page }) => {
  await freshOutline(page, "a");
  await row(page, "a").locator(".bullet").click({ button: "right" });
  await expect(page.locator('[data-item-action="zoom"]')).toBeFocused();
});

test("undo that removes the zoomed item goes home and updates the address", async ({ page }) => {
  await freshOutline(page, "a");
  await clickEnd(page, "a");
  await page.keyboard.press("Enter");
  await page.keyboard.type("new");
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator("#title")).toHaveText("new");
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("#title")).toHaveText("Test");
  expect(new URL(page.url()).hash).toBe("#/");
});
