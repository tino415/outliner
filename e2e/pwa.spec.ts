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

test("the manifest describes an installable app", async ({ request }) => {
  const manifest = await (await request.get("manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});
