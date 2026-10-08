# Encrypted items

Status: proposal for discussion, 2026-10-09. From Martin's outline.

## Context

Martin's ask: "Similar to org mode feature org crypt, node can be marked to
be encrypted and only client possessing key can actually view that node.
Should be configurable also for cli. So I can keep some personal notes that
phone and laptop could view, but would be unviewable from cli/mcp by agent."

Constraints from what exists:

- Every client keeps a full replica; fields merge by last-writer-wins on a
  hybrid clock (ADR 0011, 0012). The server checks only that `text` and
  `note` are strings under 100,000 characters (`src/sync/protocol.ts`).
- The server stores the outline in plain text on the server; Tailscale and one
  token are the only boundary (ADR 0011). The CLI uses the same token.
- Properties are lines in the note (ADR 0017), so an encrypted note hides
  its properties too.
- The app stores the whole `Doc` as JSON in `localStorage`.

## How others do it

- **org-crypt.** Entries tagged `crypt` have their body encrypted with GPG
  on save; the headline and properties stay plain. Symmetric (passphrase)
  or public key (`org-crypt-key`). Decrypt is an explicit command.
- **Standard Notes (protocol 004).** Argon2id derives a root key from the
  password; the root key encrypts random "items keys", which encrypt each
  item with XChaCha20-Poly1305. Changing the password rewraps keys, not
  data.
- **Joplin.** A random master key, encrypted with a key derived from the
  password by PBKDF2, is stored on the sync target; notes and resources are
  encrypted with AES. Item headers (which key, which method) are visible.
- **Obsidian (Meld Encrypt, Inline Secret Block)** and **Logseq
  (PrivacyMode)** encrypt a selection or a block in place with a passphrase,
  leaving a marker that decrypts on click.

All of them encrypt content, not structure, and keep the key derivation
parameters and a wrapped key next to the data.

## What gets encrypted

An encrypted field value is a self-describing string:
`enc:1:<key id>:<base64 nonce + AES-GCM ciphertext>`. The item id and field
name go in as associated data, so a ciphertext cannot be moved to another
item or field without failing to decrypt.

- **Encrypted:** `text` and `note` of the marked item and of every item
  below it. Encrypting the whole subtree matches the intent ("personal
  notes") and means a child added on the phone is never accidentally plain.
- **Plain:** `parent`, `position`, `collapsed`, `completed`, `deleted`.
  The tree shape, counts and completion are visible, as in Joplin and
  org-crypt. Hiding them would mean a separate encrypted blob per subtree,
  which breaks per-field merge.
- **The marker** is the ciphertext prefix itself; no new field. Whether the
  marked item's own headline stays readable, like org-crypt, is a choice
  (question 1). If it does, the marker needs to be plain text (a `#crypt`
  tag) and only descendants and the note are encrypted.

## How it fits sync

Ciphertext is an ordinary string, so the protocol, the server and the merge
do not change. Base64 and the nonce make a value about a third longer, so
an encrypted note's practical limit drops to about 75,000 characters.

Inside the app the replica and everything stored in `localStorage` hold
ciphertext; only the in-memory `Doc` holds plain text, decrypted when the
`Doc` is built from the replica. The diff that turns commits into changes
(ADR 0012) compares plain text and encrypts only fields that changed, since
the same text encrypts differently every time.

A client without the key (the CLI, or a device not yet unlocked) sees
`enc:` values. It shows them as a locked placeholder and must never write
`text` or `note` on such an item; it may still move, complete or delete it.
The server can enforce that cheaply: reject a plain value written over an
`enc:` value. That is a server change, and old clients on phones keep
running, so the app and the server must agree first.

Search, Jump to and columns work on unlocked devices because they read the
`Doc`. On the CLI, `find` skips encrypted items and `show --columns` totals
leave their properties out, so the CLI's totals can differ from the app's.

## Keys across phone and Mac

1. On first use the app makes a random 256-bit data key.
2. Martin chooses a passphrase. A key-encryption key is derived from it
   (PBKDF2-SHA-256 in WebCrypto with 600,000 iterations today; Argon2id
   once WebCrypto ships it, or now from a wasm build) and wraps the data
   key.
3. The wrapped key, salt and KDF parameters go into the outline as a
   settings item, so they sync. The server and the CLI see only the
   wrapped key.
4. Each device unlocks once with the passphrase and keeps the data key in
   IndexedDB as a non-extractable `CryptoKey`: script can use it but not
   read its bytes. A "lock now" action and an optional idle timeout drop it.
5. Changing the passphrase rewraps the data key; no item is re-encrypted.

**Keeping the CLI out** needs nothing: it never gets the passphrase.
"Configurable for the CLI" could mean a `--passphrase-from` option for
Martin's own terminal; agents would not be given it.

**A write-only variant.** With a key pair (ECDH P-256 in WebCrypto) instead
of a symmetric key, the public key sits in the outline in plain, so the CLI
or an agent can file an item into an encrypted subtree (an inbox) without
being able to read anything there. org-crypt's GPG mode works the same way.
It costs more code and is worth it only if agents should capture into
private notes.

## Threat model

Protects against:

- An agent, script or person using the CLI or the sync token reading
  encrypted items.
- The server's database, its backups and anything else on the server reading
  them at rest.

Does not protect against:

- **Whoever can change the app's code.** The app is served from the server
  (`a static host directory`). An agent with a shell there can publish a
  build that sends the key away on the next load. This is the largest gap
  and the reason this is protection from agents reading by accident or by
  instruction, not from a hostile agent on the server. Serving the app from
  somewhere agents cannot write, and checking the build commit in the ⋯
  menu, narrows it.
- **Offline guessing.** The CLI token is enough to download the wrapped
  key; a weak passphrase falls to brute force. Hence a slow KDF and a long
  passphrase.
- **Tampering with structure.** Anyone with the token can move, delete or
  complete encrypted items, or overwrite them with garbage. GCM detects a
  changed ciphertext; it cannot stop a deletion.
- **Plugins running in the page**, which could call decrypt with the stored
  key. Plugins must run outside the app's origin (see
  [plugins-and-scripting.md](plugins-and-scripting.md)).
