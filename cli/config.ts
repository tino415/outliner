import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

export function withConfigFile(env: Env): Env {
  return { ...readConfig(configPath(env)), ...env };
}

export function configPath(env: Env): string {
  const configHome = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), ".config");
  return join(configHome, "outline", "config");
}

function readConfig(path: string): Env {
  try {
    return parseConfig(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export function parseConfig(text: string): Record<string, string> {
  const entries = text.split(/\r?\n/).map(parseLine).filter((entry) => entry !== undefined);
  return Object.fromEntries(entries);
}

function parseLine(line: string): [string, string] | undefined {
  const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
  if (!match) return undefined;
  const [, key, value] = match;
  return [key, unquote(value)];
}

function unquote(value: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}
