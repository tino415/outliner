import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { createSyncServer } from "../server/app";
import { Store } from "../server/store";
import { run } from "../cli/run";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const token = "cli-test-token-0123456789";
let server: Server;
let store: Store;
let env: Record<string, string>;

beforeEach(async () => {
  store = new Store(":memory:");
  server = createSyncServer({ store, token, origins: ["*"] });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  env = { OUTLINE_SERVER: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, OUTLINE_TOKEN: token };
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.close();
});

async function outline(command: string, stdin = "") {
  const result = await run(splitArgs(command), env, stdin);
  if (result.code !== 0) throw new Error(result.output);
  return result.output;
}

/** Every outline holds the Settings system item; the tests that compare a whole outline leave it and what is under it out. */
async function outlineWithoutBookmarks(command: string, stdin = "") {
  const lines = (await outline(command, stdin)).split("\n");
  const indentOf = (line: string) => line.length - line.trimStart().length;
  let skippingBelow = -1;
  return lines
    .filter((line) => {
      if (skippingBelow >= 0 && indentOf(line) > skippingBelow) return false;
      skippingBelow = -1;
      if (!/^\s*(- )?Settings(\s+\[settings\])?\s*(\d.*)?$/.test(line)) return true;
      skippingBelow = indentOf(line);
      return false;
    })
    .join("\n");
}

function splitArgs(command: string): string[] {
  return [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]);
}

