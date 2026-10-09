import { expect, test } from "@playwright/test";
import { caret, clickEnd, editor, expectOutline, freshOutline, outlineText, row } from "./helpers";
import { startSyncServer } from "./sync-server";

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

test("a column cell can be edited again after Escape or an unchanged Enter", async ({ page }) => {
  await freshOutline(page, "Plan | :columns: effort\n  task | :effort: 1h");
  await row(page, "Plan").locator(".bullet").click();
  const cell = row(page, "task").locator('.cell[data-key="effort"]');
  await cell.click();
  await page.keyboard.type("5h");
  await page.keyboard.press("Escape");
  await expect(cell).toHaveText("1h");
  await cell.click();
  await page.keyboard.press("Enter");
  await expect(cell).toHaveText("1h");
  await cell.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("7h");
  await page.keyboard.press("Enter");
  await expect(cell).toHaveText("7h");
});

test("clicking a note's text while a property line is hidden types where clicked", async ({ page }) => {
  await freshOutline(page, "Plan | :columns: effort\n  task | :effort: 1h; free text here");
  await row(page, "Plan").locator(".bullet").click();
  const note = row(page, "task").locator(".note");
  const box = (await note.boundingBox())!;
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await page.keyboard.press("End");
  await page.keyboard.type("X");
  await expect(note).toHaveText(":effort: 1h\nfree text hereX");
});

test("clicking another item after editing a cell leaves the caret in that item", async ({ page }) => {
  await freshOutline(page, "Plan | :columns: effort\n  Parent\n    Child | :effort: 1h");
  await row(page, "Plan").locator(".bullet").click();
  await row(page, "Child").locator('.cell[data-key="effort"]').click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("2h");
  await editor(page, "Parent").click();
  await expect(row(page, "Parent").locator('.cell[data-key="effort"]')).toHaveText("2h");
  await expect(editor(page, "Parent")).toBeFocused();
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
  await page.keyboard.press("Control+]");
  await expect(page.locator("#title")).toHaveText("new");
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("#title")).toHaveText("Test");
  expect(new URL(page.url()).hash).toBe("#/");
});

test("Enter in a note starts a new line", async ({ page }) => {
  await freshOutline(page, "item | first");
  await row(page, "item").locator(".note").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");
  await expect(row(page, "item").locator(".note")).toHaveText("first\nsecond");
  await expectOutline(page, "item");
});

test("the menu does not say the outline is stored only in this browser while it syncs", async ({ page }) => {
  const server = await startSyncServer();
  try {
    await freshOutline(page, "a");
    await page.locator("#menu-button").click();
    await expect(page.locator("#build-info")).toContainText("Stored only in this browser");
    await page.getByRole("button", { name: "Sync…" }).click();
    await page.locator("#sync-server").fill(server.url);
    await page.locator("#sync-token").fill(server.token);
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.locator("#sync-dialog")).toBeHidden();
    await page.locator("#menu-button").click();
    await expect(page.locator("#build-info")).not.toContainText("Stored only in this browser");
    await expect(page.locator("#build-info")).toContainText(`Synced with ${server.url}`);
  } finally {
    await server.stop();
  }
});

test("inside a code block [[ and : are code, not a link picker or key completion", async ({ page }) => {
  await freshOutline(page, "Garden\nsnippet | :kind: x; ```; ```");
  await row(page, "snippet").locator(".note").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("a = [[1]]");
  await page.keyboard.press("Enter");
  await page.keyboard.type(":k");
  await expect(page.locator("#palette")).toBeHidden();
  await expect(page.locator(".completion")).toBeHidden();
  await expect(row(page, "snippet").locator(".note")).toHaveText(":kind: x\n```\na = [[1]]\n:k\n```");
});

test("jumping by typing an item's first word and Enter opens the item, not a command of that name", async ({ page }) => {
  await freshOutline(page, "Delete old photos\nother");
  await clickEnd(page, "other");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("delete");
  await page.keyboard.press("Enter");
  await expect(page.locator("#title")).toHaveText("Delete old photos");
  await page.goBack();
  await expectOutline(page, "Delete old photos\nother");
});

