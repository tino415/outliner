import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"]],
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
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } }, testIgnore: /mobile/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /mobile|screenshots|columns|board/ },
    ...(process.env.WEBKIT ? [{ name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /editing/ }] : []),
    { name: "iphone", use: { ...devices["iPhone 15"] }, testMatch: /mobile/ },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /editing/ },
  ],
});