- **An unlocked phone or Mac.**

## Options

1. **Per-subtree symmetric encryption**, text and note, structure plain, as
   above. Moderate: crypto in `src/sync/`, a lock/unlock UI, a locked row,
   a server guard.
2. **Option 1 plus a public key** for write-only capture by the CLI.
3. **Per-item encryption without inheritance**, like org-crypt. Less code,
   but children of a private item are plain unless each is marked.
4. **One encrypted blob per subtree**, structure hidden too. Hides the most,
   but a subtree becomes one field: two devices editing different items in
   it lose one edit, and the CLI cannot even move it.

## Recommendation

Option 1, with a symmetric data key wrapped by a passphrase via PBKDF2
(Argon2id when available), kept as a non-extractable key in IndexedDB on
each device. Encrypt `text` and `note` for the marked subtree, keep the tree
shape plain, and add a server guard against plain writes over ciphertext.
Leave the public-key variant until agents need to capture into private
notes.

## Open questions for Martin

1. Should the marked item's own headline stay readable (org-crypt style),
   or be hidden like its children?
2. Is it acceptable that the CLI sees the tree shape, the number of children
   and what is completed under a private item?
3. Should the CLI or agents be able to add items into a private subtree
   without reading it (the public-key variant)?
4. Stay unlocked until "lock now", or lock after some idle time? Separately
   on phone and Mac?
5. One passphrase for all private subtrees, or different keys for different
   subtrees?
6. Is the remaining gap acceptable, that an agent with a shell on the server can
   change the served app? If not, where else could the app be served from?
7. What should happen if the passphrase is lost: is the content simply gone,
   or do you want a recovery key printed once?

## Sources

- [Org Crypt manual](https://emacsdocs.org/docs/org/Org-Crypt)
- [Standard Notes encryption whitepaper](https://standardnotes.com/help/security/encryption),
  [specification](https://github.com/standardnotes/app/blob/main/packages/snjs/specification.md)
- [Joplin end-to-end encryption](https://joplinapp.org/help/apps/sync/e2ee/)
- [Meld Encrypt](https://community.obsidian.md/plugins/meld-encrypt),
  [Logseq encrypted blocks](https://discuss.logseq.com/t/encrypted-blocks/1957)
- [Modern algorithms in WebCrypto (Argon2)](https://wicg.github.io/webcrypto-modern-algos/),
  [SubtleCrypto.deriveKey](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/deriveKey)
