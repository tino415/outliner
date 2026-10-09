# 29. Private items are sealed whole at the sync boundary

- **Status:** accepted, 2026-10-09
- **Applies to:** `src/sync/privacy.ts`, `withPrivateIds` in `src/model.ts`, `src/keyring.ts`, `src/privateItems.ts`, `roundTrip` in `src/syncing.ts`, the CLI's `writable`
- **Decides:** [doc/design/encrypted-items.md](../design/encrypted-items.md), with Martin's answers in the outline (Outliner/TODO/Encrypted nodes)

## Context

Martin wants personal notes that his phone and Mac can read and that the
CLI, agents and the server cannot. His answers to the design note: the
private item's headline stays readable; devices without the key see
neither the text nor the shape of what is under it; they cannot add to it
either; keys stay unlocked on a device; each heading can have its own key,
copied between devices by hand; no recovery key. A link into a private
subtree has to be recognisable as such, not look like a link to a deleted
item.

## Decision

**An item is private when its note says `:private: <key>`.** Alt-Shift-P or
the item menu sets it, offering this device's keys or a new one.

**The local replica keeps private items open; the sync boundary seals
them.** `sealOutgoing` holds back every change inside a private item and
sends instead one value for the item's note: `🔒private:1:<key>:<base64>`,
the JSON of every field inside with its clock, gzipped and encrypted with
AES-GCM under the key, with the item's id as associated data. The server,
the protocol and the CLI see an ordinary note.

**A device with the key opens the sealed note back into fields**
(`mergeIncoming`) and merges them by their own clocks like any other
change. When what arrived lacks something the device has newer, it seals
again, so two devices editing different items inside both end up with
both edits, on the server too, although the server keeps only the latest
sealed note.

**An item stays private while its note has a `:private:` line, with any
value, or it still holds items with its `~` ids.** Retyping or breaking the
line therefore holds what is inside on the device (with a status message)
instead of publishing it. Only Make public again, which gives everything
inside fresh public ids, publishes it; so does moving an item out.

**A device without the key keeps the sealed note.** The app shows the item
with a locked line in place of the note, not editable; the CLI prints it
as `🔒 private, sealed with the key …` and refuses `add --under`, `move
--under`, `note`, `set` and `capture` into it. Adding the key in ⋯ →
Private keys opens what is already there.

**Ids inside a private item start with its id and `~`.** New items get
such ids; making an item private, or moving one in, renames what is inside
and rewrites links to it (`withPrivateIds`, on every commit). A device
without the key can then tell from `[[id:<private item>~…]]` which private
item a link leads into. The ids an item had before it was renamed are
deleted on the server with their text and note blanked.

**Keys are 32 random bytes per name, kept in this browser's
localStorage**, copied as one line `outline-key:1:<name>:<base64>`. There
is no passphrase: Martin keeps copies of the keys himself.

## Options considered

**Encrypting text and note per item, structure plain** (the design note's
recommendation). Rejected by Martin: devices without the key would see how
many items there are and how they nest.

**Listing the ids inside in plain on the private item**, to recognise
links. Simpler, but shows how many items it holds; Martin chose the ids.

**A passphrase deriving a key, wrapped keys in the outline.** Martin does
not need recovery or a password; one copyable key per name is less to get
wrong.

## Consequences

- A sealed note must fit the 100,000-character limit after compression and
  base64; a private item larger than that shows an error and stays here.
- Every edit inside re-seals the whole private item, a few times a second
  while typing.
- The server does not enforce anything: a client with the token can still
  delete or move a private item, or overwrite its sealed note.
- Nested private items are not supported: the inner one is sealed inside
  the outer one's note as text.
- Undoing Make private while its first round trip is in flight can leave
  the restored items blank, since the server already blanked their old
  ids; redo, or retype them.
- A review before release found six ways plaintext or edits could slip
  through (retyping the line, an older seal's note winning, a seal
  superseded on the server, parent cycles, text written before marking,
  renamed ids); each has a test in tests/privacy.test.ts.
- Keys sit in localStorage, readable by any script on the app's origin;
  plugins must not run there (doc/design/plugins-and-scripting.md).
