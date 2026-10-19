import { expect, test } from "@playwright/test";
import { clickEnd, expectOutline, freshOutline } from "./helpers";

const SETTINGS = `
Settings
  Shortcuts | :shortcuts: on; :duplicate: Mod+j g; :bold: Mod+Shift+e; :tag: g; :zoom-inn: Ctrl+]
task
`;

function helpRow(page: import("@playwright/test").Page, label: string) {
  return page.locator("#help-grid .help-label").filter({ hasText: label });
}

test("a shortcut set in the outline replaces the command's default keys", async ({ page }) => {
  await freshOutline(page, SETTINGS);
  await clickEnd(page, "task");
  await page.keyboard.press("ControlOrMeta+Shift+d");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("d");
  await expectOutline(page, "Settings\n  Shortcuts\ntask");
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("g");
  await expectOutline(page, "Settings\n  Shortcuts\ntask\ntask");
});

test("a set key taken from another command works for the new one only", async ({ page }) => {
  await freshOutline(page, SETTINGS);
  await clickEnd(page, "task");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("ControlOrMeta+Shift+e");
  await expectOutline(page, "Settings\n  Shortcuts\n**task**");
  await expect(page.locator(".note:visible")).toHaveCount(0);
});

test("the help shows command names, the keys set, the keys taken and the settings refused", async ({ page }) => {
  await freshOutline(page, SETTINGS);
  await page.keyboard.press("?");
  const duplicate = helpRow(page, "Duplicate item");
  await expect(duplicate.locator(".help-name")).toHaveText("duplicate");
  await expect(duplicate.locator("+ .help-keys")).toHaveText("CtrlJ G");
  await expect(helpRow(page, "Code block in the note")).toContainText("now runs bold");
  await expect(helpRow(page, "Agenda")).toContainText("now runs duplicate");
  await expect(helpRow(page, "Code block in the note").locator("+ .help-keys")).toHaveText("none");
  const refused = page.locator("#help .help-refused");
  await expect(refused).toContainText("tag: g types a character");
  await expect(refused).toContainText("zoom-inn: Ctrl+] no command has this name");
});

test("a setting typed into the outline applies once the note is left, and the prefix panel shows it", async ({ page }) => {
  await freshOutline(page, "Shortcuts | :shortcuts: on\ntask");
  await clickEnd(page, "Shortcuts");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type(":kind: Mod+j y");
  await clickEnd(page, "task");
  await page.keyboard.press("ControlOrMeta+j");
  await expect(page.locator("#prefix-keys")).toContainText("YSet the kind");
  await expect(page.locator("#prefix-keys")).not.toContainText("KSet the kind");
  await page.keyboard.press("y");
  await expect(page.locator("#palette .palette-hint")).toContainText("Shown as a badge");
});
