import { describe, expect, it } from "vitest";
import { ROOT, setFlags } from "../src/model";
import { exportMarkdown, exportOpml, graft, parseIndentedText, subtreesAsText } from "../src/transfer";
import { renderInline, renderNote } from "../src/inline";

describe("export", () => {
  const doc = (() => {
    const base = parseIndentedText("Plan & <do>\n  step \"one\"\ndone");
    const done = Object.values(base.items).find((item) => item.text === "done")!.id;
    return setFlags(base, done, { completed: true, note: "with a note" });
  })();

  it("writes nested markdown with notes and completed items struck", () => {
    expect(exportMarkdown(doc, ROOT)).toBe('- Plan & <do>\n  - step "one"\n- ~~done~~\n  with a note\n');
  });

  it("writes OPML with escaped attributes", () => {
    const opml = exportOpml(doc, ROOT);
    expect(opml).toContain('<outline text="Plan &#38; &#60;do&#62;">');
    expect(opml).toContain('<outline text="step &#34;one&#34;"/>');
    expect(opml).toContain('_note="with a note" _complete="true"');
  });
});

describe("round trips", () => {
  it("keeps line breaks in OPML notes", () => {
    const base = parseIndentedText("item");
    const doc = setFlags(base, base.items[ROOT].children[0], { note: "line1\nline2" });
    expect(exportOpml(doc, ROOT)).toContain('_note="line1&#10;line2"');
  });

  it("copies notes and completed state so that a paste restores them", () => {
    let doc = parseIndentedText("a\n  b\nc");
    const [a, c] = doc.items[ROOT].children;
    const b = doc.items[a].children[0];
    doc = setFlags(doc, a, { note: "note of a\nsecond line" });
    doc = setFlags(doc, b, { completed: true });
    const pasted = parseIndentedText(subtreesAsText(doc, [a, c]));
    const [pa, pc] = pasted.items[ROOT].children;
    expect(pasted.items[pa].text).toBe("a");
    expect(pasted.items[pa].note).toBe("note of a\nsecond line");
    expect(pasted.items[pasted.items[pa].children[0]].completed).toBe(true);
    expect(pasted.items[pasted.items[pa].children[0]].text).toBe("b");
    expect(pasted.items[pc].text).toBe("c");
  });
});

describe("graft", () => {
  it("copies items with fresh ids at the given position", () => {
    const target = parseIndentedText("first\nlast");
    const incoming = parseIndentedText("a\n  b");
    const result = graft(target, incoming, ROOT, 1);
    const texts = target.items[ROOT].children.length + 1;
    expect(result.doc.items[ROOT].children).toHaveLength(texts);
    expect(result.doc.items[result.ids[0]].text).toBe("a");
    expect(result.doc.items[ROOT].children[1]).toBe(result.ids[0]);
    expect(result.doc.items[result.doc.items[result.ids[0]].children[0]].text).toBe("b");
    expect(result.ids[0]).not.toBe(Object.values(incoming.items).find((item) => item.text === "a")!.id);
  });
});

describe("parseIndentedText", () => {
  it("understands markdown bullets and indentation", () => {
    const doc = parseIndentedText("- a\n  - b\n    * c\n- d");
    const a = doc.items[doc.items[ROOT].children[0]];
    expect(a.text).toBe("a");
    expect(doc.items[a.children[0]].text).toBe("b");
    expect(doc.items[doc.items[a.children[0]].children[0]].text).toBe("c");
    expect(doc.items[doc.items[ROOT].children[1]].text).toBe("d");
  });
});

describe("renderInline", () => {
  const textOf = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));

  it.each([
    "plain **bold** and *it* with `code`",
    "see [docs](https://example.com/a) and https://x.org/path.",
    "#tag at start, mid#nottag, and #two-words",
    "<script>alert('x')</script> & friends",
    "2 * 3 * 4 is not italic",
  ])("keeps the raw text as the text content: %s", (text) => {
    expect(textOf(renderInline(text))).toBe(text);
  });

  it("recognises formatting", () => {
    const html = renderInline("**b** *i* `c` #t https://a.b");
    expect(html).toContain("<strong>");
    expect(html).toContain("<em>");
    expect(html).toContain("<code>");
    expect(html).toContain('data-tag="#t"');
    expect(html).toContain('href="https://a.b"');
  });

  it("keeps a note's raw text while showing properties as key and value", () => {
    const note = "Bought at the *market*\ncalories::  350 kcal\n  effort:: 1h";
    const html = renderNote(note);
    expect(textOf(html)).toBe(note);
    expect(html).toContain('<span class="prop-key">calories</span>');
    expect(html).toContain("<em>");
  });

  it("does not treat multiplication as italic", () => {
    expect(renderInline("2 * 3 * 4")).not.toContain("<em>");
  });
});
