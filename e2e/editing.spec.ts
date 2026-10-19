import { expect, test } from "@playwright/test";
import { caret, clickEnd, editor, expectOutline, freshOutline, row } from "./helpers";

test.describe("keyboard editing", { tag: "@keys" }, () => {
  test("Enter creates and splits items, Tab and Shift-Tab change depth", async ({ page }) => {
    await freshOutline(page, "alpha");
    await clickEnd(page, "alpha");
    await page.keyboard.press("Enter");
    await page.keyboard.type("beta");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.type("gamma delta");
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expectOutline(page, `
      alpha
        beta
        gamma
         delta
    `);
    expect(await caret(page)).toEqual({ text: " delta", offset: 0 });

    await page.keyboard.press("Shift+Tab");
    await expectOutline(page, `
      alpha
        beta
        gamma
       delta
    `);
  });

  test("Enter on an empty last nested item outdents it", async ({ page }) => {
    await freshOutline(page, "parent\n  child");
    await clickEnd(page, "child");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("sibling of parent");
    await expectOutline(page, `
      parent
        child
      sibling of parent
    `);
  });

  test("Backspace at the start joins with the item above, Delete pulls the next up", async ({ page }) => {
    await freshOutline(page, "hello\nworld\nagain");
    await editor(page, "world").click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Backspace");
    await expectOutline(page, `
      helloworld
      again
    `);
    expect(await caret(page)).toEqual({ text: "helloworld", offset: 5 });

    await page.keyboard.press("End");
    await page.keyboard.press("Delete");
    await expectOutline(page, "helloworldagain");
  });

  test("Backspace in an empty item removes it and lands at the end of the one above", async ({ page }) => {
    await freshOutline(page, "keep");
    await clickEnd(page, "keep");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Backspace");
    await expectOutline(page, "keep");
    expect(await caret(page)).toEqual({ text: "keep", offset: 4 });
  });

  test("arrow keys walk across items", async ({ page }) => {
    await freshOutline(page, "one\n  two\nthree");
    await clickEnd(page, "one");
    await page.keyboard.press("ArrowDown");
    expect((await caret(page)).text).toBe("two");
    await page.keyboard.press("ArrowDown");
    expect((await caret(page)).text).toBe("three");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowLeft");
    expect(await caret(page)).toEqual({ text: "two", offset: 3 });
    await page.keyboard.press("ArrowRight");
    expect(await caret(page)).toEqual({ text: "three", offset: 0 });
  });

  test("Ctrl-N and Ctrl-P walk to the next and previous item, as in Emacs", async ({ page }) => {
    await freshOutline(page, "one\n  two\nthree");
    await clickEnd(page, "one");
    await page.keyboard.press("Control+n");
    expect((await caret(page)).text).toBe("two");
    await page.keyboard.press("Control+n");
    expect((await caret(page)).text).toBe("three");
    await page.keyboard.press("Control+p");
    await page.keyboard.press("Control+p");
    expect((await caret(page)).text).toBe("one");
    await expectOutline(page, "one\n  two\nthree");
  });

  test("items move with Alt-Shift-arrows and keep focus", async ({ page }) => {
    await freshOutline(page, "a\nb\nc");
    await clickEnd(page, "c");
    await page.keyboard.press("Alt+Shift+ArrowUp");
    await page.keyboard.press("Alt+Shift+ArrowUp");
    await expectOutline(page, "c\na\nb");
    await page.keyboard.press("Alt+Shift+ArrowDown");
    await expectOutline(page, "a\nc\nb");
    expect((await caret(page)).text).toBe("c");
  });

  test("Ctrl-Enter completes, and completed items can be hidden", async ({ page }) => {
    await freshOutline(page, "task\nother");
    await clickEnd(page, "task");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expectOutline(page, "task [x]\nother");
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+o");
    await expectOutline(page, "other");
    await page.keyboard.press("ControlOrMeta+o");
    await expectOutline(page, "task [x]\nother");
  });

  test("collapse and expand with Ctrl-arrows and the toggle", async ({ page }) => {
    await freshOutline(page, "parent\n  child\nnext");
    await clickEnd(page, "parent");
    await page.keyboard.press("ControlOrMeta+ArrowUp");
    await expectOutline(page, "parent\nnext");
    await page.keyboard.press("ControlOrMeta+ArrowDown");
    await expectOutline(page, "parent\n  child\nnext");
    await row(page, "parent").hover();
    await row(page, "parent").locator(".toggle").click();
    await expectOutline(page, "parent\nnext");
  });

  test("undo and redo restore structure and text", async ({ page }) => {
    await freshOutline(page, "a\nb");
    await clickEnd(page, "b");
    await page.keyboard.press("Tab");
    await page.keyboard.type("++");
    await expectOutline(page, "a\n  b++");
    await page.keyboard.press("ControlOrMeta+z");
    await expectOutline(page, "a\n  b");
    await page.keyboard.press("ControlOrMeta+z");
    await expectOutline(page, "a\nb");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await page.keyboard.press("ControlOrMeta+y");
    await expectOutline(page, "a\n  b++");
  });

  test("Ctrl-Shift-Backspace deletes an item with an undo toast", async ({ page }) => {
    await freshOutline(page, "a\nb\n  b1\nc");
    await clickEnd(page, "b");
    await page.keyboard.press("ControlOrMeta+Shift+Backspace");
    await expectOutline(page, "a\nc");
    await expect(page.locator("#toast")).toContainText("and 1 more deleted");
    await page.locator("#toast button").click();
    await expectOutline(page, "a\nb\n  b1\nc");
  });

  test("Ctrl-J D duplicates an item with its children", async ({ page }) => {
    await freshOutline(page, "a\n  a1\nb");
    await clickEnd(page, "a");
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("d");
    await expectOutline(page, "a\n  a1\na\n  a1\nb");
  });

  test("the menu deletes completed items on the page", async ({ page }) => {
    await freshOutline(page, "keep\ndone\n  inside");
    await clickEnd(page, "done");
    await page.keyboard.press("ControlOrMeta+Enter");
    await page.locator("#menu-button").click();
    await page.getByRole("button", { name: "Delete completed" }).click();
    await expectOutline(page, "keep");
    await expect(page.locator("#toast")).toContainText("Deleted 1 completed item");
  });

  test("Shift-Enter opens a note and returns to the item", async ({ page }) => {
    await freshOutline(page, "item");
    await clickEnd(page, "item");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("a note");
    await page.keyboard.press("Shift+Enter");
    expect((await caret(page)).text).toBe("item");
    await expect(row(page, "item").locator(".note")).toHaveText("a note");
  });

  test("pasting several lines creates several items", async ({ page, browserName }) => {
    test.skip(browserName === "firefox", "Firefox ignores clipboardData on a synthetic paste event");
    await freshOutline(page, "first");
    await clickEnd(page, "first");
    await page.keyboard.press("Enter");
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", "- one\n  - two\n- three");
      document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expectOutline(page, "first\none\n  two\nthree");
  });

  test("the outline survives a reload", async ({ page }) => {
    await freshOutline(page, "persist me");
    await clickEnd(page, "persist me");
    await page.keyboard.type(" please");
    await page.keyboard.press("Enter");
    await page.keyboard.type("new");
    await page.waitForTimeout(400);
    await page.reload();
    await expectOutline(page, "persist me please\nnew");
  });
});

