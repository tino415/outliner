import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configPath, parseConfig, withConfigFile } from "../cli/config";

describe("CLI config file", () => {
  it("reads KEY=value lines, skipping comments and blank lines", () => {
    const text = [
      "# the sync server",
      "OUTLINE_SERVER=https://outline.example/",
      "",
      "export OUTLINE_TOKEN = 'secret token'  ",
      'QUOTED="a=b"',
      "not a setting",
    ].join("\n");
    expect(parseConfig(text)).toEqual({
      OUTLINE_SERVER: "https://outline.example/",
      OUTLINE_TOKEN: "secret token",
      QUOTED: "a=b",
    });
  });

  it("lives under XDG_CONFIG_HOME, or ~/.config without it", () => {
    expect(configPath({ XDG_CONFIG_HOME: "/xdg", HOME: "/home/m" })).toBe("/xdg/outline/config");
    expect(configPath({ HOME: "/home/m" })).toBe("/home/m/.config/outline/config");
  });

  it("fills what the environment leaves unset", () => {
    const configHome = mkdtempSync(join(tmpdir(), "outline-config-"));
    mkdirSync(join(configHome, "outline"));
    writeFileSync(join(configHome, "outline", "config"), "OUTLINE_SERVER=http://file\nOUTLINE_TOKEN=from-file\n");
    const env = withConfigFile({ XDG_CONFIG_HOME: configHome, OUTLINE_TOKEN: "from-env" });
    expect(env.OUTLINE_SERVER).toBe("http://file");
    expect(env.OUTLINE_TOKEN).toBe("from-env");
  });

  it("is optional", () => {
    expect(withConfigFile({ XDG_CONFIG_HOME: "/nonexistent" })).toEqual({ XDG_CONFIG_HOME: "/nonexistent" });
  });
});
