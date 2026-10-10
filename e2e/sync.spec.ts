import { Browser, Page, expect, test } from "@playwright/test";
import { clickEnd, editor, expectOutline, freshOutline, outlineText, row } from "./helpers";
import { RunningServer, startSyncServer } from "./sync-server";
import { run } from "../cli/run";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("a property set from the CLI shows as a chip, and one set in the app reaches the CLI", async ({ browser }) => {
  const one = await device(browser, "Soup");
  await connect(one);
  await synced(one);
  const env = { OUTLINE_SERVER: server.url, OUTLINE_TOKEN: server.token };
  expect((await run(["set", "Soup", "kcal", "250 kcal"], env)).code).toBe(0);
  await syncNow(one);
  await expect(row(one, "Soup").locator(".prop-chip")).toHaveText("kcal 250 kcal");
  await clickEnd(one, "Soup");
  await one.keyboard.press("ControlOrMeta+;");
  await one.keyboard.type("effort");
  await one.keyboard.press("Enter");
  await one.keyboard.type("15m");
  await one.keyboard.press("Enter");
  await expect(row(one, "Soup").locator(".prop-chip")).toHaveText(["effort 15m", "kcal 250 kcal"]);
  await synced(one);
  const shown = JSON.parse((await run(["show", "--json"], env)).output);
  expect(shown.children[0].properties).toEqual({ kcal: "250 kcal", effort: "15m" });
});

test("note lines left by an older build become properties only after the server's newer values arrived", async ({ browser }) => {
  const one = await device(browser, "Soup");
  await connect(one);
  await synced(one);
  const two = await device(browser, "x");
  await connect(two);
  await synced(two);
  await expect.poll(() => two.evaluate(() => localStorage.getItem("outliner-lab:doc:v1"))).toContain("Soup");
  await two.context().setOffline(true);
  await two.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem("outliner-lab:doc:v1")!);
    const soup = Object.values<{ id: string; text: string; note: string }>(doc.items).find((item) => item.text === "Soup")!;
    soup.note = ":effort: 3\nfoo";
    localStorage.setItem("outliner-lab:doc:v1", JSON.stringify(doc));
    const sync = JSON.parse(localStorage.getItem("outliner-lab:sync:v1")!);
    sync.replica[soup.id].note = { value: soup.note, clock: sync.replica[soup.id].text.clock };
    localStorage.setItem("outliner-lab:sync:v1", JSON.stringify(sync));
  });
  const env = { OUTLINE_SERVER: server.url, OUTLINE_TOKEN: server.token };
  expect((await run(["note", "Soup", "rewritten on the Mac"], env)).code).toBe(0);
  expect((await run(["set", "Soup", "effort", "5"], env)).code).toBe(0);
  await two.reload();
  await two.context().setOffline(false);
  await syncNow(two);
  await synced(two);
  await syncNow(two);
  await synced(two);
  const soup = JSON.parse((await run(["show", "--json"], env)).output).children[0];
  expect(soup).toMatchObject({ note: "rewritten on the Mac", properties: { effort: "5" } });
});

test("a property cannot be set on an item sealed with a key this device lacks", async ({ browser }) => {
  const one = await device(browser, "Journal\nShopping");
  await connect(one);
  await synced(one);
  await editor(one, "Journal").click();
  await one.keyboard.press("ControlOrMeta+j");
  await one.keyboard.press("x");
  await one.keyboard.type("personal");
  await one.keyboard.press("Enter");
  await synced(one);
  const two = await device(browser, "x");
  await connect(two);
  await expect(row(two, "Journal").locator(".sealed")).toBeAttached();
  await clickEnd(two, "Journal");
  await two.keyboard.press("ControlOrMeta+;");
  await expect(two.locator("#toast")).toContainText("key personal");
  await expect(two.locator("#palette")).toBeHidden();
});

test("a server whose items were all deleted takes this device's outline instead of an empty one", async ({ browser }) => {
  const env = { OUTLINE_SERVER: server.url, OUTLINE_TOKEN: server.token };
  const id = (await run(["add", "test item"], env)).output;
  await run(["rm", id], env);
  const one = await device(browser, "my notes");
  await connect(one);
  await expect(one.locator("#toast")).toContainText("this outline is now synced");
  await expectOutline(one, "my notes");
});

test("a device that joined keeps the synced outline after turning sync off and reloading", async ({ browser }) => {
  const one = await device(browser, "a\nb");
  await connect(one);
  await synced(one);
  const two = await device(browser, "x");
  await connect(two);
  await clickEnd(one, "a");
  await one.keyboard.type(" remote");
  await synced(one);
  await syncNow(two);
  await expectOutline(two, "a remote\nb");
  await two.locator("#sync-status").click();
  await two.getByRole("button", { name: "Turn sync off" }).click();
  await two.reload();
  await expectOutline(two, "a remote\nb");
});

test("two tabs of one browser offline keep both tabs' edits", async ({ browser }) => {
  const tabA = await device(browser, "a\nb");
  await connect(tabA);
  await synced(tabA);
  const tabB = await tabA.context().newPage();
  await tabB.goto("./");
  await expectOutline(tabB, "a\nb");
  await tabA.context().setOffline(true);
  await clickEnd(tabA, "a");
  await tabA.keyboard.type(" fromA");
  await tabA.waitForTimeout(800);
  await clickEnd(tabB, "b");
  await tabB.keyboard.type(" fromB");
  await tabB.waitForTimeout(800);
  await tabA.reload();
  await expectOutline(tabA, "a fromA\nb fromB");
  await tabA.context().setOffline(false);
  await syncNow(tabA);
  await syncNow(tabB);
  const other = await device(browser, "x");
  await connect(other);
  await expectOutline(other, "a fromA\nb fromB");
});