test.describe("selecting several items", { tag: "@keys" }, () => {
  test("Shift-arrows select items; Tab, move and complete act on the block", async ({ page }) => {
    await freshOutline(page, "a\nb\nc\nd");
    await editor(page, "b").click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+ArrowDown");
    await expect(page.locator(".item.selected")).toHaveCount(2);

    await page.keyboard.press("Tab");
    await expectOutline(page, "a\n  b\n  c\nd");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Alt+Shift+ArrowUp");
    await expectOutline(page, "b\nc\na\nd");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expectOutline(page, "b [x]\nc [x]\na\nd");
    await expect(page.locator(".item.selected")).toHaveCount(2);

    await page.keyboard.press("Escape");
    await expect(page.locator(".item.selected")).toHaveCount(0);
  });

  test("Backspace deletes the selected block and undo brings it back", async ({ page }) => {
    await freshOutline(page, "a\nb\n  b1\nc");
    await clickEnd(page, "b");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Backspace");
    await expectOutline(page, "a");
    await expect(page.locator("#toast")).toContainText("Deleted 3 items");
    await page.keyboard.press("ControlOrMeta+z");
    await expectOutline(page, "a\nb\n  b1\nc");
  });

  test("Ctrl-A twice selects every item on the page", async ({ page }) => {
    await freshOutline(page, "a\n  a1\nb");
    await clickEnd(page, "b");
    await page.keyboard.press("ControlOrMeta+a");
    await expect(page.locator(".item.selected")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+a");
    await expect(page.locator(".item.selected")).toHaveCount(3);
    await page.keyboard.press("Backspace");
    await expect(page.locator(".tree .item")).toHaveCount(0);
  });

  test("the menu clears the page, and undo brings it back", async ({ page }) => {
    await freshOutline(page, "a\n  a1\nb");
    await page.locator("#menu-button").click();
    await page.getByRole("button", { name: "Clear this page" }).click();
    await expect(page.locator(".tree .item")).toHaveCount(0);
    await expect(page.locator("#add-item")).toHaveClass(/prominent/);
    await page.locator("#toast button").click();
    await expectOutline(page, "a\n  a1\nb");
  });

  test("Shift-click selects a range and copy puts it on the clipboard", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only in Playwright");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await freshOutline(page, "a\n  a1\nb\nc");
    await clickEnd(page, "a");
    await editor(page, "b").click({ modifiers: ["Shift"] });
    await expect(page.locator(".item.selected")).toHaveCount(3);
    await page.keyboard.press("ControlOrMeta+c");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("- a\n  - a1\n- b");
  });
});

