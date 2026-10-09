import { Page, expect, test } from "@playwright/test";
import { editor, expectOutline, freshOutline } from "./helpers";

const PLUGIN = [
  "Tools | :plugin: tools",
  "```js",
  'outline.command("Shout", async (item) => outline.setText(item.id, item.text.toUpperCase()))',
  'outline.command("Peek", async () => { try { localStorage.getItem("outliner-lab:keys:v1") } catch (error) { outline.toast("no storage here") } })',
  'outline.command("Reach", async () => outline.setText("i0", "taken over"))',
  "```",
].join("; ");

async function runCommand(page: Page, item: string, command: string) {
  await editor(page, item).click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type(`>${command}`);
  await page.keyboard.press("Enter");
}

test("a plugin runs only once a trusted device approves it, sandboxed and limited to its item", async ({ page }) => {
  await freshOutline(page, `${PLUGIN}\nhello`);
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type(">shout");
  await expect(page.locator("#palette li").first()).not.toContainText("Shout");
  await page.keyboard.press("Escape");

  await page.locator("#menu-button").click();
  await page.getByRole("button", { name: "Plugins…" }).click();
  const dialog = page.locator("#plugins-dialog");
  await expect(dialog).toContainText("Not approved");
  await dialog.getByRole("button", { name: "Make it trusted" }).click();
  await dialog.getByRole("button", { name: "Approve this code" }).click();
  await expect(dialog).toContainText("Approved, running here");
  await page.keyboard.press("Escape");

  await runCommand(page, "hello", "shout");
  await expectOutline(page, "Tools\nHELLO");

  await runCommand(page, "HELLO", "peek");
  await expect(page.locator("#toast")).toContainText("tools: no storage here");

  await runCommand(page, "HELLO", "reach");
  await expect(page.locator("#toast")).toContainText("can only reach the item it runs on");
  await expectOutline(page, "Tools\nHELLO");
});
