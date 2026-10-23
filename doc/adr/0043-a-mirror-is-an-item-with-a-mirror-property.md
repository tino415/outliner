# 43. A mirror is an item with a `mirror` property, shown read-only

- **Status:** accepted, 2026-10-22
- **Applies to:** `src/mirrors.ts`, `renderItem` in `src/render.ts`, the board's card text, `Mod+j r` in `src/keys.ts`

## Context

The proposal "Mirror an item, read-only" (split from "Note references",
agreed on 2026-10-22) asks for an item shown in a second place, live.
Sync, export and the CLI must not learn anything new, and the sync server
must not change.

## Decision

**A mirror is an ordinary item with no text of its own and the property
`mirror: <target id>`.** `mirror` is a setting (`SETTINGS`), so it never
becomes a column, and its chip is not shown. Everything that moves, deletes,
completes or syncs items handles a mirror as any other item; deleting it
leaves the target.

**It is made with Ctrl-J R or "Mirror here" in Ctrl-K, then the `[[` item
picker.** On a blank item, the item becomes the mirror; on any other, the
mirror is inserted as its next sibling. That is the simpler of the two
readings of "here".

**It renders as the target, read-only.** The row's text element is the
target's rendered text with `contenteditable="false"` and `tabindex="-1"`,
so arrow keys and Ctrl-Shift-Backspace still reach the mirror item itself.
The target's shown children follow inside the row as plain markup with no
`data-id`, so nothing that looks up rows by id finds them. A mirror among
the mirrored children shows its target's text but not its children, which
ends mirrors of an item above themselves. Folded and hidden completed
children are left out, as on the target's own page. The target's note and
properties are not shown.

**The mirrored markup is part of the row's display state**, so a change to
the target or anything under it rebuilds the row (doc/adr/0009). Typing
does not render; when the typed item is mirrored on screen, or sits under a
mirrored item, the edit renders.

**The bullet is hollow and its title is the target's path.** A click on it
zooms to the target; Enter or a click or tap on the text opens the target.
A mirror whose target is not in the outline (deleted, or private and locked
on this device) shows "gone", in italics; undo brings the target back.

## Consequences

- No change to the server, the wire format or the CLI: `outline show`
  prints the mirror as an item with a `mirror` property and no text.
- The mirror's own note stays editable; nothing else of the mirror is.
- On a board, a mirror card shows the target's text read-only, without
  its children.
- Search does not find a mirror by its target's text.
