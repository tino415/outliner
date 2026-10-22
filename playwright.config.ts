import { defineConfig, devices } from "@playwright/test";

const touchOnly = /@touch/;
const onPhones = /@phone|@touch/;
const inOtherEngines = /@keys/;
const timed = /@performance/;

const desktopChrome = { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } };
const everyOtherProject = ["desktop", "phone", "webkit", "iphone", "firefox"];

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CHECK),
  reporter: [["list"], ["./e2e/skip-gate.ts"]],
  use: {
    baseURL: "http://127.0.0.1:5189/",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite preview --host 127.0.0.1 --port 5189 --strictPort",
    url: "http://127.0.0.1:5189/",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: desktopChrome, grepInvert: [touchOnly, timed] },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: onPhones },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, grep: inOtherEngines },
    { name: "iphone", use: { ...devices["iPhone 15"] }, grep: touchOnly },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, grep: inOtherEngines },
    { name: "performance", use: desktopChrome, grep: timed, fullyParallel: false, retries: 2, dependencies: everyOtherProject },
  ],
});
