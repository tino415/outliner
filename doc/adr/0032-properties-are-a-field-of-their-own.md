# 32. Properties are a field of their own, synced one by one

- **Status:** accepted, 2026-10-09
- **Supersedes:** [17](0017-properties-in-notes-and-a-column-view-with-rollups.md) and [20](0020-properties-written-as-org-drawer-lines.md) where they keep properties as lines of the note; the column view and rollups of 17 stand
- **Applies to:** `Item.properties` and `setItemProperty` in `src/model.ts`, `prop:<key>` fields in `src/sync/replica.ts` and `src/sync/protocol.ts`, `src/propertyChips.ts`, `src/propertyPicker.ts`, the CLI

## Context

Properties were `:key: value` lines in an item's note, so that the server,
the protocol and the CLI did not change. On the phone that meant typing
colons and keys exactly, notes cluttered with lines that a column view had
to hide (and the gaps when it could not), and one synced field for the
whole note: setting `effort` on the phone while the Mac edited the note
lost one of the two edits. A command and buttons replace the parsing,
and with only a dozen items using properties, now is the time to change
the storage too.

## Decision

**An item has `properties`: keys in lower case, values as written.** Each
syncs as its own field, `prop:<key>`, a string, or null once removed, so
edits to different properties, or to a property and the note, both
survive. The server accepts any `prop:` field whose key is letters, digits,
`-` or `_`.

**Settings are properties too**: `columns`, `capture`, `ask`, `key`, `at`,
`completed`, `new`, `view`, `private`, `plugin` and `approved`. They show
as muted chips; `approved` is not shown.

**Properties show as chips under the item's text**, under the page title
for the page's own. A click on a chip changes or removes its value; Ctrl-J P
(⌘J P on a Mac), the item menu and a Property button in the phone's toolbar
set one in two steps, a key (the page's columns first, then the keys in
use, or a new one) and a value (the key's values elsewhere, or what is
typed). In column view the chips of keys shown as columns are left out.

**A `:key: value` line typed into a note becomes a property when the note
is left**, so typing stays possible. The same lifting migrates existing
notes once, when a new build first starts, and runs on every import and
every CLI save, so older builds and agents writing lines are absorbed.

**Exports write properties back as `:key: value` lines** above the note, as
org mode does, and imports read them as properties.

## Options considered

**Keep the lines, add a picker that writes them** (what was proposed
first). No protocol change, but properties and the note would still be one
synced field and the note would still hold them.

**A JSON blob of all properties in one field.** One field again: two
devices setting different properties would lose one.

## Consequences

- The `sync` server must run this version before an app that writes
  `prop:` fields; an older server rejects them and the app's queue stops.
- Builds from before this change ignore properties they receive and show
  none; one that writes a `:key:` line has it lifted by the next new build.
- Private items seal their properties with the note (ADR 29); `private` is
  a property, so making an item public removes it and sends its note and
  properties in plain again.
