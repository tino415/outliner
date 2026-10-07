import { Browser, Page, expect, test } from "@playwright/test";
import { clickEnd, editor, expectOutline, freshOutline, outlineText } from "./helpers";
import { RunningServer, startSyncServer } from "./sync-server";
import { run } from "../cli/run";

let server: RunningServer;

test.beforeEach(async () => {
  server = await startSyncServer();
});

test.afterEach(async () => {
  await server.stop();
});

async function device(browser: Browser, outline: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await freshOutline(page, outline);
  return page;
}

async function connect(page: Page): Promise<void> {
  await page.locator("#menu-button").click();
  await page.getByRole("button", { name: "Sync…" }).click();
  await page.locator("#sync-server").fill(server.url);
  await page.locator("#sync-token").fill(server.token);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.locator("#sync-dialog")).toBeHidden();
}

/** Pulls now instead of waiting for the next poll, the way switching back to the tab does. */
async function syncNow(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

async function synced(page: Page): Promise<void> {
  await expect(page.locator("#sync-status")).toHaveAttribute("data-status", "synced");
}

test("a second device joins the first one's outline and edits flow both ways", async ({ browser }) => {
  const one = await device(browser, "a\nb");
  await connect(one);
  await expect(one.locator("#toast")).toContainText("this outline is now synced");
  await synced(one);

  const two = await device(browser, "something else");
  await connect(two);
  await expect(two.locator("#toast")).toContainText("showing the outline from the server");
  await expectOutline(two, "a\nb");

  await clickEnd(one, "b");
  await one.keyboard.press("Enter");
  await one.keyboard.type("c from one");
  await one.keyboard.press("Tab");
  await synced(one);
  await syncNow(two);
  await expectOutline(two, "a\nb\n  c from one");

  await clickEnd(two, "a");
  await two.keyboard.type(" edited on two");
  await synced(two);
  await syncNow(one);
  await expectOutline(one, "a edited on two\nb\n  c from one");
});

test("edits made offline are sent when the server is reachable again", async ({ browser }) => {
  const one = await device(browser, "a");
  await connect(one);
  await synced(one);
  await one.context().setOffline(true);
  await clickEnd(one, "a");
  await one.keyboard.type(" offline");
  await expect(one.locator("#sync-status")).toHaveAttribute("data-status", "offline");
  await one.reload();
  await expectOutline(one, "a offline");
  await one.context().setOffline(false);
  await syncNow(one);
  await synced(one);

  const two = await device(browser, "x");
  await connect(two);
  await expectOutline(two, "a offline");
});

test("the CLI and the app see each other's changes", async ({ browser }) => {
  const one = await device(browser, "Inbox");
  await connect(one);
  await synced(one);
  const env = { OUTLINE_SERVER: server.url, OUTLINE_TOKEN: server.token };

  const added = await run(["add", "from the CLI", "--under", "Inbox"], env);
  expect(added.code).toBe(0);
  await syncNow(one);
  await expectOutline(one, "Inbox\n  from the CLI");

  await editor(one, "from the CLI").click();
  await one.keyboard.press("ControlOrMeta+Enter");
  await synced(one);
  const shown = await run(["show"], env);
  expect(shown.output).toBe("- Inbox\n  - ~~from the CLI~~");
});

test("a wrong token is reported and nothing is lost", async ({ browser }) => {
  const one = await device(browser, "keep me");
  await one.locator("#menu-button").click();
  await one.getByRole("button", { name: "Sync…" }).click();
  await one.locator("#sync-server").fill(server.url);
  await one.locator("#sync-token").fill("wrong-token-wrong-token");
  await one.getByRole("button", { name: "Connect" }).click();
  await expect(one.locator("#sync-state")).toHaveText("the server refused the token");
  expect(await outlineText(one)).toBe("keep me");
});
