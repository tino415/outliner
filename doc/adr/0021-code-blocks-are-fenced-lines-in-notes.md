# 21. Code blocks are ``` fenced lines in notes

- **Status:** accepted, 2026-10-09
- **Applies to:** `renderNote` in `src/inline.ts`, `codeBlock`, `enter` and `indent` in
  `src/editing.ts`, `propertiesOf` in `src/properties.ts`

## Context

Martin wants code samples in the outline. How others do it, looked up on
2026-10-09:

- WorkFlowy turns a whole item into a code block: three backticks on an
  empty item, then the code; three Enters leave it. A search operator
  `is:code-block` finds them
  ([blog](https://blog.workflowy.com/code-blocks-inline-code-quotes-strikethrough/)).
- Dynalist reads ``` fences as Markdown does, in items and notes, with
  syntax highlighting
  ([forum](https://talk.dynalist.io/t/multi-line-code-blocks/41)).
- dotflowy gives nodes a type; a code node would be one type.

## Decision

**A code block is the lines between two ``` lines of a note.** Text after
the opening fence names the language (`data-language`, unused for now).
Outside editing the fences hide and the code shows in a monospace block,
whitespace kept, never clamped to three lines; inline formatting, tags and
properties are not read inside it. While editing, the fences show as text.

Inside a block, Tab inserts two spaces instead of indenting the item, and
Enter keeps the line's indentation. Ctrl/⌘-Shift-E opens the note with an
empty block and the caret in it.

## Options considered

**A code item type, as WorkFlowy and dotflowy do.** Rejected for now: a new
item field travels through the sync protocol, the server's validation and
every client, phones included (ADR 0012), for something the note already
holds as text. Items stay one line; code that long belongs in a note.

**Fences in item text.** Rejected: item text is one line, and Enter splits
the item.

## Consequences

- Fences sync, export and reach the CLI as plain note text with no change
  to the model.
- No syntax highlighting: it would be the first runtime dependency or a
  hand-written highlighter per language.
- An unclosed fence makes the rest of the note code, as in Markdown.
