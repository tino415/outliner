import { ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface RunningServer {
  url: string;
  token: string;
  stop: () => Promise<void>;
}

const graceBeforeKilling = 3000;
const startupTimeout = 15000;

/** A sync server of its own for one test: the bundled build, a fresh database, a port the system picks. */
export async function startSyncServer(): Promise<RunningServer> {
  const directory = mkdtempSync(join(tmpdir(), "outline-sync-"));
  const token = `e2e-token-${randomUUID()}`;
  const child: ChildProcess = spawn("node", ["dist-node/server.mjs"], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", OUTLINE_TOKEN: token, OUTLINE_DB: join(directory, "outline.db") },
    stdio: ["ignore", "pipe", "inherit"],
  });
  try {
    const port = await listeningPort(child);
    return {
      url: `http://127.0.0.1:${port}`,
      token,
      stop: async () => {
        await stopWithin(child, graceBeforeKilling);
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    child.kill("SIGKILL");
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function listeningPort(child: ChildProcess): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`sync server not listening after ${startupTimeout} ms: ${output}`)), startupTimeout);
    child.stdout!.on("data", (chunk) => {
      output += String(chunk);
      const port = output.match(/sync server on 127\.0\.0\.1:(\d+)/)?.[1];
      if (port) {
        clearTimeout(timeout);
        resolve(Number(port));
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`sync server exited with ${code}`));
    });
  });
}

async function stopWithin(child: ChildProcess, grace: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.on("exit", resolve));
  child.kill("SIGTERM");
  const killing = setTimeout(() => {
    console.warn(`sync server ${child.pid} still running ${grace} ms after SIGTERM; killing it`);
    child.kill("SIGKILL");
  }, grace);
  await exited;
  clearTimeout(killing);
}
