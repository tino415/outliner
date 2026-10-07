import { test } from "@playwright/test";
import { clickEnd, freshOutline, row } from "./helpers";

for (const theme of ["light", "dark"] as const) {
  test(`screenshots ${theme}`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: `screenshots/${info.project.name}-${theme}-${name}.png` });
    await page.emulateMedia({ colorScheme: theme });
    await freshOutline(page);
    await shot("home");

    await clickEnd(page, "Click a bullet to *zoom* into it. The breadcrumbs above lead back out.");
    await page.waitForTimeout(150);
    await shot("editing");
    await page.keyboard.press("Escape");

    if (info.project.name === "desktop") {
      await clickEnd(page, "Monday: write the draft");
      await page.keyboard.press("Shift+ArrowDown");
      await page.keyboard.press("Shift+ArrowDown");
      await page.waitForTimeout(100);
      await shot("selection");
      await page.keyboard.press("Escape");
    }

    await row(page, "Plan the week #planning").locator(".bullet").click();
    await page.locator(".title", { hasText: "Plan the week" }).waitFor();
    await page.waitForTimeout(300);
    await shot("zoomed");

    await row(page, "Monday: write the draft").locator(".bullet").click();
    await page.locator(".title", { hasText: "Monday" }).waitFor();
    await page.waitForTimeout(300);
    await shot("empty-page");

    await page.locator(".crumb.home").click();
    await page.locator("#search").fill("ideas");
    await page.waitForTimeout(150);
    await shot("search");
    await page.locator("#search").fill("");

    await page.locator("#menu-button").click();
    await page.waitForTimeout(200);
    await shot("menu");
    await page.keyboard.press("Escape");

    const bullet = row(page, "Reading list #ideas").locator(".bullet");
    const box = (await bullet.boundingBox())!;
    const at = { clientX: box.x + 10, clientY: box.y + 10, pointerType: "touch", pointerId: 9, isPrimary: true, button: 0 };
    await bullet.dispatchEvent("pointerdown", at);
    await page.waitForTimeout(600);
    await bullet.dispatchEvent("pointerup", at);
    await page.waitForTimeout(200);
    await shot("item-menu");
    await page.keyboard.press("Escape");

    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("re");
    await page.waitForTimeout(200);
    await shot("jump");
    await page.keyboard.press("Escape");

    if (info.project.name === "desktop") {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("?");
      await page.waitForTimeout(200);
      await shot("help");
    }
  });
}
