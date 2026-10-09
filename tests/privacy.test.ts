import { describe, expect, it } from "vitest";
import { Doc, ROOT, emptyDoc, setNote, setText, withPrivateIds } from "../src/model";
import { parseIndentedText } from "../src/transfer";
import { Change, Replica, diff, materialize, merge } from "../src/sync/replica";
import { keyFromText, keyText, newKey, openIncoming, sealOutgoing, sealedIn } from "../src/sync/privacy";

function idOf(doc: Doc, text: string) {
  return Object.values(doc.items).find((item) => item.text === text)!.id;
}

let tick = 0;

function stamper(device: string) {
  return () => `${String(++tick).padStart(6, "0")}-${device}`;
}

/** A device: its replica, a clock, and the outline as it shows it. */
function device(name: string, doc: Doc = emptyDoc()) {
  const replica: Replica = {};
  const stamp = stamper(name);
  let shown = emptyDoc();
  const edit = (next: Doc): Change[] => {
    const changes = diff(shown, next, replica, stamp);
    merge(replica, changes);
    shown = materialize(replica);
    return changes;
  };
  const receive = (changes: Change[]) => {
    merge(replica, changes);
    shown = materialize(replica);
  };
  edit(doc);
  return { replica, stamp, edit, receive, doc: () => shown };
}

const keyring = { personal: newKey() };

function journal(): Doc {
  let doc = parseIndentedText("Journal\n  secret one\n  secret two\nShopping");
  doc = setNote(doc, idOf(doc, "Journal"), ":private: personal\nmy diary");
  return withPrivateIds(doc).doc;
}

describe("private items at the sync boundary", () => {
  it("send one sealed note for the private item and nothing readable from inside it", async () => {
    const phone = device("phone", journal());
    const { changes, held } = await sealOutgoing(Object.values(phone.replica).length ? allOf(phone.replica) : [], phone.replica, keyring, phone.stamp);
    expect(held).toEqual([]);
    const sent = JSON.stringify(changes);
    expect(sent).not.toContain("secret");
    expect(sent).not.toContain("my diary");
    expect(sent).toContain("Shopping");
    expect(sent).toContain("Journal");
    const sealedNotes = changes.filter((change) => change.field === "note" && String(change.value).startsWith("🔒private:1:personal:"));
    expect(sealedNotes).toHaveLength(1);
  });

  it("open on a device with the key, and stay sealed on one without", async () => {
    const phone = device("phone", journal());
    const { changes } = await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);

    const mac = device("mac");
    mac.receive(await openIncoming(changes, keyring));
    const macJournal = idOf(mac.doc(), "Journal");
    expect(mac.doc().items[macJournal].note).toBe(":private: personal\nmy diary");
    expect(mac.doc().items[macJournal].children.map((id) => mac.doc().items[id].text)).toEqual(["secret one", "secret two"]);

    const cli = device("cli");
    cli.receive(await openIncoming(changes, {}));
    const cliJournal = idOf(cli.doc(), "Journal");
    expect(cli.doc().items[cliJournal].note).toMatch(/^🔒private:1:personal:/);
    expect(cli.doc().items[cliJournal].children).toEqual([]);
  });

  it("hold back private changes when this device has no key for them", async () => {
    const phone = device("phone", journal());
    const { changes, held } = await sealOutgoing(allOf(phone.replica), phone.replica, {}, phone.stamp);
    expect(JSON.stringify(changes)).not.toContain("secret");
    expect(held.length).toBeGreaterThan(0);
  });

  it("keep edits two devices made to different items inside", async () => {
    const phone = device("phone", journal());
    const first = await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const mac = device("mac");
    mac.receive(await openIncoming(first.changes, keyring));

    const onPhone = phone.edit(setText(phone.doc(), idOf(phone.doc(), "secret one"), "secret one, edited on the phone"));
    const onMac = mac.edit(setText(mac.doc(), idOf(mac.doc(), "secret two"), "secret two, edited on the Mac"));
    const fromPhone = await sealOutgoing(onPhone, phone.replica, keyring, phone.stamp);
    const fromMac = await sealOutgoing(onMac, mac.replica, keyring, mac.stamp);
    mac.receive(await openIncoming(fromPhone.changes, keyring));
    phone.receive(await openIncoming(fromMac.changes, keyring));

    for (const each of [phone, mac]) {
      const texts = Object.values(each.doc().items).map((item) => item.text);
      expect(texts).toContain("secret one, edited on the phone");
      expect(texts).toContain("secret two, edited on the Mac");
    }
  });

  it("blank the old text of items renamed when their subtree was made private", async () => {
    const base = parseIndentedText("Journal\n  was public");
    const phone = device("phone", base);
    const made = withPrivateIds(setNote(base, idOf(base, "Journal"), ":private: personal")).doc;
    const changes = phone.edit(made);
    const { changes: sent } = await sealOutgoing(changes, phone.replica, keyring, phone.stamp);
    const old = idOf(base, "was public");
    expect(sent).toContainEqual(expect.objectContaining({ item: old, field: "deleted", value: true }));
    expect(sent).toContainEqual(expect.objectContaining({ item: old, field: "text", value: "" }));
    expect(JSON.stringify(sent)).not.toContain("was public");
  });

  it("finds the sealed notes in a replica to open once a key is added", async () => {
    const phone = device("phone", journal());
    const { changes } = await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const later = device("later");
    later.receive(await openIncoming(changes, {}));
    later.receive(await openIncoming(sealedIn(later.replica), keyring));
    expect(Object.values(later.doc().items).map((item) => item.text)).toContain("secret two");
    expect(later.doc().items[ROOT].children).toHaveLength(2);
    expect(later.doc().items[idOf(later.doc(), "Journal")].note).toBe(":private: personal\nmy diary");
  });

  it("writes a key as one line to copy to another device", () => {
    const key = newKey();
    expect(keyFromText(keyText("personal", key))).toEqual({ name: "personal", key });
    expect(keyFromText("something else")).toBeNull();
  });
});

function allOf(replica: Replica): Change[] {
  return Object.entries(replica).flatMap(([item, fields]) => Object.entries(fields).map(([field, written]) => ({ item, field, ...written }) as Change));
}
