import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function withoutCommentsAndStrings(css: string) {
  const commentStringOrUrl = /\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|url\([^)"']*\)/g;
  return css.replace(commentStringOrUrl, (match) => match.replace(/[^\n]/g, " "));
}

function braceProblems(css: string) {
  const problems: string[] = [];
  let depth = 0;
  withoutCommentsAndStrings(css).split("\n").forEach((line, index) => {
    const lineNumber = index + 1;
    if (depth > 0 && /^[^\s}]/.test(line)) problems.push(`line ${lineNumber}: starts at column 0 inside an open block`);
    for (const character of line) {
      if (character === "{") depth++;
      if (character === "}") depth--;
      if (depth < 0) {
        problems.push(`line ${lineNumber}: closing brace without an opening one`);
        depth = 0;
      }
    }
  });
  if (depth > 0) problems.push(`end of file: ${depth} block(s) never closed`);
  return problems;
}

describe("braceProblems", () => {
  it("accepts balanced, nested rules", () => {
    expect(braceProblems(".a {\n  color: red;\n}\n@media (x) {\n  .b {\n    y: z;\n  }\n}\n")).toEqual([]);
  });

  it("ignores braces in comments and strings", () => {
    expect(braceProblems('/* } */\n.a::after {\n  content: "{";\n}\n')).toEqual([]);
  });

  it("ignores a comment opener inside a string and a brace inside url()", () => {
    expect(braceProblems('.a::after {\n  content: "/*";\n  background: url(data:x;{);\n}\n')).toEqual([]);
  });

  it("finds a lost closing brace before the next rule", () => {
    expect(braceProblems(".a {\n  color: red;\n.b {\n  color: blue;\n}\n")).toEqual([
      "line 3: starts at column 0 inside an open block",
      "end of file: 1 block(s) never closed",
    ]);
  });

  it("finds a closing brace left over", () => {
    expect(braceProblems(".a {\n  color: red;\n}\n}\n")).toEqual(["line 4: closing brace without an opening one"]);
  });
});

describe("src/style.css", () => {
  it("has balanced braces", () => {
    expect(braceProblems(readFileSync(new URL("../src/style.css", import.meta.url), "utf8"))).toEqual([]);
  });
});
