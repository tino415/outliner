import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";
import { expectOutline, freshOutline } from "./helpers";

test("the app starts offline once the service worker has installed", async ({ page, context }) => {
  await freshOutline(page, "works offline");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expectOutline(page, "works offline");
  await expect(page.locator("link[rel=manifest]")).toHaveCount(1);
});

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };

/** The build served on a port of its own, so one test can deploy a new version without touching the others. */
async function deployment() {
  let version = "";
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, "http://x").pathname;
    const file = normalize(join("dist", path.endsWith("/") ? `${path}index.html` : path));
    try {
      const body = await readFile(file);
      response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
      response.end(path === "/sw.js" ? `${body}\n// ${version}\n` : body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    deployNewVersion: () => (version = `version ${Date.now()}`),
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("a new version offers a reload when it takes over, and the reload runs it", async ({ page }) => {
  const site = await deployment();
  try {
    await page.goto(site.url);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.reload();
    await page.locator(".tree .text").first().waitFor();
    await expect(page.locator("#toast")).toBeHidden();

    site.deployNewVersion();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const toast = page.locator("#toast");
    await expect(toast).toContainText("A new version is ready", { timeout: 15000 });
    await page.waitForTimeout(5500);
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Reload" }).click();
    await page.locator(".tree .text").first().waitFor();
    await expect(toast).toBeHidden();
  } finally {
    await site.stop();
  }
});

test("the manifest describes an installable app", async ({ request }) => {
  const manifest = await (await request.get("manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});
