import { describe, expect, it } from "vitest";
import { setNoteAsTyped as setNote } from "./typed";
import { parseIndentedText } from "../src/transfer";
import { approvalOf, codeOf, isApproved, listenedEvents, pluginsIn } from "../src/plugins";
import { newKey } from "../src/sync/privacy";

const CODE = 'outline.command("Shout", async (item) => outline.setText(item.id, item.text.toUpperCase()));\n';

function withPlugin(note: string) {
  const doc = parseIndentedText("Shout\nother");
  return setNote(doc, doc.items.root.children[0], note);
}

describe("plugins", () => {
  it("are items with :plugin: and a js block in the note", () => {
    const [plugin] = pluginsIn(withPlugin(`:plugin: shout\n\`\`\`js\n${CODE}\`\`\``));
    expect(plugin).toMatchObject({ name: "shout", code: CODE, approval: null });
    expect(pluginsIn(withPlugin(":plugin: shout\nno code"))).toEqual([]);
    expect(codeOf("```javascript\nx()\n```")).toBe("x()\n");
  });

  it("run only with an approval made by a trusted device for exactly this code", async () => {
    const trust = newKey();
    const approval = await approvalOf(CODE, trust);
    const [approved] = pluginsIn(withPlugin(`:plugin: shout\n:approved: ${approval}\n\`\`\`js\n${CODE}\`\`\``));
    expect(await isApproved(approved, trust)).toBe(true);
    expect(await isApproved(approved, undefined)).toBe(false);
    expect(await isApproved(approved, newKey())).toBe(false);
    const [changed] = pluginsIn(withPlugin(`:plugin: shout\n:approved: ${approval}\n\`\`\`js\n${CODE}fetch("x")\n\`\`\``));
    expect(await isApproved(changed, trust)).toBe(false);
  });

  it("show which events they listen to, read from the code before it runs", () => {
    expect(listenedEvents('outline.on("moved", f); outline.on( \'added\', g); outline.on("moved", h)')).toEqual(["moved", "added"]);
    expect(listenedEvents(CODE)).toEqual([]);
  });
});
