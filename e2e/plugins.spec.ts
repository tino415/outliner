import { Page, expect, test } from "@playwright/test";
import { editor, expectOutline, freshOutline, row } from "./helpers";

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

const HELPER = [
  "Helper | :plugin: helper",
  "```js",
  'outline.command("Hello", (item) => { outline.add(item, "Hello world") })',
  'outline.command("Rate", async (item) => { const read = await outline.item(item); outline.toast("effort " + read.properties.effort); await outline.setProperty(item, "status", "rated") })',
  'outline.command("Broken", () => { outline.setText("nope", "x") })',
  'outline.command("Escalate", async (item) => outline.setProperty(item, "private", "mine"))',
  "```",
].join("; ");

test("plugin calls take an item or its id, read and set properties, and report errors they were not awaited for", async ({ page }) => {
  await freshOutline(page, `${HELPER}\ntask | :effort: 2h`);
  await approveAll(page);

  await runCommand(page, "task", "helper: hello");
  await expectOutline(page, "Helper\ntask\n  Hello world");

  await runCommand(page, "task", "helper: rate");
  await expect(page.locator("#toast")).toContainText("helper: effort 2h");
  await expect(row(page, "task").locator(".prop-chip")).toHaveText(["effort 2h", "status rated"]);

  await runCommand(page, "task", "helper: broken");
  await expect(page.locator("#toast")).toContainText("helper: no item nope");

  await runCommand(page, "task", "helper: escalate");
  await expect(page.locator("#toast")).toContainText("helper: a plugin cannot change the private setting");
});

async function approveAll(page: Page) {
  await page.locator("#menu-button").click();
  await page.getByRole("button", { name: "Plugins…" }).click();
  const dialog = page.locator("#plugins-dialog");
  await dialog.getByRole("button", { name: "Make it trusted" }).click();
  await dialog.getByRole("button", { name: "Approve this code" }).click();
  await expect(dialog).toContainText("Approved, running here");
  await page.keyboard.press("Escape");
}
