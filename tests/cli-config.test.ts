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

  it("drops a comment after a value, but keeps a # inside one", () => {
    expect(parseConfig("OUTLINE_SERVER=https://a.example  # the tailnet\nOUTLINE_TOKEN=ab#cd")).toEqual({
      OUTLINE_SERVER: "https://a.example",
      OUTLINE_TOKEN: "ab#cd",
    });
  });

  it("is not overridden by a variable the environment sets to nothing", () => {
    const configHome = mkdtempSync(join(tmpdir(), "outline-config-"));
    mkdirSync(join(configHome, "outline"));
    writeFileSync(join(configHome, "outline", "config"), "OUTLINE_SERVER=http://file\n");
    expect(withConfigFile({ XDG_CONFIG_HOME: configHome, OUTLINE_SERVER: "" }).OUTLINE_SERVER).toBe("http://file");
  });

  it("says which file it could not read, instead of failing with a stack trace", () => {
    const configHome = mkdtempSync(join(tmpdir(), "outline-config-"));
    mkdirSync(join(configHome, "outline", "config"), { recursive: true });
    expect(() => withConfigFile({ XDG_CONFIG_HOME: configHome })).toThrow(new RegExp(`^cannot read ${join(configHome, "outline", "config")}: EISDIR$`));
  });

  it("is optional", () => {
    expect(withConfigFile({ XDG_CONFIG_HOME: "/nonexistent" })).toEqual({ XDG_CONFIG_HOME: "/nonexistent" });
  });
});
