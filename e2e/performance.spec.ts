import { expect, test } from "@playwright/test";
import { clickEnd, freshOutline } from "./helpers";

function bigOutline(sections: number, perSection: number, perItem: number): string {
  const lines: string[] = [];
  for (let s = 0; s < sections; s++) {
    lines.push(`section ${s}`);
    for (let i = 0; i < perSection; i++) {
      lines.push(`  item ${s}.${i} with some **text** and a #tag`);
      for (let k = 0; k < perItem; k++) lines.push(`    detail ${s}.${i}.${k}`);
    }
  }
  return lines.join("\n");
}

test("structural edits render in well under a frame budget with 5,000 visible items", async ({ page }) => {
  await freshOutline(page, bigOutline(50, 20, 4));
  await expect(page.locator(".tree .text")).toHaveCount(50 * 20 * 5 + 50);

  await clickEnd(page, "item 25.10 with some **text** and a #tag");
  const timings: number[] = [];
  for (const key of ["Enter", "Tab", "Shift+Tab", "Backspace", "Alt+Shift+ArrowUp"]) {
    await page.keyboard.press(key);
    timings.push(await page.evaluate(() => performance.getEntriesByName("render").at(-1)!.duration));
  }
  console.log("ms of render per structural edit:", timings.map((ms) => Math.round(ms)).join(", "));
  for (const ms of timings) expect(ms).toBeLessThan(50);
});