describe("outline CLI", () => {
  it("stores a tag written in a title as the tags property and prints it after the title", async () => {
    await outline('add "a #x b"');
    expect(await outlineWithoutBookmarks("show")).toBe("- a b #x");
    expect(await outline("show --json")).toContain('"tags": "x"');
    expect(await outline("find --query \"#x\"")).toContain("a b #x");
  });

  it("adds items, nests them by path and shows the outline", async () => {
    await outline('add "Projects"');
    await outline('add "Garden" --under Projects');
    await outline('add "Plant tomatoes" --under "Projects/Garden"');
    await outline('add "Inbox" --first');
    expect(await outlineWithoutBookmarks("show")).toBe("- Inbox\n- Projects\n  - Garden\n    - Plant tomatoes");
    expect(await outline("show Projects --depth 1")).toBe("- Projects\n  - Garden");
  });

  it("finds items and edits, completes and moves them by id", async () => {
    await outline('add "Projects"');
    const id = await outline('add "Buy seeds" --under Projects');
    await outline('add "Shopping"');
    const found = JSON.parse(await outline("find seeds --json"));
    expect(found).toEqual([{ id, text: "Buy seeds", path: ["Projects"] }]);
    await outline(`edit ${id} "Buy tomato seeds"`);
    await outline(`done ${id}`);
    await outline(`move ${id} --under Shopping`);
    expect(await outlineWithoutBookmarks("show")).toBe("- Projects\n- Shopping\n  - ~~Buy tomato seeds~~");
  });

  it("finds items with the language of query views", async () => {
    await outline('add "Projects"');
    await outline('add "Outliner" --under Projects');
    const open = await outline('add "Query views #feature" --under Projects/Outliner');
    const done = await outline('add "Agenda #feature" --under Projects/Outliner');
    await outline('add "Draft #feature"');
    await outline(`done ${done}`);
    expect(JSON.parse(await outline('find "#feature under:Projects/Outliner" --query --json'))).toEqual([
      { id: open, text: "Query views #feature", path: ["Projects", "Outliner"] },
      { id: done, text: "Agenda #feature", path: ["Projects", "Outliner"] },
    ]);
    expect(await outline('find "#feature is:open -draft" --query')).toBe(`${open}  Projects / Outliner / Query views #feature`);
  });

  it("follows the page's :new: top and :completed: last", async () => {
    await outline('add "TODO"');
    await outline("set TODO new top");
    await outline("set TODO completed last");
    await outline('add "old" --under TODO');
    const newer = await outline('add "newer" --under TODO');
    await outline(`done ${newer}`);
    await outline('add "newest" --under TODO');
    expect(await outline("show TODO")).toBe("- TODO\n  :new: top\n  :completed: last\n  - newest\n  - old\n  - ~~newer~~");
  });

  it("attaches a file as a last child and fetches it back by its hash", async () => {
    const folder = mkdtempSync(join(tmpdir(), "outline-cli-"));
    const shot = join(folder, "glitch.png");
    writeFileSync(shot, "not really a png");
    await outline('add "Bug report" --note "steps"');
    await outline('add "first" --under "Bug report"');
    const child = await outline(`attach "Bug report" ${shot}`);
    const shown = await outline('show "Bug report" --json').then(JSON.parse);
    expect(child).toBe(shown.children[1].id);
    const hash = /att:([0-9a-f]{64})/.exec(shown.children[1].text)![1];
    expect(await outline('show "Bug report"')).toBe(`- Bug report\n  steps\n  - first\n  - ![glitch.png](att:${hash})`);
    const copy = join(folder, "copy.png");
    expect(await outline(`file ${hash} ${copy}`)).toBe(copy);
    expect(readFileSync(copy, "utf8")).toBe("not really a png");
    await expect(outline(`file ${"0".repeat(64)} ${copy}`)).rejects.toThrow(/no file/);
    rmSync(folder, { recursive: true });
  });

  it("attaches a file as the first child under an item with :new: top", async () => {
    const folder = mkdtempSync(join(tmpdir(), "outline-cli-"));
    const shot = join(folder, "glitch.png");
    writeFileSync(shot, "not really a png");
    await outline('add "Inbox"');
    await outline("set Inbox new top");
    await outline('add "older" --under Inbox');
    const child = await outline(`attach Inbox ${shot}`);
    expect(child).toMatch(/^\w+$/);
    expect(await outline("show Inbox")).toMatch(/^- Inbox\n {2}:new: top\n {2}- !\[glitch\.png\]\(att:[0-9a-f]{64}\)\n {2}- older$/);
    rmSync(folder, { recursive: true });
  });

  it("lifts the attachment links of notes into children, once", async () => {
    const link = `![glitch.png](att:${"c".repeat(64)})`;
    await outline('add "Bug report"');
    await outline(`note "Bug report" "steps\n${link}"`);
    expect(await outline("lift-attachments")).toMatch(/^\w+ "Bug report"$/);
    expect(await outline('show "Bug report"')).toBe(`- Bug report\n  steps\n  - ${link}`);
    expect(await outline("lift-attachments")).toBe("");
  });

  describe("detach", () => {
    let folder: string;
    let hash: string;
    beforeEach(async () => {
      folder = mkdtempSync(join(tmpdir(), "outline-cli-"));
      const shot = join(folder, "glitch.png");
      writeFileSync(shot, "not really a png");
      await outline('add "Bug report"');
      await outline(`attach "Bug report" ${shot}`);
      hash = /att:([0-9a-f]{64})/.exec(await outline('show "Bug report"'))![1];
    });
    afterEach(() => rmSync(folder, { recursive: true }));

    it("removes the child and deletes the file", async () => {
      expect(await outline(`detach "Bug report" ${hash}`)).toBe(`deleted ${hash}`);
      expect(await outline('show "Bug report"')).toBe("- Bug report");
      await expect(outline(`file ${hash} ${join(folder, "copy.png")}`)).rejects.toThrow(/no file/);
    });

    it("keeps the file while another item's child links it", async () => {
      await outline('add "Duplicate"');
      await outline(`add "[again](att:${hash})" --under Duplicate`);
      expect(await outline(`detach "Bug report" ${hash}`)).toMatch(new RegExp(`^kept ${hash}, still linked from `));
      expect(await outline('show "Bug report"')).toBe("- Bug report");
    });

    it("keeps the note's other lines", async () => {
      await outline(`note "Bug report" "see below\n![glitch.png](att:${hash})\nthanks"`);
      await outline(`detach "Bug report" ${hash}`);
      expect(await outline('show "Bug report"')).toBe("- Bug report\n  see below\n  thanks");
    });

    it("takes out every link to the file, also inline in a line of text", async () => {
      await outline(`note "Bug report" "see ![a](att:${hash}) here\n[b](att:${hash})"`);
      await outline(`detach "Bug report" ${hash}`);
      expect(await outline('show "Bug report"')).toBe("- Bug report\n  see  here");
    });

    it("keeps the file while another item links it", async () => {
      await outline('add "Duplicate"');
      await outline(`note Duplicate "[again](att:${hash})"`);
      const kept = await outline(`detach "Bug report" ${hash}`);
      expect(kept).toMatch(new RegExp(`^kept ${hash}, still linked from \\w+ "Duplicate"$`));
      expect(await outline('show "Bug report"')).toBe("- Bug report");
      expect(await outline(`file ${hash} ${join(folder, "copy.png")}`)).toBe(join(folder, "copy.png"));
    });

    it("keeps the file while another item links it in its text", async () => {
      await outline(`add "![again](att:${hash})"`);
      expect(await outline(`detach "Bug report" ${hash}`)).toMatch(new RegExp(`^kept ${hash}, still linked from `));
    });

    it("deletes the file of a link already taken out by hand", async () => {
      await outline(`rm ${(await outline('show "Bug report" --json').then(JSON.parse)).children[0].id}`);
      expect(await outline(`detach ${hash}`)).toBe(`deleted ${hash}`);
      await expect(outline(`file ${hash} ${join(folder, "copy.png")}`)).rejects.toThrow(/no file/);
    });

    it("refuses a bare hash that a note still links", async () => {
      expect(await outline(`detach ${hash}`)).toMatch(/^kept /);
      expect(await outline(`file ${hash} ${join(folder, "copy.png")}`)).toBe(join(folder, "copy.png"));
    });

    it("says when the server has no such file", async () => {
      await expect(outline(`detach ${"0".repeat(64)}`)).rejects.toThrow(`no file ${"0".repeat(64)} on the server`);
    });

    it("refuses an item that does not link the file, and a hash that is not one", async () => {
      await outline('add "Other"');
      await expect(outline(`detach Other ${hash}`)).rejects.toThrow(/has no link/);
      await expect(outline("detach Other abc")).rejects.toThrow(/64 letters/);
    });

    it("deletes anyway and counts the private items it could not read", async () => {
      await outline('add "Journal"');
      await outline(`note Journal "🔒private:1:personal:${"A".repeat(40)}"`);
      expect(await outline(`detach "Bug report" ${hash}`)).toBe(`deleted ${hash}\n1 private items were not checked for a link to it`);
    });

    it("refuses a private item", async () => {
      await outline('add "Journal"');
      await outline(`note Journal "🔒private:1:personal:${"A".repeat(40)}"`);
      await expect(outline(`detach Journal ${hash}`)).rejects.toThrow(/Journal is private/);
    });
  });

  it("shows a private item as private and refuses to write into it", async () => {
    await outline('add "Journal"');
    await outline(`note Journal "🔒private:1:personal:${"A".repeat(40)}"`);
    await outline('add "Shopping"');
    expect(await outlineWithoutBookmarks("show")).toBe("- Journal\n  🔒 private, sealed with the key personal\n- Shopping");
    await expect(outline('add "peek" --under Journal')).rejects.toThrow(/Journal is private/);
    await expect(outline("move Shopping --under Journal")).rejects.toThrow(/Journal is private/);
    await expect(outline('note Journal "plain"')).rejects.toThrow(/Journal is private/);
    await expect(outline("set Journal mood good")).rejects.toThrow(/Journal is private/);
    await outline('edit Journal "Diary"');
    expect(await outlineWithoutBookmarks("show")).toContain("- Diary");
  });

  it("exports Markdown with links as their labels", async () => {
    const id = await outline('add "Garden"');
    await outline(`add "See [[id:${id}][the garden]]"`);
    expect(await outlineWithoutBookmarks("export --md")).toBe("- Garden\n- See the garden");
  });

  it("adds items before or after another, beside it", async () => {
    await outline('add "Projects"');
    await outline('add "Garden" --under Projects');
    await outline('add "House" --under Projects');
    await outline('add "Car" --before Projects/House');
    await outline('add "Bike" --after Projects/House');
    await outline('add "Inbox" --before Projects');
    await outline("add - --after Projects/Garden", "- Shed\n  - Tools");
    expect(await outlineWithoutBookmarks("show")).toBe(
      "- Inbox\n- Projects\n  - Garden\n  - Shed\n    - Tools\n  - Car\n  - House\n  - Bike",
    );
  });

  it("moves items before or after another, across parents and within one", async () => {
    await outline('add "a"');
    await outline('add "b"');
    await outline('add "c"');
    await outline('add "x" --under b');
    await outline("move a --after c");
    expect(await outlineWithoutBookmarks("show")).toBe("- b\n  - x\n- c\n- a");
    await outline("move a --before b");
    expect(await outlineWithoutBookmarks("show")).toBe("- a\n- b\n  - x\n- c");
    await outline("move c --before b/x");
    expect(await outlineWithoutBookmarks("show")).toBe("- a\n- b\n  - c\n  - x");
    await outline("move b/x --after a");
    expect(await outlineWithoutBookmarks("show")).toBe("- a\n- x\n- b\n  - c");
  });

  it("refuses places that contradict each other or the item itself", async () => {
    await outline('add "a"');
    await outline('add "b" --under a');
    await outline('add "c"');
    await expect(outline("add d --before c --after c")).rejects.toThrow(/either --before or --after/);
    await expect(outline("add d --before c --under a")).rejects.toThrow(/cannot go with --under or --first/);
    await expect(outline("move c --after a --first")).rejects.toThrow(/cannot go with --under or --first/);
    await expect(outline("add d --after /")).rejects.toThrow(/no place beside it/);
    await expect(outline("move a --before a")).rejects.toThrow(/beside itself/);
    await expect(outline("move a --after a/b")).rejects.toThrow(/under itself/);
    await expect(outline("move c")).rejects.toThrow(/needs --under, --before or --after/);
    expect(await outlineWithoutBookmarks("show")).toBe("- a\n  - b\n- c");
  });

  it("captures with a template from the outline, or into an Inbox", async () => {
    await outline('capture "call mum"');
    await outline('add "Meal" --note ":capture: Food/Monday"');
    await outline('set Meal ask "kcal"');
    await outline('capture "Oats" --template meal --set "kcal=300 kcal"');
    expect(await outlineWithoutBookmarks("show")).toBe("- Inbox\n  - call mum\n- Meal\n  :capture: Food/Monday\n  :ask: kcal\n- Food\n  - Monday\n    - Oats\n      :kcal: 300 kcal");
    await expect(outline('capture "x" --template nope')).rejects.toThrow(/no capture template named nope; there are Meal/);
  });

  it("fills the page a capture creates with the template's children, above the captured item", async () => {
    await outline('add "Day" --note ":capture: Plans/Today\n:at: top"');
    await outline('add "Stretch" --under Day');
    await outline('capture "call mum" --template day');
    await outline('capture "buy milk" --template day');
    expect(await outline("show Plans")).toBe("- Plans\n  - Today\n    - buy milk\n    - call mum\n    - Stretch");
  });

  it("picks a capture template by its key letter too", async () => {
    await outline('add "Meal" --note ":capture: Food"');
    await outline("set Meal key m");
    await outline('add "Idea" --note ":capture: Ideas"');
    await outline('capture "Oats" --template m');
    expect(await outline("show Food")).toBe("- Food\n  - Oats");
  });

  describe("writing a subtree", () => {
    it("prints every created item, indented, with its id", async () => {
      const printed = await outline("add -", "- Week\n  - Monday\n  - Tuesday\n- Notes");
      expect(await outlineWithoutBookmarks("show --ids")).toBe(printed);
      expect(printed.split("\n").map((line) => line.replace(/  \[\w+\]$/, ""))).toEqual(["- Week", "  - Monday", "  - Tuesday", "- Notes"]);
    });

    it("refuses a word before - and adds nothing", async () => {
      const id = await outline("add x");
      await expect(outline(`add ${id} -`, "- a")).rejects.toThrow(/--under/);
      await expect(outline("add foo -", "- a")).rejects.toThrow(/outline add - --under foo/);
      expect(await outlineWithoutBookmarks("show")).toBe("- x");
    });

    it("grafts a subtree under the item named by --under", async () => {
      const id = await outline("add x");
      await outline(`add - --under ${id}`, "- a\n  - b");
      expect(await outlineWithoutBookmarks("show")).toBe("- x\n  - a\n    - b");
    });

    it("keeps a quoted title ending in a dash", async () => {
      await outline('add "foo -"');
      expect(await outlineWithoutBookmarks("show")).toBe("- foo -");
    });

    it("prints the tree with --json", async () => {
      const trees = JSON.parse(await outline("add - --json", "- Week\n  - Monday\n- Notes"));
      expect(trees).toHaveLength(2);
      expect(trees[0]).toMatchObject({ text: "Week", path: [], children: [{ text: "Monday", path: ["Week"], children: [] }] });
    });

    it("reads a note and a title from stdin", async () => {
      const id = await outline("add Card");
      await outline(`note ${id} -`, "Line one.\nLine two.\n");
      await outline(`edit ${id} -`, "Renamed\n");
      expect(await outlineWithoutBookmarks("show")).toBe("- Renamed\n  Line one.\n  Line two.");
    });

    it("reads a title from stdin that ends in CRLF without the carriage return", async () => {
      const id = await outline("add Card");
      await outline(`edit ${id} -`, "Renamed\r\n");
      expect(await outlineWithoutBookmarks("show")).toBe("- Renamed");
    });

    it("refuses empty stdin and keeps the note, the title and the outline", async () => {
      const id = await outline("add Card --note Keep");
      for (const empty of ["", "\n", "  \n\n"]) {
        await expect(outline(`note ${id} -`, empty)).rejects.toThrow(/read nothing from stdin/);
        await expect(outline(`edit ${id} -`, empty)).rejects.toThrow(/read nothing from stdin/);
        await expect(outline("add -", empty)).rejects.toThrow(/read nothing from stdin/);
      }
      expect(await outlineWithoutBookmarks("show")).toBe("- Card\n  Keep");
    });

    it("still reads stdin padded with blank lines and still removes a note with an empty argument", async () => {
      const id = await outline("add Card --note Keep");
      await outline(`note ${id} -`, "\nKept\n\n");
      expect(await outlineWithoutBookmarks("show")).toBe("- Card\n  \n  Kept");
      await outline(`note ${id} ""`);
      expect(await outlineWithoutBookmarks("show")).toBe("- Card");
    });

    it("refuses a blank title", async () => {
      const id = await outline("add Card");
      await expect(outline(`edit ${id} " "`)).rejects.toThrow(/needs some text/);
      await expect(outline('add " "')).rejects.toThrow(/needs some text/);
      expect(await outlineWithoutBookmarks("show")).toBe("- Card");
    });

    it("refuses a title with a newline or over 200 characters, and points at children", async () => {
      const id = await outline("add Card");
      const message = /add - --under ITEM/;
      await expect(outline(`add "${"x".repeat(201)}"`)).rejects.toThrow(message);
      await expect(outline(`edit ${id} "${"x".repeat(201)}"`)).rejects.toThrow(message);
      await expect(outline(`edit ${id} -`, "one\ntwo")).rejects.toThrow(message);
      await expect(outline("add -", `- ${"x".repeat(201)}`)).rejects.toThrow(message);
      await expect(run(["add", "a\nb"], env).then((result) => { if (result.code) throw new Error(result.output); })).rejects.toThrow(message);
      await outline(`edit ${id} "${"x".repeat(200)}"`);
    });

    it("refuses list lines and headings in a note, with no way round it", async () => {
      const id = await outline("add Card");
      await expect(outline(`note ${id} -`, "Intro\n- one\n- two")).rejects.toThrow(/prose/);
      await expect(outline(`note ${id} -`, "1. one")).rejects.toThrow(/prose/);
      await expect(outline(`note ${id} -`, "# Title")).rejects.toThrow(/prose/);
      await expect(outline(`note ${id} - --force`, "- one")).rejects.toThrow(/prose/);
      await expect(outline(`add Other --note "- one"`)).rejects.toThrow(/prose/);
      expect(await outlineWithoutBookmarks("show")).toBe("- Card");
    });

    it("lets a note hold code fences and attachment links", async () => {
      const id = await outline("add Card");
      const note = "Run it:\n```\n- not a list\n# not a heading\n```\n![shot.png](att:" + "a".repeat(64) + ")";
      await outline(`note ${id} -`, note);
      expect(JSON.parse(await outline(`show ${id} --json`)).note).toBe(note);
    });

    it("keeps a fence's lines in the note when add - reads them", async () => {
      await outline("add -", "- Recipe\n  ```\n  - not an item\n  ```\n- Next");
      expect(await outlineWithoutBookmarks("show")).toBe("- Recipe\n  ```\n  - not an item\n  ```\n- Next");
    });

    it("repeats the writing rules under add in the help", async () => {
      expect(await outline("help")).toMatch(/Writing rules:[\s\S]*list is children[\s\S]*edit ITEM TEXT/);
    });
  });

  describe("adding one item", () => {
    it("refuses an item's id as the first word and adds nothing", async () => {
      const id = await outline("add x");
      await expect(outline(`add ${id} "a b"`)).rejects.toThrow(
        new Error(`outline: add takes the parent in --under, not as the first word: outline add 'a b' --under ${id}`),
      );
      expect(await outlineWithoutBookmarks("show")).toBe("- x");
    });

    it("refuses an item's path as the first word and adds nothing", async () => {
      await outline("add Projects");
      await outline("add Garden --under Projects");
      await expect(outline("add Projects/Garden Shed")).rejects.toThrow(
        new Error("outline: add takes the parent in --under, not as the first word: outline add 'Shed' --under Projects/Garden"),
      );
      expect(await outlineWithoutBookmarks("show")).toBe("- Projects\n  - Garden");
    });

    it("keeps an id as text when --under names the parent", async () => {
      const id = await outline("add x");
      const other = await outline("add y");
      await outline(`add ${id} a --under ${other}`);
      expect(await outlineWithoutBookmarks("show")).toBe(`- x\n- y\n  - ${id} a`);
    });

    it("keeps a first word that only matches a title as text", async () => {
      await outline("add Inbox");
      await outline("add Inbox zero");
      expect(await outlineWithoutBookmarks("show")).toBe("- Inbox\n- Inbox zero");
    });

    it("keeps a first word that is a built-in item's word id as text", async () => {
      await outline("add root cause");
      await outline("add settings page");
      expect(await outlineWithoutBookmarks("show")).toBe("- root cause\n- settings page");
    });

    it("keeps a first word with a slash that only starts a title as text", async () => {
      await outline("add Work");
      await outline("add w/ Anna");
      expect(await outlineWithoutBookmarks("show")).toBe("- Work\n- w/ Anna");
    });

    it("prints the --under form shell-quoted, so pasting it adds the same text", async () => {
      await outline("add Projects");
      await outline('add "My Garden" --under Projects');
      const result = await run(["add", "Projects/My Garden", `it's "$HOME"`], env, "");
      expect(result).toEqual({
        code: 1,
        output: `outline: add takes the parent in --under, not as the first word: outline add 'it'\\''s "$HOME"' --under 'Projects/My Garden'`,
      });
      expect(await outlineWithoutBookmarks("show")).toBe("- Projects\n  - My Garden");
    });

    it("prints the - form with every other word as the parent, shell-quoted", async () => {
      await outline("add Projects");
      await outline('add "My Garden" --under Projects');
      const refusal = (parent: string) => `outline: add reads a subtree with "-" alone; put the parent in --under: outline add - --under ${parent}`;
      expect(await run(["add", "Projects/My Garden", "-"], env, "- a")).toEqual({ code: 1, output: refusal("'Projects/My Garden'") });
      expect(await run(["add", "Projects/My", "Garden", "-"], env, "- a")).toEqual({ code: 1, output: refusal("'Projects/My Garden'") });
      expect(await run(["add", "-", "Projects"], env, "- a")).toEqual({ code: 1, output: refusal("Projects") });
      expect(await run(["add", "=todo/Home", "-"], env, "- a")).toEqual({ code: 1, output: refusal("'=todo/Home'") });
      expect(await outlineWithoutBookmarks("show")).toBe("- Projects\n  - My Garden");
    });

    it("carries --note, --first and --json into the --under form", async () => {
      const id = await outline("add Projects");
      const result = await run(["add", id, "Buy", "seeds", "--note", "by Friday's market", "--first", "--json"], env, "");
      expect(result).toEqual({
        code: 1,
        output: `outline: add takes the parent in --under, not as the first word: outline add 'Buy seeds' --under ${id} --note 'by Friday'\\''s market' --first --json`,
      });
      expect(await outlineWithoutBookmarks("show")).toBe("- Projects");
    });

    it("carries --first and --json into the - form, and leaves out --note, which a subtree does not read", async () => {
      const result = await run(["add", "Projects", "-", "--note", "due Friday", "--first", "--json"], env, "- a");
      expect(result).toEqual({
        code: 1,
        output: `outline: add reads a subtree with "-" alone; put the parent in --under: outline add - --under Projects --first --json`,
      });
    });

    it("keeps the placement given in the - form instead of making the other words the parent", async () => {
      const refusal = (placement: string) => `outline: add reads a subtree with "-" alone; put the parent in --under: outline add - ${placement}`;
      expect(await run(["add", "foo", "-", "--under", "My Projects"], env, "- a")).toEqual({ code: 1, output: refusal("--under 'My Projects'") });
      expect(await run(["add", "Garden", "-", "--after", "x1"], env, "- a")).toEqual({ code: 1, output: refusal("--after x1") });
      expect(await run(["add", "Garden", "-", "--before", "x1"], env, "- a")).toEqual({ code: 1, output: refusal("--before x1") });
    });

    it("prints the - form alone when every word is a dash", async () => {
      expect(await run(["add", "-", "-"], env, "- a")).toEqual({
        code: 1,
        output: `outline: add reads a subtree with "-" alone; put the parent in --under: outline add -`,
      });
    });
  });

  it("makes Settings with Bookmarks and Capture templates on first run, once, and keeps them", async () => {
    await outline("show");
    await outline('add "Garden"');
    expect(await outline("find Bookmarks --ids")).toMatch(/^bookmarks {2}Settings \/ Bookmarks\nabout-bookmarks {2}Settings \/ Bookmarks \/ About Bookmarks$/);
    expect(await outline("find Capture templates --ids")).toMatch(/^capture-templates {2}Settings \/ Capture templates\nabout-capture-templates {2}Settings \/ Capture templates \/ About Capture templates$/);
    expect(await outline("show settings")).toMatch(/^- Settings\n {2}- Bookmarks\n(.*\n)*? {2}- Capture templates\n {4}:columns: capture key\n {4}- About Capture templates\n/);
    await outline('add "Plan" --under bookmarks');
    await expect(outline("rm bookmarks")).rejects.toThrow("Bookmarks stays; empty it instead");
    await expect(outline("rm about-bookmarks")).rejects.toThrow("About Bookmarks is read-only");
    await expect(outline("rm about-bookmarks-1")).rejects.toThrow("About Bookmarks is read-only");
    await expect(outline("move about-bookmarks --under Garden")).rejects.toThrow("About Bookmarks is read-only");
    await expect(outline("move about-bookmarks --under root")).rejects.toThrow("About Bookmarks is read-only");
    await expect(outline("move bookmarks --under Garden")).rejects.toThrow("Bookmarks stays; empty it instead");
    await expect(outline("move bookmarks --under root")).rejects.toThrow("Bookmarks stays; empty it instead");
    await expect(outline("move capture-templates --under root")).rejects.toThrow("Capture templates stays; empty it instead");
    await expect(outline("rm settings")).rejects.toThrow("Settings stays; empty it instead");
    await outline("move Garden --before settings");
    await outline("move settings --before Garden");
    expect((await outline("show --json").then(JSON.parse)).children.map((child: { id: string }) => child.id)[0]).toBe("settings");
    expect(await outline("show bookmarks")).toMatch(/^- Bookmarks\n {2}:columns: key\n {2}- About Bookmarks\n(.*\n)*? {2}- Plan$/);
  });

  it("refuses to change what Bookmarks and About Bookmarks fix, and keeps the rest editable", async () => {
    await outline("show");
    await expect(outline("edit bookmarks x")).rejects.toThrow("Bookmarks is read-only");
    await expect(outline("note bookmarks x")).rejects.toThrow("Bookmarks is read-only");
    await expect(outline("done bookmarks")).rejects.toThrow("Bookmarks is read-only");
    await expect(outline("edit about-bookmarks x")).rejects.toThrow("About Bookmarks is read-only");
    await expect(outline("edit about-bookmarks-1-1 x")).rejects.toThrow("About Bookmarks is read-only");
    await expect(outline("set about-bookmarks-1 key 1")).rejects.toThrow("About Bookmarks is read-only");
    await expect(outline('add "x" --under about-bookmarks-1')).rejects.toThrow("About Bookmarks is read-only");
    await outline("set bookmarks columns");
    await outline("show");
    expect(await outline("show bookmarks")).not.toContain(":columns:");
  });

  it("refuses to change what Settings and Capture templates fix", async () => {
    await outline("show");
    await expect(outline("edit capture-templates x")).rejects.toThrow("Capture templates is read-only");
    await expect(outline("edit settings x")).rejects.toThrow("Settings is read-only");
    await expect(outline("edit about-capture-templates-1 x")).rejects.toThrow("About Capture templates is read-only");
    await expect(outline("rm capture-templates")).rejects.toThrow("Capture templates stays; empty it instead");
    expect(await outline("show capture-templates")).toContain("- About Capture templates");
  });

  it("prints the tree as JSON with ids", async () => {
    await outline('add "a" --note "about a"');
    const tree = JSON.parse(await outline("show --json"));
    expect(tree.children[0]).toMatchObject({ id: "settings", text: "Settings" });
    expect(tree.children[1]).toMatchObject({ text: "a", note: "about a", children: [] });
    expect(tree.children[1].id).toMatch(/\w+/);
  });

  it("deletes items and exports what is left", async () => {
    await outline('add "keep"');
    await outline('add "drop"');
    await outline("rm drop");
    expect(await outlineWithoutBookmarks("export --md")).toBe("- keep");
    expect(await outline("export --opml")).toContain('<outline text="keep"/>');
  });

  it("explains what went wrong", async () => {
    await outline('add "Garden"');
    await outline('add "Gardening"');
    await expect(outline("done Gard")).rejects.toThrow(/matches 2 items/);
    await expect(outline("done Nothing")).rejects.toThrow(/no item "Nothing"/);
    await expect(outline("frobnicate")).rejects.toThrow(/unknown command/);
    const wrongToken = await run(["show"], { ...env, OUTLINE_TOKEN: "wrong" });
    expect(wrongToken).toEqual({ output: "outline: the server refused the token", code: 1 });
  });

  it("sets properties and shows them as a table with sums on parents", async () => {
    await outline('add "Monday"');
    await outline('add "Breakfast" --under Monday');
    await outline('add "Oats" --under Monday/Breakfast');
    await outline('add "Coffee" --under Monday/Breakfast');
    await outline('set Monday/Breakfast/Oats calories 300 kcal');
    await outline('set Monday/Breakfast/Coffee calories 20 kcal');
    await outline('set Monday/Breakfast/Coffee effort 5m');
    expect(await outline("show Monday --columns")).toBe(
      [
        "              calories   effort",
        "Monday        320 kcal       5m",
        "  Breakfast   320 kcal       5m",
        "    Oats      300 kcal",
        "    Coffee     20 kcal       5m",
      ].join("\n"),
    );
    const tree = JSON.parse(await outline("show Monday --columns --json"));
    expect(tree.columns).toEqual({ calories: "320 kcal", effort: "5m" });
    expect(tree.children[0].children[0].properties).toEqual({ calories: "300 kcal" });

    await outline("set Monday/Breakfast/Coffee effort");
    expect(await outline("show Monday/Breakfast/Coffee")).toBe("- Coffee\n  :calories: 20 kcal");
  });

  it("refuses a value that breaks a Checks: child, in set and in capture --set", async () => {
    await outline('add "TODO:"');
    const checks = await outline('add "Checks:" --under TODO:');
    const effort = await outline(`add "effort: one of" --under ${checks}`);
    for (const value of ["low", "high"]) await outline(`add ${value} --under ${effort}`);
    const fix = await outline('add "Fix it" --under TODO:');

    await outline(`set ${fix} effort low`);
    const refused = await run(splitArgs(`set ${fix} effort huge`), env);
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain("effort must be one of low, high");
    expect(await outline(`show ${fix}`)).toContain(":effort: low");
  });

  it("keeps the table aligned with wide characters", async () => {
    await outline('add "日本語"');
    await outline('add "plain"');
    await outline("set 日本語 n 1");
    await outline("set plain n 22");
    const [, wide, plain] = (await outlineWithoutBookmarks("show --columns")).split("\n");
    const width = (line: string) => [...line].reduce((sum, char) => sum + (/[　-鿿]/.test(char) ? 2 : 1), 0);
    expect(width(wide)).toBe(width(plain));
  });

  it("merges with what other clients changed in the meantime", async () => {
    const id = await outline('add "shared"');
    await outline(`note ${id} "from one client"`);
    await outline(`edit ${id} "renamed by another"`);
    expect(await outlineWithoutBookmarks("show")).toBe("- renamed by another\n  from one client");
  });

  it("watches changes made by others from now on, one JSON line each in the shapes plugins get", async () => {
    await outline('add "Board"');
    const doing = await outline('add "Doing" --under Board');
    const done = await outline('add "Done" --under Board');
    const card = await outline('add "card" --under Board/Doing');
    const lines: string[] = [];
    const stop = new AbortController();
    const watching = run(["watch", "--json", "--every", "0.05"], env, "", { print: (line) => lines.push(line), signal: stop.signal });
    await new Promise((resolve) => setTimeout(resolve, 200));

    await outline(`move ${card} --under ${done}`);
    await outline(`done ${card}`);
    await outline(`edit ${card} "card 2"`);
    const added = await outline(`add "new" --under ${done}`);
    await vi.waitFor(() => expect(lines).toHaveLength(4), { timeout: 3000 });
    stop.abort();
    expect(await watching).toEqual({ output: "", code: 0 });

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { event: "moved", id: card, from: doing, to: done },
      { event: "completed", id: card, from: null, to: null },
      { event: "changed", id: card, from: null, to: null },
      { event: "added", id: added, from: null, to: done },
    ]);
  });

  it("watches in words without --json", async () => {
    await outline('add "Inbox"');
    const lines: string[] = [];
    const stop = new AbortController();
    const watching = run(["watch", "--every", "0.05"], env, "", { print: (line) => lines.push(line), signal: stop.signal });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const id = await outline('add "Pay rent" --under Inbox');
    await vi.waitFor(() => expect(lines).toEqual([`added ${id}  Pay rent  under Inbox`]), { timeout: 3000 });
    stop.abort();
    await watching;
  });

  it("says nothing of private items, which stay sealed to it", async () => {
    await outline('add "Journal"');
    const lines: string[] = [];
    const stop = new AbortController();
    const watching = run(["watch", "--json", "--every", "0.05"], env, "", { print: (line) => lines.push(line), signal: stop.signal });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await outline(`note Journal "🔒private:1:personal:${"A".repeat(40)}"`);
    const plain = await outline('add "Shopping"');
    await vi.waitFor(() => expect(lines.map((line) => JSON.parse(line).id)).toEqual([plain]), { timeout: 3000 });
    stop.abort();
    await watching;
  });
});
