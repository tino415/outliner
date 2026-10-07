import { test } from "@playwright/test";
import { row } from "./helpers";

for (const theme of ["light", "dark"] as const) {
  test(`screenshot ${theme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("./");
    await page.locator(".tree .text").first().waitFor();
    await page.screenshot({ path: `screenshots/${info.project.name}-${theme}-home.png` });

    await row(page, "Plan the week").locator(".bullet").click();
    await page.locator(".title", { hasText: "Plan the week" }).waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/${info.project.name}-${theme}-zoomed.png` });
  });
}
