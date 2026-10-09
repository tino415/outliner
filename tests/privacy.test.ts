import { describe, expect, it } from "vitest";
import { Doc, ROOT, emptyDoc, insertChild, makePublic, moveTo, remove, setItemProperty, setText, withPrivateIds } from "../src/model";
import { setNoteAsTyped as setNote } from "./typed";
import { parseIndentedText } from "../src/transfer";
import { Change, Replica, diff, materialize, merge } from "../src/sync/replica";
import { keyFromText, keyText, mergeIncoming, newKey, openIncoming, sealOutgoing, sealedIn } from "../src/sync/privacy";

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
    expect(mac.doc().items[macJournal].note).toBe("my diary");
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

  it("publish everything inside when the item is made public again", async () => {
    const phone = device("phone", journal());
    const first = await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const changes = phone.edit(makePublic(phone.doc(), idOf(phone.doc(), "Journal")));
    const { changes: sent } = await sealOutgoing(changes, phone.replica, keyring, phone.stamp);
    const cli = device("cli");
    cli.receive(first.changes);
    cli.receive(sent);
    expect(Object.values(cli.doc().items).map((item) => item.text)).toEqual(expect.arrayContaining(["secret one", "secret two"]));
    expect(cli.doc().items[idOf(cli.doc(), "Journal")].note).toBe("my diary");
  });

  it.each(["", "another"])("stay sealed while the private property is removed or names a key this device lacks: %j", async (key) => {
    const phone = device("phone", journal());
    await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const journalId = idOf(phone.doc(), "Journal");
    const changes = phone.edit(withPrivateIds(setItemProperty(phone.doc(), journalId, "private", key)).doc);
    const { changes: sent, held } = await sealOutgoing(changes, phone.replica, keyring, phone.stamp);
    expect(JSON.stringify(sent)).not.toContain("secret");
    expect(JSON.stringify(sent)).not.toContain("diary");
    expect(held.length).toBeGreaterThan(0);
  });

  it("keep a newer note of the private item when an older seal arrives", async () => {
    const phone = device("phone", journal());
    const first = await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const mac = device("mac");
    await mergeIncoming(mac.replica, first.changes, keyring);
    mac.receive([]);
    const journalId = idOf(phone.doc(), "Journal");
    phone.edit(setNote(phone.doc(), journalId, ":private: personal\nnewer note"));
    const onMac = mac.edit(setText(mac.doc(), idOf(mac.doc(), "secret two"), "secret two, from the Mac"));
    const fromMac = await sealOutgoing(onMac, mac.replica, keyring, mac.stamp);
    await mergeIncoming(phone.replica, fromMac.changes, keyring);
    phone.receive([]);
    expect(phone.doc().items[journalId].note).toBe("newer note");
    expect(Object.values(phone.doc().items).map((item) => item.text)).toContain("secret two, from the Mac");
  });

  it("asks to seal again when a seal arrives without what this device has newer", async () => {
    const phone = device("phone", journal());
    const first = await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const mac = device("mac");
    await mergeIncoming(mac.replica, first.changes, keyring);
    mac.receive([]);
    const onMac = mac.edit(setText(mac.doc(), idOf(mac.doc(), "secret one"), "secret one, from the Mac"));
    await sealOutgoing(onMac, mac.replica, keyring, mac.stamp);
    const onPhone = phone.edit(setText(phone.doc(), idOf(phone.doc(), "secret two"), "secret two, from the phone"));
    const fromPhone = await sealOutgoing(onPhone, phone.replica, keyring, phone.stamp);
    const { reseal } = await mergeIncoming(mac.replica, fromPhone.changes, keyring);
    expect(reseal).toEqual([idOf(mac.doc(), "Journal")]);
    const { reseal: nothing } = await mergeIncoming(phone.replica, fromPhone.changes, keyring);
    expect(nothing).toEqual([]);
  });

  it("keeps a private item with only a note sealed when its private property is removed", async () => {
    let doc = parseIndentedText("Journal");
    doc = setNote(doc, idOf(doc, "Journal"), ":private: personal\nmy diary");
    const phone = device("phone", doc);
    const first = await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const known = new Set(first.sealed);
    const changes = phone.edit(setItemProperty(phone.doc(), idOf(phone.doc(), "Journal"), "private", ""));
    const { changes: sent, held } = await sealOutgoing(changes, phone.replica, keyring, phone.stamp, known);
    expect(JSON.stringify(sent)).not.toContain("diary");
    expect(held.length).toBeGreaterThan(0);
  });

  it("counts :Private: written with capitals", async () => {
    let doc = parseIndentedText("Journal");
    doc = setNote(doc, idOf(doc, "Journal"), ":Private: personal\nmy diary");
    const phone = device("phone", doc);
    const { changes } = await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    expect(JSON.stringify(changes)).not.toContain("diary");
  });

  it("refuses a sealed note it cannot open with its own key of that name, instead of taking it as text", async () => {
    const phone = device("phone", journal());
    const first = await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const mac = device("mac", phone.doc());
    const journalId = idOf(mac.doc(), "Journal");
    const { unreadable } = await mergeIncoming(mac.replica, first.changes, { personal: newKey() });
    mac.receive([]);
    expect(unreadable).toEqual([journalId]);
    expect(mac.doc().items[journalId].note).toBe("my diary");
  });

  it("reports items found inside an item this device made public, so they can be published", async () => {
    const phone = device("phone", journal());
    const first = await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const mac = device("mac");
    await mergeIncoming(mac.replica, first.changes, keyring);
    mac.receive([]);
    const journalId = idOf(phone.doc(), "Journal");
    phone.edit(makePublic(phone.doc(), journalId));
    const added = mac.edit(insertChild(mac.doc(), journalId, 0, "added on the Mac").doc);
    const fromMac = await sealOutgoing(added, mac.replica, keyring, mac.stamp);
    const { stranded } = await mergeIncoming(phone.replica, fromMac.changes, keyring, new Set());
    expect(stranded).toEqual([journalId]);
  });

  it("does not blank an item deleted after it was moved out of a private item", async () => {
    let doc = parseIndentedText("Journal\n  kept");
    doc = withPrivateIds(setNote(doc, idOf(doc, "Journal"), ":private: personal")).doc;
    const phone = device("phone", doc);
    await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const out = phone.edit(withPrivateIds(moveTo(phone.doc(), idOf(phone.doc(), "kept"), ROOT, 0)).doc);
    await sealOutgoing(out, phone.replica, keyring, phone.stamp);
    const kept = idOf(phone.doc(), "kept");
    const gone = phone.edit(remove(phone.doc(), kept));
    const { changes } = await sealOutgoing(gone, phone.replica, keyring, phone.stamp);
    expect(changes).not.toContainEqual(expect.objectContaining({ item: kept, field: "text", value: "" }));
  });

  it("does not loop on a parent cycle left by crossing moves", async () => {
    const replica: Replica = {};
    merge(replica, [
      { item: "a", field: "parent", value: "b", clock: "1" },
      { item: "b", field: "parent", value: "a", clock: "1" },
      { item: "a", field: "text", value: "x", clock: "2" },
    ]);
    const { changes } = await sealOutgoing([{ item: "a", field: "text", value: "x", clock: "2" }], replica, keyring, stamper("cycle"));
    expect(changes).toHaveLength(1);
  });

  it("does not send what was written under an item before it was made private", async () => {
    const base = parseIndentedText("Journal\n  written offline");
    const phone = device("phone");
    const before = phone.edit(base);
    const made = withPrivateIds(setNote(base, idOf(base, "Journal"), ":private: personal")).doc;
    const after = phone.edit(made);
    const { changes } = await sealOutgoing([...before, ...after], phone.replica, keyring, phone.stamp);
    expect(JSON.stringify(changes)).not.toContain("written offline");
  });

  it("blanks the old id of an item moved from one private item into another", async () => {
    let doc = parseIndentedText("Journal\n  kept\nWork");
    doc = withPrivateIds(setNote(doc, idOf(doc, "Journal"), ":private: personal")).doc;
    const phone = device("phone", doc);
    await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const kept = idOf(phone.doc(), "kept");
    const out = phone.edit(withPrivateIds(moveTo(phone.doc(), kept, ROOT, 0)).doc);
    await sealOutgoing(out, phone.replica, keyring, phone.stamp);
    const publicId = idOf(phone.doc(), "kept");
    const work = idOf(phone.doc(), "Work");
    const into = phone.edit(withPrivateIds(moveTo(setNote(phone.doc(), work, ":private: personal"), publicId, work, 0)).doc);
    const { changes } = await sealOutgoing(into, phone.replica, keyring, phone.stamp);
    expect(changes).toContainEqual(expect.objectContaining({ item: publicId, field: "text", value: "" }));
  });

  it("finds the sealed notes in a replica to open once a key is added", async () => {
    const phone = device("phone", journal());
    const { changes } = await sealOutgoing(allOf(phone.replica), phone.replica, keyring, phone.stamp);
    const later = device("later");
    later.receive(await openIncoming(changes, {}));
    await mergeIncoming(later.replica, sealedIn(later.replica), keyring);
    later.receive([]);
    expect(Object.values(later.doc().items).map((item) => item.text)).toContain("secret two");
    expect(later.doc().items[ROOT].children).toHaveLength(2);
    expect(later.doc().items[idOf(later.doc(), "Journal")].note).toBe("my diary");
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
