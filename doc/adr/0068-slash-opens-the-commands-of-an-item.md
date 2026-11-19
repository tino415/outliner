# 68. A slash opens the commands of the item being edited

- **Status:** accepted, 2026-11-19
- **Applies to:** `src/slashCommands.ts`, `src/editing.ts`, `src/keys.ts`

## Context

The commands of an item (bold, a date, a tag, a link) are reached with
shortcuts or with Ctrl-K, and a phone has neither. Formatting needs markdown
that has to be remembered.

## Decision

- Typing `/` at the start of a title, or after a space in it, opens a palette
  of that item's commands. In a note, and inside a word, a path or a URL, a
  `/` stays a slash.
- The `/` stays in the text while the palette is open, so Escape keeps it.
  Choosing a command deletes the `/` and runs the command with the caret
  where it was.
- The palette lists only the item's own commands: inserting ones first (date,
  tag, property, kind, link, mirror, attach), then formatting (bold, italic,
  code, code block), then the rest in the order of the key table.
