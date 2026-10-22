import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncServer } from "../server/app";
import { Store } from "../server/store";

const token = "test-token-0123456789";
let server: Server;
let store: Store;
let base: string;
let root: string;

async function start(appDir?: string) {
  server = createSyncServer({ store, token, origins: ["*"], appDir });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => {
  store = new Store(":memory:");
  root = mkdtempSync(join(tmpdir(), "outline-app-"));
  mkdirSync(join(root, "app"));
  writeFileSync(join(root, "app", "index.html"), "<h1>outliner</h1>");
  writeFileSync(join(root, "app", "manifest.webmanifest"), "{}");
  writeFileSync(join(root, "secret.txt"), "nope");
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.close();
  rmSync(root, { recursive: true, force: true });
});

describe("sync server serving the app", () => {
  it("serves index.html at the root and files by type, without the token", async () => {
    await start(join(root, "app"));
    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(await index.text()).toBe("<h1>outliner</h1>");
    const manifest = await fetch(`${base}/manifest.webmanifest`);
    expect(manifest.headers.get("content-type")).toBe("application/manifest+json");
  });

  it("keeps sync behind the token and refuses paths outside the app", async () => {
    await start(join(root, "app"));
    expect((await fetch(`${base}/sync`, { method: "POST", body: "{}" })).status).toBe(401);
    expect((await fetch(`${base}/%2e%2e/secret.txt`)).status).toBe(401);
    expect((await fetch(`${base}/missing.js`)).status).toBe(401);
    expect((await fetch(`${base}/%E0%A4%A`)).status).toBe(401);
  });

  it("serves no app without an app directory", async () => {
    await start();
    expect((await fetch(`${base}/`)).status).toBe(401);
  });
});
