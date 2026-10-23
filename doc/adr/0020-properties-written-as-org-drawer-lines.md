# 20. Properties written `:key: value`, as in org mode

- **Status:** accepted, 2026-10-09
- **Supersedes:** the line syntax of [0017](0017-properties-in-notes-and-a-column-view-with-rollups.md);
  everything else in 0017 stands
- **Applies to:** `src/properties.ts`, `renderNote` in `src/inline.ts`, completion in
  `src/completion.ts`, `outline set`

## Context

0017 wrote properties as Logseq does, `key:: value`. Org mode, the model
for properties here, writes a property line inside a drawer as
`:key: value`. A line that starts with `:` is also an obvious place to offer the keys already in use,
which `key::` is not: the key comes first and nothing marks the start of it.

## Decision

**A property is a note line `:key: value`.** Keys are as before (letters,
digits, `-`, `_`, case-insensitive). The leading and middle colons are
markers like markdown's, hidden outside editing, so chips look the same.

**`key::` is no longer read.** The few `key::` lines in use are thrown away
rather than keeping two forms (2026-10-09). Old clients
still running on a phone show `:key: value` lines as plain note text.

**Typing `:` at the start of a note line opens a completion list** of every
key used in the outline; choosing one writes `:key: ` and leaves the caret
for the value. The same list, fed with tags, opens after `#` in text and
notes.

## Options considered

**Read both forms, write the new one.** Rejected: two
syntaxes for one thing, and a second regular expression in every reader,
for three lines of data.

**Org's full drawer (`:PROPERTIES:` … `:END:`).** Rejected: two extra lines
per item, and the drawer adds nothing the note does not already bound.
A pasted drawer still works, its `:PROPERTIES:` and `:END:` lines showing as
properties without a value.

## Consequences

- A note line that starts with an emoji code such as `:smile: thanks` is
  read as a property.
- The CLI writes `:key: value` too; scripts that grepped for `key::` change.