test("completion: Enter after clicking elsewhere in the same item splits it", async ({ page }) => {
  await freshOutline(page, "a #work\nhello world");
  await clickEnd(page, "hello world");
  await page.keyboard.type(" #wo");
  await expect(page.locator(".completion")).toBeVisible();
  const box = (await editor(page, "hello world #wo").boundingBox())!;
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  await page.keyboard.press("Enter");
  await expectOutline(page, "a #work\n\nhello world #wo");
});

test("completion leaves Enter alone while an IME is composing", async ({ page }) => {
  await freshOutline(page, "a #work\nc");
  await clickEnd(page, "c");
  await page.keyboard.type(" #w");
  await expect(page.locator(".completion")).toBeVisible();
  await page.evaluate(() =>
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true })),
  );
  await expectOutline(page, "a #work\nc #w");
});

test("[[ then Escape keeps the caret where it was", async ({ page }) => {
  await freshOutline(page, "Garden\nsee");
  await clickEnd(page, "see");
  await page.keyboard.type(" [[");
  await expect(page.locator("#palette")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#palette")).toBeHidden();
  await page.keyboard.type("Garden]]");
  await expectOutline(page, "Garden\nsee [[Garden]]");
});

test("a command from Ctrl-K acts with the caret where it was", async ({ page }) => {
  await freshOutline(page, "abc");
  await clickEnd(page, "abc");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Escape");
  await page.keyboard.type("d");
  await expectOutline(page, "abcd");
});

test("capture asks for properties afresh each time", async ({ page }) => {
  await freshOutline(page, "Spend | :capture: Money; :ask: amount\nMoney");
  await page.keyboard.press("Alt+Shift+n");
  await page.locator("#capture-text").fill("lunch");
  await page.locator("#capture-fields input").fill("12");
  await page.keyboard.press("Enter");
  await expect(page.locator("#toast")).toContainText("Captured");
  await page.keyboard.press("Alt+Shift+n");
  await expect(page.locator("#capture-fields input")).toHaveValue("");
});

test("Ctrl-Shift-E in the middle of a note line keeps the rest of the line visible", async ({ page }) => {
  await freshOutline(page, "item | abcdef");
  await editor(page, "item").click();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Home");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+Shift+e");
  await page.keyboard.type("x");
  await page.keyboard.press("Escape");
  await expect(row(page, "item").locator(".note")).toHaveText("abc\n```\nx\n```\ndef");
});

test("Shift-Tab inside a code block takes back an indentation instead of outdenting the item", async ({ page }) => {
  await freshOutline(page, "parent\n  child | ```;   x; ```");
  await editor(page, "child").click();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Tab");
  await expectOutline(page, "parent\n  child");
  await expect(row(page, "child").locator(".note")).toHaveText("```\n x\n```");
});

test("Tab inside a code block in the zoomed page's note indents", async ({ page }) => {
  await freshOutline(page, "Page | ```; x; ```\nother");
  await editor(page, "Page").click();
  await page.keyboard.press("Control+]");
  await expect(page.locator("#title")).toHaveText("Page");
  await page.locator("#title-note").click();
  await page.evaluate(() => {
    const note = document.getElementById("title-note")!;
    const walker = document.createTreeWalker(note, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let offset = 0;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const length = node.textContent!.length;
      if (offset + length >= 5) {
        range.setStart(node, 5 - offset);
        break;
      }
      offset += length;
    }
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => document.getElementById("title-note")!.textContent)).toBe("```\nx  \n```");
});

test("on a Mac Ctrl-A and Ctrl-E in a note go to the start and end of the line", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "platform", { get: () => "MacIntel" }));
  await freshOutline(page, "item | one; two; three");
  await editor(page, "item").click();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Control+a");
  await page.keyboard.type(">");
  await page.keyboard.press("Control+e");
  await page.keyboard.type("<");
  await page.keyboard.press("Escape");
  await expect(row(page, "item").locator(".note")).toHaveText("one\n>two<\nthree");
});
