import { ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface RunningServer {
  url: string;
  token: string;
  stop: () => Promise<void>;
}

const attemptsAtAFreePort = 5;
const graceBeforeKilling = 3000;

/** A sync server of its own for one test: the bundled build, a fresh database, a free port. */
export async function startSyncServer(): Promise<RunningServer> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await startAtRandomPort();
    } catch (error) {
      if (attempt === attemptsAtAFreePort) throw error;
    }
  }
}

async function startAtRandomPort(): Promise<RunningServer> {
  const directory = mkdtempSync(join(tmpdir(), "outline-sync-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const token = `e2e-token-${port}-0123456789`;
  const child: ChildProcess = spawn("node", ["dist-node/server.mjs"], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", OUTLINE_TOKEN: token, OUTLINE_DB: join(directory, "outline.db") },
    stdio: ["ignore", "pipe", "inherit"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout!.on("data", (chunk) => String(chunk).includes("sync server on") && resolve());
      child.on("exit", (code) => reject(new Error(`sync server exited with ${code}`)));
    });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    url: `http://127.0.0.1:${port}`,
    token,
    stop: async () => {
      await stopWithin(child, graceBeforeKilling);
      rmSync(directory, { recursive: true, force: true });
    },
  };
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
