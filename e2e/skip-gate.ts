import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

const notChromium = ["iphone", "firefox", "webkit"];

export const expectedSkips: { title: string; skippedIn: string[] }[] = [
  { title: "the item menu stays open after a real long press ends, and its actions leave the keyboard closed", skippedIn: notChromium },
  { title: "swipes on rows", skippedIn: notChromium },
  { title: "a card dragged with a finger moves to another column", skippedIn: ["desktop", ...notChromium] },
  { title: "pasting several lines creates several items", skippedIn: ["firefox"] },
  { title: "Shift-click selects a range and copy puts it on the clipboard", skippedIn: notChromium },
  { title: "pasting an image attaches it to the item's note and shows it, without sync too", skippedIn: notChromium },
];

export default class SkipGate implements Reporter {
  private unexpected: string[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== "skipped" || isExpectedSkip(test)) return;
    this.unexpected.push(`[${projectOf(test)}] ${test.titlePath().slice(2).join(" › ")}`);
  }

  onEnd(result: FullResult) {
    if (!this.unexpected.length) return;
    console.error(`\n${this.unexpected.length} skipped tests are not in expectedSkips (e2e/skip-gate.ts):`);
    for (const line of this.unexpected) console.error(`  ${line}`);
    return { status: result.status === "passed" ? ("failed" as const) : result.status };
  }
}

function isExpectedSkip(test: TestCase): boolean {
  const titles = test.titlePath();
  return expectedSkips.some((skip) => titles.includes(skip.title) && skip.skippedIn.includes(projectOf(test)));
}

function projectOf(test: TestCase): string {
  return test.parent.project()?.name ?? "";
}
