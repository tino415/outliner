import { describe, expect, it } from "vitest";
import { ChildProcess, execFileSync, spawn } from "node:child_process";
import { AddressInfo, connect } from "node:net";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncServer } from "../server/app";
import { Store } from "../server/store";
import { run } from "../cli/run";

describe("the node bundles", () => {
  execFileSync("npm", ["run", "build:node"], { stdio: "ignore" });

  it("start the sync server from server.mjs alone", async () => {
    const output = await runAlone("server.mjs", [], {
      OUTLINE_TOKEN: "bundle-test-token-0123456789",
      OUTLINE_DB: ":memory:",
      HOST: "127.0.0.1",
      PORT: "0",
    });
    expect(output).toMatch(/outline sync server on 127\.0\.0\.1:[1-9]\d*,/);
  });

  it.each([
    ["only connected", ""],
    ["halfway through a request", "POST /sync HTTP/1.1\r\nHost: sync\r\nContent-Length: 100\r\n\r\n{"],
  ])("stop the sync server on SIGTERM while a client is %s", async (_, sent) => {
    const port = 20000 + Math.floor(Math.random() * 20000);
    const server = spawn("node", ["dist-node/server.mjs"], {
      env: { PATH: process.env.PATH, OUTLINE_TOKEN: "bundle-test-token-0123456789", OUTLINE_DB: ":memory:", HOST: "127.0.0.1", PORT: String(port) },
    });
    await new Promise((resolve) => server.stdout.once("data", resolve));
    const client = connect(port, "127.0.0.1");
    await new Promise((resolve) => client.once("connect", resolve));
    client.on("error", () => {});
    client.write(sent);
    try {
      server.kill("SIGTERM");
      expect(await exitsWithin(server, 1000)).toBe(true);
    } finally {
      server.kill("SIGKILL");
      client.destroy();
    }
  });

  it("run the CLI from outline.mjs alone", async () => {
    expect(await runAlone("outline.mjs", ["help"], {})).toContain("outline");
  });

  it("pipe all of a long CLI output before exiting", async () => {
    const token = "bundle-test-token-0123456789";
    const store = new Store(":memory:");
    const server = createSyncServer({ store, token, origins: ["*"] });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const env = { OUTLINE_SERVER: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, OUTLINE_TOKEN: token };
    try {
      const lines = Array.from({ length: 1000 }, (_, index) => `- Item ${index} ${"x".repeat(80)}`).join("\n");
      expect((await run(["add", "-"], env, lines)).code).toBe(0);
      const output = await allOutput(spawn("node", ["dist-node/outline.mjs", "show", "--json"], { env: { PATH: process.env.PATH, ...env } }));
      expect(output.length).toBeGreaterThan(64 * 1024);
      expect(JSON.parse(output).children).toHaveLength(1000);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      store.close();
    }
  });
});

function allOutput(child: ChildProcess) {
  return new Promise<string>((resolve) => {
    let output = "";
    child.stdout?.on("data", (data) => (output += data));
    child.on("close", () => resolve(output));
  });
}

async function runAlone(bundle: string, args: string[], env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "bundle-"));
  copyFileSync(join("dist-node", bundle), join(dir, bundle));
  try {
    return await firstOutput(spawn("node", [join(dir, bundle), ...args], { env: { PATH: process.env.PATH, ...env } }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function exitsWithin(child: ChildProcess, milliseconds: number) {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), milliseconds);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function firstOutput(child: ReturnType<typeof spawn>) {
  return new Promise<string>((resolve) => {
    let output = "";
    const finish = () => {
      child.kill();
      resolve(output);
    };
    child.stdout?.on("data", (data) => {
      output += data;
      finish();
    });
    child.stderr?.on("data", (data) => (output += data));
    child.on("exit", finish);
  });
}
