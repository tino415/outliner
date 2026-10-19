import { describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("the node bundles", () => {
  execFileSync("npm", ["run", "build:node"], { stdio: "ignore" });

  it("start the sync server from server.mjs alone", async () => {
    const output = await runAlone("server.mjs", [], {
      OUTLINE_TOKEN: "bundle-test-token-0123456789",
      OUTLINE_DB: ":memory:",
      HOST: "127.0.0.1",
      PORT: "0",
    });
    expect(output).toContain("outline sync server on 127.0.0.1");
  });

  it("run the CLI from outline.mjs alone", async () => {
    expect(await runAlone("outline.mjs", ["help"], {})).toContain("outline");
  });
});

async function runAlone(bundle: string, args: string[], env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "bundle-"));
  copyFileSync(join("dist-node", bundle), join(dir, bundle));
  try {
    return await firstOutput(spawn("node", [join(dir, bundle), ...args], { env: { PATH: process.env.PATH, ...env } }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
