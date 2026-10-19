import { describe, expect, it } from "vitest";
import { ROOT, setFlags } from "../src/model";
import { exportMarkdown, exportOpml, graft, parseIndentedText, subtreesAsText } from "../src/transfer";
import { renderInline, renderItemText, renderNote, tagsWritten } from "../src/inline";

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

describe("links in exports", () => {
  const doc = (() => {
    const base = parseIndentedText("Garden\nSee [[id:GARDEN][the garden]] and [[Garden]]");
    const [garden, see] = base.items[ROOT].children;
    const linked = setFlags(base, see, { note: "also [[id:missing][gone]]\n```\n[[id:kept][raw]]\n```" });
    return { ...linked, items: { ...linked.items, [see]: { ...linked.items[see], text: linked.items[see].text.replace("GARDEN", garden) } } };
  })();

  it("writes each link as its label in Markdown, and leaves code blocks alone", () => {
    expect(exportMarkdown(doc, ROOT)).toBe("- Garden\n- See the garden and Garden\n  also gone\n  ```\n  [[id:kept][raw]]\n  ```\n");
  });

  it("writes each link as its label in OPML", () => {
    const opml = exportOpml(doc, ROOT);
    expect(opml).toContain('text="See the garden and Garden"');
    expect(opml).toContain('_note="also gone&#10;```&#10;[[id:kept][raw]]&#10;```"');
  });

  it("keeps links raw when copying items, so pasting them back keeps the link", () => {
    expect(subtreesAsText(doc, doc.items[ROOT].children)).toContain("[[id:");
  });
});

describe("properties in exports", () => {
  it("writes them as :key: value lines above the note and reads them back as properties", () => {
    const base = parseIndentedText("- Lunch\n  :kcal: 600 kcal\n  soup and bread");
    const lunch = base.items[ROOT].children[0];
    expect(base.items[lunch]).toMatchObject({ note: "soup and bread", properties: { kcal: "600 kcal" } });
    const written = exportMarkdown(base, ROOT);
    expect(written).toBe("- Lunch\n  :kcal: 600 kcal\n  soup and bread\n");
    const again = parseIndentedText(written);
    expect(again.items[again.items[ROOT].children[0]]).toMatchObject({ note: "soup and bread", properties: { kcal: "600 kcal" } });
    expect(exportOpml(base, ROOT)).toContain('_note=":kcal: 600 kcal&#10;soup and bread"');
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
    `see ![shot.png](att:${"a".repeat(64)}) and [report.pdf](att:${"b".repeat(64)})`,
    "due 2026-10-14, call at 2026-10-15 9:00, not 2026-13-01 or v2026-10-14",
  ])("keeps the raw text as the text content: %s", (text) => {
    expect(textOf(renderInline(text))).toBe(text);
  });

  it.each(["Question: is it **done**?", "Needs you:", "Mon 9:30 standup", "plain"])("keeps an item's raw text with its kind: %s", (text) => {
    expect(textOf(renderItemText(text))).toBe(text);
  });

  it("shows the kind as a badge", () => {
    expect(renderItemText("Needs you: review")).toContain('<span class="kind" data-kind="Needs you">Needs you<span class="md">:</span></span>');
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
    const note = "Bought at the *market*\n:calories:  350 kcal\n  :effort: 1h";
    const html = renderNote(note);
    expect(textOf(html)).toBe(note);
    expect(html).toContain('<span class="prop-key">calories</span>');
    expect(html).toContain("<em>");
  });

  it.each([
    "```\nlet x = 1 * 2 * 3;\n```",
    "before\n```js\n  if (a) {\n    #notatag\n  }\n```\nafter",
    "```\n```",
    "```",
    "```\nunclosed\n",
    "a\n```\n\n```\n",
  ])("keeps the raw text of code blocks: %j", (note) => {
    const html = renderNote(note);
    expect(textOf(html)).toBe(note);
    expect(html).toContain('<span class="code-block"');
    expect(html).not.toContain("<em>");
    expect(html).not.toContain('class="tag"');
  });

  it("names the language of a code block", () => {
    expect(renderNote("```elixir\nIO.puts 1\n```")).toContain('data-language="elixir"');
  });

  it.each(["nix run .#outline-sync-server", "fixes #123", "mid#nottag", "\\#plain", "`#code`"])("reads no tag in %j", (text) => {
    expect(renderInline(text)).not.toContain('class="tag"');
    expect(textOf(renderInline(text))).toBe(text);
  });

  it("reads a tag at the start, after a space and after a bracket", () => {
    const html = renderInline("#first then #second (#third) [#fourth] #v2");
    for (const tag of ["#first", "#second", "#third", "#fourth", "#v2"]) expect(html).toContain(`data-tag="${tag}"`);
  });

  it("hides the backslash of \\# outside editing, as other markers", () => {
    expect(renderInline("\\#plain")).toContain('<span class="md">\\</span>#plain');
  });

  it("collects the same tags it shows", () => {
    expect(tagsWritten("#a b.#c #123 \\#d (#e)")).toEqual(["a", "e"]);
  });

  it("does not treat multiplication as italic", () => {
    expect(renderInline("2 * 3 * 4")).not.toContain("<em>");
  });
});
