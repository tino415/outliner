import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { createSyncServer } from "../server/app";
import { Store } from "../server/store";
import { run } from "../cli/run";

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

function splitArgs(command: string): string[] {
  return [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]);
}

describe("outline CLI", () => {
  it("adds items, nests them by path and shows the outline", async () => {
    await outline('add "Projects"');
    await outline('add "Garden" --under Projects');
    await outline('add "Plant tomatoes" --under "Projects/Garden"');
    await outline('add "Inbox" --first');
    expect(await outline("show")).toBe("- Inbox\n- Projects\n  - Garden\n    - Plant tomatoes");
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
    expect(await outline("show")).toBe("- Projects\n- Shopping\n  - ~~Buy tomato seeds~~");
  });

  it("adds items before or after another, beside it", async () => {
    await outline('add "Projects"');
    await outline('add "Garden" --under Projects');
    await outline('add "House" --under Projects');
    await outline('add "Car" --before Projects/House');
    await outline('add "Bike" --after Projects/House');
    await outline('add "Inbox" --before Projects');
    await outline("add - --after Projects/Garden", "- Shed\n  - Tools");
    expect(await outline("show")).toBe(
      "- Inbox\n- Projects\n  - Garden\n  - Shed\n    - Tools\n  - Car\n  - House\n  - Bike",
    );
  });

  it("moves items before or after another, across parents and within one", async () => {
    await outline('add "a"');
    await outline('add "b"');
    await outline('add "c"');
    await outline('add "x" --under b');
    await outline("move a --after c");
    expect(await outline("show")).toBe("- b\n  - x\n- c\n- a");
    await outline("move a --before b");
    expect(await outline("show")).toBe("- a\n- b\n  - x\n- c");
    await outline("move c --before b/x");
    expect(await outline("show")).toBe("- a\n- b\n  - c\n  - x");
    await outline("move b/x --after a");
    expect(await outline("show")).toBe("- a\n- x\n- b\n  - c");
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
    expect(await outline("show")).toBe("- a\n  - b\n- c");
  });

  it("reads indented lines from stdin", async () => {
    const ids = JSON.parse(await outline("add - --json", "- Week\n  - Monday\n  - Tuesday\n- Notes"));
    expect(ids).toHaveLength(2);
    expect(await outline("show")).toBe("- Week\n  - Monday\n  - Tuesday\n- Notes");
  });

  it("prints the tree as JSON with ids", async () => {
    await outline('add "a" --note "about a"');
    const tree = JSON.parse(await outline("show --json"));
    expect(tree.children[0]).toMatchObject({ text: "a", note: "about a", children: [] });
    expect(tree.children[0].id).toMatch(/\w+/);
  });

  it("deletes items and exports what is left", async () => {
    await outline('add "keep"');
    await outline('add "drop"');
    await outline("rm drop");
    expect(await outline("export --md")).toBe("- keep");
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
    expect(await outline("show --columns")).toBe(
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

  it("keeps the table aligned with wide characters", async () => {
    await outline('add "日本語"');
    await outline('add "plain"');
    await outline("set 日本語 n 1");
    await outline("set plain n 22");
    const [, wide, plain] = (await outline("show --columns")).split("\n");
    const width = (line: string) => [...line].reduce((sum, char) => sum + (/[　-鿿]/.test(char) ? 2 : 1), 0);
    expect(width(wide)).toBe(width(plain));
  });

  it("merges with what other clients changed in the meantime", async () => {
    const id = await outline('add "shared"');
    await outline(`note ${id} "from one client"`);
    await outline(`edit ${id} "renamed by another"`);
    expect(await outline("show")).toBe("- renamed by another\n  from one client");
  });
});
