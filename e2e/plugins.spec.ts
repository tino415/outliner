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
  'outline.command("Seal", async (item) => outline.setNote(item, ":private: mine\\nsecret"))',
  'outline.command("Approval", async (item) => outline.toast("approved: " + (await outline.item(item)).properties.approved))',
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

  await runCommand(page, "task", "helper: seal");
  await expect(page.locator("#toast")).toContainText("helper: a plugin cannot change the private setting");
  await expect(row(page, "task").locator(".note")).toBeHidden();

  await runCommand(page, "Helper", "helper: approval");
  await expect(page.locator("#toast")).toContainText("helper: approved: undefined");
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

const COMPLETES = [
  "Completes | :plugin: completes",
  "```js",
  'const completes = (column) => column?.properties.completes === "yes"',
  'outline.on("moved", async ({ item, from, to }) => {',
  "  if (completes(to) && !item.completed) await outline.complete(item, true)",
  "  if (completes(from) && !completes(to) && item.completed) await outline.complete(item, false)",
  "})",
  'outline.on("added", async ({ item, to }) => {',
  "  if (completes(to) && !item.completed) await outline.complete(item, true)",
  "})",
  "```",
].join("; ");

function card(page: Page, text: string) {
  return page.locator(".board-card").filter({ has: page.locator(":scope > .row > .text", { hasText: new RegExp(`^${text}$`) }) });
}

function column(page: Page, title: string) {
  return page.locator(".board-column").filter({ has: page.locator(".board-column-head .text", { hasText: title }) });
}

async function dragCard(page: Page, text: string, into: string) {
  const from = (await card(page, text).locator(".board-handle").boundingBox())!;
  const to = (await column(page, into).locator(".board-cards").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 20, to.y + 4, { steps: 10 });
  await page.mouse.up();
}

test("a plugin listening to moves completes a card dragged into a ':completes: yes' column, in the same undo step", async ({ page }) => {
  await freshOutline(page, `${COMPLETES}\nProject\n  Doing\n    write\n    test\n  Done | :completes: yes`);
  await page.locator("#menu-button").click();
  await page.getByRole("button", { name: "Plugins…" }).click();
  await expect(page.locator("#plugins-dialog")).toContainText("Acts by itself when an item is moved, added on this device");
  await page.keyboard.press("Escape");
  await approveAll(page);
  await row(page, "Project").locator(".bullet").first().click();
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("b");

  await dragCard(page, "write", "Done");
  await expect(column(page, "Done").locator(".board-card")).toHaveCount(1);
  await expect(card(page, "write")).toHaveClass(/completed/);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(column(page, "Doing").locator(".board-card")).toHaveCount(2);
  await expect(card(page, "write")).not.toHaveClass(/completed/);

  await card(page, "test").locator(".text").click();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await expect(card(page, "test")).toHaveClass(/completed/);
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await expect(column(page, "Doing").locator(".board-card")).toHaveCount(2);
  await expect(card(page, "test")).not.toHaveClass(/completed/);
});

test("a plugin listening to additions completes a card created in a ':completes: yes' column", async ({ page }) => {
  await freshOutline(page, `${COMPLETES}\nProject\n  Doing\n  Done | :completes: yes\n    shipped`);
  await approveAll(page);
  await row(page, "Project").locator(".bullet").first().click();
  await page.keyboard.press("ControlOrMeta+j");
  await page.keyboard.press("b");
  await card(page, "shipped").locator(".text").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("released");
  await expect(card(page, "released")).toHaveClass(/completed/);
});

const COUNTER = [
  "Counter | :plugin: counter",
  "```js",
  'outline.on("changed", async ({ item }) => outline.setProperty(item, "seen", String(Number(item.properties.seen || 0) + 1)))',
  "```",
].join("; ");

test("a handler's own change, undo and redo fire no event", async ({ page }) => {
  await freshOutline(page, `${COUNTER}\ntask`);
  await approveAll(page);
  await editor(page, "task").click();
  await page.keyboard.press("End");
  await page.keyboard.type("s");
  await expect(row(page, "tasks").locator(".prop-chip")).toHaveText(["seen 1"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(row(page, "task").locator(".prop-chip")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(row(page, "tasks").locator(".prop-chip")).toHaveText(["seen 1"]);
  await page.waitForTimeout(500);
  await expect(row(page, "tasks").locator(".prop-chip")).toHaveText(["seen 1"]);
});