test("joining a server keeps this device's outline within reach", async ({ browser }) => {
  const one = await device(browser, "server item");
  await connect(one);
  await synced(one);
  const two = await device(browser, "my own notes");
  await connect(two);
  await expectOutline(two, "server item");
  await two.locator("#toast").getByRole("button", { name: "Add mine back" }).click();
  await expect(two.locator(".text", { hasText: "my own notes" })).toBeVisible();
  await synced(two);
  await syncNow(one);
  await expect(one.locator(".text", { hasText: "my own notes" })).toBeVisible();
});

test("a note too long to sync is reported and does not hold back other changes", async ({ browser }) => {
  const one = await device(browser, "a\nb");
  await connect(one);
  await synced(one);
  const two = await device(browser, "x");
  await connect(two);
  await one.evaluate(() => {
    const note = document.querySelector<HTMLElement>(".note")!;
    note.hidden = false;
    note.focus();
    document.execCommand("insertText", false, "x".repeat(100_001));
  });
  await clickEnd(one, "b");
  await one.keyboard.type(" still syncs");
  await expect(one.locator("#sync-status")).toHaveAttribute("data-status", "rejected");
  await syncNow(two);
  await expectOutline(two, "a\nb still syncs");
});

test("a file attached on one device shows on another and reaches the CLI", async ({ browser }) => {
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const one = await device(browser, "glitch report");
  await connect(one);
  await synced(one);
  await editor(one, "glitch report").click();
  const chooser = one.waitForEvent("filechooser");
  await one.keyboard.press("ControlOrMeta+j");
  await one.keyboard.press("a");
  await (await chooser).setFiles({ name: "glitch.png", mimeType: "image/png", buffer: pixel });
  const preview = one.locator(".att-image");
  await expect(preview).toHaveAttribute("src", /^blob:/);
  const note = await row(one, "glitch report").locator(".note").textContent();
  const hash = /att:([0-9a-f]{64})/.exec(note ?? "")![1];
  expect(note).toBe(`![glitch.png](att:${hash})`);
  await synced(one);

  const two = await device(browser, "x");
  await connect(two);
  await expect(two.locator(".att-image")).toHaveJSProperty("naturalWidth", 1);

  const env = { OUTLINE_SERVER: server.url, OUTLINE_TOKEN: server.token };
  const saved = join(mkdtempSync(join(tmpdir(), "outline-e2e-")), "copy.png");
  expect((await run(["file", hash, saved], env)).code).toBe(0);
  expect(readFileSync(saved)).toEqual(pixel);
});

test("a private item reaches the server sealed and opens only where its key is", async ({ browser }) => {
  const one = await device(browser, "Journal\n  secret one\nShopping");
  await connect(one);
  await synced(one);
  await editor(one, "Journal").click();
  await one.keyboard.press("ControlOrMeta+j");
  await one.keyboard.press("x");
  await one.keyboard.type("personal");
  await expect(one.locator("#palette li.active")).toHaveText("New key: personal");
  await one.keyboard.press("Enter");
  await synced(one);

  const everything = await (await fetch(`${server.url}/sync`, { method: "POST", headers: { Authorization: `Bearer ${server.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ since: 0, changes: [] }) })).text();
  expect(everything).not.toContain("secret one");
  expect(everything).toContain("🔒private:1:personal:");
  const env = { OUTLINE_SERVER: server.url, OUTLINE_TOKEN: server.token };
  expect((await run(["show"], env)).output).toBe("- Journal\n  🔒 private, sealed with the key personal\n- Shopping");

  const two = await device(browser, "x");
  await connect(two);
  await expectOutline(two, "Journal\nShopping");
  await expect(row(two, "Journal").locator(".sealed")).toBeAttached();

  await one.locator("#menu-button").click();
  await one.getByRole("button", { name: "Private keys…" }).click();
  const key = await one.locator("#key-list input").inputValue();
  await two.locator("#menu-button").click();
  await two.getByRole("button", { name: "Private keys…" }).click();
  await two.locator("#key-add-text").fill(key);
  await two.getByRole("button", { name: "Add", exact: true }).click();
  await two.keyboard.press("Escape");
  await expectOutline(two, "Journal\n  secret one\nShopping");

  await clickEnd(two, "secret one");
  await two.keyboard.type(", edited on two");
  await synced(two);
  await one.keyboard.press("Escape");
  await syncNow(one);
  await expectOutline(one, "Journal\n  secret one, edited on two\nShopping");
  expect((await run(["export", "--json"], env)).output).not.toContain("edited on two");
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

test("properties lifted once back online leave the note being typed in alone", async ({ browser }) => {
  const one = await device(browser, "Soup");
  await connect(one);
  await synced(one);
  await one.context().setOffline(true);
  await one.reload();
  await clickEnd(one, "Soup");
  await one.keyboard.press("Shift+Enter");
  await one.keyboard.type(":effort: 1");
  await one.context().setOffline(false);
  await syncNow(one);
  await synced(one);
  await expect(row(one, "Soup").locator(".note")).toHaveText(":effort: 1");
});

test("a change the server refuses for its key, queued by an older build, is dropped so sync goes on", async ({ browser }) => {
  const one = await device(browser, "Soup");
  await connect(one);
  await synced(one);
  await one.evaluate(() => {
    const sync = JSON.parse(localStorage.getItem("outliner-lab:sync:v1")!);
    const id = Object.keys(sync.replica).find((each) => sync.replica[each].text?.value === "Soup")!;
    sync.pending.push({ item: id, field: `prop:${"a".repeat(65)}`, value: "x", clock: sync.replica[id].text.clock });
    localStorage.setItem("outliner-lab:sync:v1", JSON.stringify(sync));
  });
  await one.reload();
  await syncNow(one);
  await synced(one);
});
