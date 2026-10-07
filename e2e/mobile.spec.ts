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

test("tapping a bullet zooms in and the home crumb zooms out", async ({ page }) => {
  await freshOutline(page, "projects\n  garden");
  await row(page, "projects").locator(".bullet").tap();
  await expect(page.locator("#title")).toHaveText("projects");
  await page.locator(".crumb.home").tap();
  await expect(page.locator("#title")).toHaveText("Test");
});