test.describe("zoom and search", { tag: "@keys" }, () => {
  test("clicking a bullet zooms in, breadcrumbs and Back zoom out", async ({ page }) => {
    await freshOutline(page, "projects\n  garden\n    tomatoes\nother");
    await row(page, "garden").locator(".bullet").click();
    await expect(page.locator("#title")).toHaveText("garden");
    await expectOutline(page, "tomatoes");
    await expect(page.locator("#crumbs .crumb")).toHaveCount(2);
    await page.locator("#crumbs .crumb", { hasText: "projects" }).click();
    await expect(page.locator("#title")).toHaveText("projects");
    await page.goBack();
    await expect(page.locator("#title")).toHaveText("garden");
  });

  test("keyboard zoom keeps the caret on the item", async ({ page }) => {
    await freshOutline(page, "projects\n  garden");
    await clickEnd(page, "projects");
    await page.keyboard.press("Control+]");
    await expect(page.locator("#title")).toHaveText("projects");
    expect((await caret(page)).text).toBe("projects");
    await page.keyboard.press("ArrowDown");
    expect((await caret(page)).text).toBe("garden");
    await page.keyboard.press("Control+[");
    await expect(page.locator("#title")).toHaveText("Test");
    expect((await caret(page)).text).toBe("projects");
  });

  test("Enter in the page title adds a first child", async ({ page }) => {
    await freshOutline(page, "existing");
    await page.locator("#title").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("on top");
    await expectOutline(page, "on top\nexisting");
  });

  test("search filters to matches with their ancestors, Escape clears", async ({ page }) => {
    await freshOutline(page, "projects\n  garden plan\n  kitchen\nshopping\n  milk");
    await page.keyboard.press("/");
    await expect(page.locator("#search")).toBeFocused();
    await page.keyboard.type("plan");
    await expectOutline(page, "projects\n  garden plan");
    await expect(page.locator("#search-summary")).toContainText("1 match");
    await page.keyboard.press("Escape");
    await expectOutline(page, "projects\n  garden plan\n  kitchen\nshopping\n  milk");
  });

  test("Ctrl-K jumps to any item by name", async ({ page }) => {
    await freshOutline(page, "projects\n  garden\n    tomatoes\nother");
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.locator("#palette")).toBeVisible();
    await page.keyboard.type("tom");
    await expect(page.locator(".palette-results li.active .palette-path")).toHaveText("projects / garden");
    await page.keyboard.press("Enter");
    await expect(page.locator("#title")).toHaveText("tomatoes");
  });

  test("Ctrl-K finds commands among items without >, and Tab narrows it to items or commands", async ({ page }) => {
    await freshOutline(page, "Kanban board games\nother");
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("board");
    await expect(page.locator(".palette-results li").first()).toContainText("Show this page as a board");
    await expect(page.locator(".palette-results li", { hasText: "Kanban board games" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.locator(".palette-modes .active")).toHaveText("Items");
    await expect(page.locator(".palette-results li").first()).toContainText("Kanban board games");
    await expect(page.locator(".palette-results li.palette-command")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(page.locator(".palette-modes .active")).toHaveText("Commands");
    await expect(page.locator(".palette-results li", { hasText: "Kanban board games" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+Shift+k");
    await expect(page.locator(".palette-modes .active")).toHaveText("Commands");
  });

  test("Ctrl-J then a letter runs a command, a pause shows what can follow, and Ctrl-J twice jumps to an item", async ({ page }) => {
    await freshOutline(page, "task\nother");
    await clickEnd(page, "task");
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("p");
    await expect(page.locator("#palette input")).toHaveAttribute("placeholder", "Property…");
    await page.keyboard.press("Escape");
    expect(await caret(page)).toEqual({ text: "task", offset: 4 });
    await expectOutline(page, "task\nother");

    await page.keyboard.press("ControlOrMeta+j");
    await expect(page.locator("#prefix-keys")).toContainText("Add a tag");
    await page.keyboard.press("ControlOrMeta+j");
    await expect(page.locator("#prefix-keys")).toBeHidden();
    await expect(page.locator(".palette-modes .active")).toHaveText("Items");
  });

  test("Ctrl-J M moves an item under another one", async ({ page }) => {
    await freshOutline(page, "inbox item\nprojects\n  garden");
    await clickEnd(page, "inbox item");
    await page.keyboard.press("ControlOrMeta+j");
    await page.keyboard.press("m");
    await page.keyboard.type("garden");
    await page.keyboard.press("Enter");
    await expectOutline(page, "projects\n  garden\n    inbox item");
    await expect(page.locator("#toast")).toContainText("Moved to “garden”");
    await page.keyboard.press("ControlOrMeta+z");
    await expectOutline(page, "inbox item\nprojects\n  garden");
  });

  test("clicking a tag searches for it", async ({ page }) => {
    await freshOutline(page, "one #red\ntwo #blue\nthree #red");
    await row(page, "two #blue").locator(".tag").click();
    await expect(page.locator("#search")).toHaveValue("#blue");
    await expectOutline(page, "two #blue");
  });
});

test.describe("appearance", { tag: "@keys" }, () => {
  test("theme and text size are chosen in the menu and survive a reload", async ({ page }) => {
    await freshOutline(page, "a");
    const size = () => editor(page, "a").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    const normal = await size();
    await page.locator("#menu-button").click();
    await page.locator('[data-pref="textSize"] [data-value="large"]').click();
    await page.locator('[data-pref="theme"] [data-value="dark"]').click();
    expect(await size()).toBeGreaterThan(normal);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-size", "large");
    expect(await size()).toBeGreaterThan(normal);
  });
});

test.describe("item menu", { tag: "@keys" }, () => {
  test("right-clicking a bullet offers actions on that item", async ({ page }) => {
    await freshOutline(page, "a\nb\n  b1\nc");
    await row(page, "b").locator(".bullet").click({ button: "right" });
    await expect(page.locator("#item-menu")).toBeVisible();
    await expect(page.locator("#item-menu-title")).toHaveText("b");
    await page.locator('[data-item-action="duplicate"]').click();
    await expectOutline(page, "a\nb\n  b1\nb\n  b1\nc");
    await row(page, "c").locator(".bullet").click({ button: "right" });
    await page.locator('[data-item-action="delete"]').click();
    await expectOutline(page, "a\nb\n  b1\nb\n  b1");
  });
});

test.describe("drag and drop", { tag: "@keys" }, () => {
  test("dragging a bullet below another item moves it there", async ({ page }) => {
    await freshOutline(page, "a\nb\nc");
    const bullet = row(page, "a").locator(".bullet");
    const target = await row(page, "c").boundingBox();
    const start = await bullet.boundingBox();
    await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
    await page.mouse.down();
    await page.mouse.move(start!.x + 10, target!.y + target!.height - 3, { steps: 8 });
    await page.mouse.up();
    await expectOutline(page, "b\nc\na");
  });
});

test("pasting an image attaches it to the item's note and shows it, without sync too", { tag: "@keys" }, async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "only Chromium takes files from a synthetic paste event");
  await freshOutline(page, "glitch");
  await editor(page, "glitch").click();
  await page.evaluate(async () => {
    const pixel = await (await fetch("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")).blob();
    const data = new DataTransfer();
    data.items.add(new File([pixel], "shot.png", { type: "image/png" }));
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(row(page, "glitch").locator(".note")).toHaveText(/^!\[shot\.png\]\(att:[0-9a-f]{64}\)$/);
  await page.keyboard.press("Escape");
  await expect(row(page, "glitch").locator(".att-image")).toHaveJSProperty("naturalWidth", 1);
  await page.reload();
  await expect(row(page, "glitch").locator(".att-image")).toHaveJSProperty("naturalWidth", 1);
});

test.describe("order of new and completed items", { tag: "@keys" }, () => {
  test("a page with :completed: last shows its completed items after the open ones", async ({ page }) => {
    await freshOutline(page, "Tasks | :completed: last\n  done\n  open");
    await editor(page, "done").click();
    await page.keyboard.press("ControlOrMeta+Enter");
    await expectOutline(page, "Tasks\n  open\n  done [x]");
    await editor(page, "done").click();
    await page.keyboard.press("ControlOrMeta+Enter");
    await expectOutline(page, "Tasks\n  done\n  open");
  });

  test("Alt-Shift-Enter adds a first child and goes there", async ({ page }) => {
    await freshOutline(page, "parent\n  child");
    await clickEnd(page, "parent");
    await page.keyboard.press("Alt+Shift+Enter");
    await page.keyboard.type("first");
    await expectOutline(page, "parent\n  first\n  child");
  });

  test("the add button files at the top of a page with :new: top", async ({ page }) => {
    await freshOutline(page, "Inbox | :new: top\n  older");
    await editor(page, "Inbox").click();
    await page.keyboard.press("Control+]");
    await page.locator("#add-item").click();
    await page.keyboard.type("newest");
    await expectOutline(page, "newest\nolder");
  });
});
