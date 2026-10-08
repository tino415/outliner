import { expect, test } from "@playwright/test";
import { clickEnd, freshOutline, row } from "./helpers";

test("Ctrl-Shift-E opens a code block in the note; Tab indents and Enter keeps the indentation inside it", async ({ page }) => {
  await freshOutline(page, "snippet\nnext");
  await clickEnd(page, "snippet");
  await page.keyboard.press("ControlOrMeta+Shift+e");
  await page.keyboard.type("if (a) {");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("go();");
  await page.keyboard.press("Enter");
  await page.keyboard.type("x");
  const note = row(page, "snippet").locator(".note");
  await expect(note).toHaveText("```\nif (a) {\n  go();\n  x\n```");
  await page.keyboard.press("Escape");
  await expect(note.locator(".code-block code")).toHaveText("if (a) {\n  go();\n  x");
  await expect(note.locator(".code-block code")).toHaveCSS("white-space", "pre");
});

test("a code block shows its code without fences or formatting, and in full", async ({ page }) => {
  await freshOutline(page, "s | ```; *not italic* #nottag; 1; 2; 3; 4; ```");
  const code = row(page, "s").locator(".note .code-block code");
  await expect(code).toHaveText("*not italic* #nottag\n1\n2\n3\n4");
  await expect(row(page, "s").locator(".note .md").first()).toBeHidden();
  await expect(row(page, "s").locator(".note .tag")).toHaveCount(0);
  const box = await code.boundingBox();
  expect(box!.height).toBeGreaterThan(80);
});
