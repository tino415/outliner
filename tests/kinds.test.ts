import { describe, expect, it } from "vitest";
import { isKindName, kindOf, kindPrefixLength, kindsIn, withKind } from "../src/kinds";
import { parseIndentedText } from "../src/transfer";

describe("kinds", () => {
  it.each([
    ["Question: why?", "Question"],
    ["Needs you: update the phone", "Needs you"],
    ["Design note for: three words", "Design note for"],
    ["Answer:", "Answer"],
    ["Too many words here: no", null],
    ["Mon 9:30 standup", null],
    ["Reply 2026-10-09: dated", null],
    ["lower: case", null],
    ["Question:no space", null],
    ["https://example.com", null],
  ])("%s has the kind %s", (text, kind) => {
    expect(kindOf(text)).toBe(kind);
  });

  it("replaces, adds and removes the kind, keeping the rest", () => {
    expect(withKind("Question: why?", "Answer")).toBe("Answer: why?");
    expect(withKind("why?", "Question")).toBe("Question: why?");
    expect(withKind("Question: why?", "")).toBe("why?");
    expect(kindPrefixLength("Needs you: x")).toBe(11);
    expect(kindPrefixLength("Answer:")).toBe(7);
    expect(kindPrefixLength("plain")).toBe(0);
  });

  it("names a new kind only with letters, capitalised, up to three words", () => {
    expect(isKindName("Waiting")).toBe(true);
    expect(isKindName("Needs you")).toBe(true);
    expect(isKindName("waiting")).toBe(false);
    expect(isKindName("Step 2")).toBe(false);
  });

  it("lists the kinds in use, most used first", () => {
    expect(kindsIn(parseIndentedText("Question: a\nAnswer: b\nQuestion: c\nplain"))).toEqual(["Question", "Answer"]);
  });
});
