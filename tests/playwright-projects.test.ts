import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

interface ListedSuite {
  file: string;
  specs: { tests: { projectName: string }[] }[];
  suites?: ListedSuite[];
}

describe("the Playwright projects", () => {
  const listed = listTests();

  it("run every spec file in at least one project", () => {
    const specFiles = readdirSync("e2e").filter((file) => file.endsWith(".spec.ts"));
    const runSomewhere = new Set(listed.filter((suite) => projectsOf(suite).length).map((suite) => suite.file));
    expect(specFiles.filter((file) => !runSomewhere.has(file))).toEqual([]);
  });

  it("give the phone the tests tagged @phone and @touch, and the iPhone only @touch", () => {
    expect(projectsOfFile(listed, "columns.spec.ts")).toEqual(["desktop", "phone"]);
    expect(projectsOfFile(listed, "mobile.spec.ts")).toEqual(["iphone", "phone"]);
    expect(projectsOfFile(listed, "editing.spec.ts")).toEqual(["desktop", "firefox"]);
    expect(projectsOfFile(listed, "regressions.spec.ts")).toEqual(["desktop", "phone"]);
    expect(projectsOfFile(listed, "keyboard.spec.ts")).toEqual(["desktop", "phone"]);
  });

  it("time rendering in a project of its own, after the others", () => {
    expect(projectsOfFile(listed, "performance.spec.ts")).toEqual(["performance"]);
  });
});

function listTests(): ListedSuite[] {
  const json = execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], { encoding: "utf8", env: { ...process.env, WEBKIT: "" } });
  return JSON.parse(json).suites;
}

function projectsOfFile(suites: ListedSuite[], file: string): string[] {
  return projectsOf(suites.find((suite) => suite.file === file)!);
}

function projectsOf(suite: ListedSuite): string[] {
  const inSuite = suite.specs.flatMap((spec) => spec.tests.map((test) => test.projectName));
  const inDescribes = (suite.suites ?? []).flatMap(projectsOf);
  return [...new Set([...inSuite, ...inDescribes])].sort();
}
