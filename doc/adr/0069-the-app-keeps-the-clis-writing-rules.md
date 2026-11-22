# 69. The app keeps the CLI's writing rules

- **Status:** accepted, 2026-11-20
- **Extends:** [0058](0058-the-cli-refuses-long-titles-and-structured-notes.md), whose title and note rules the
  app now shares through `src/writingRules.ts`
- **Applies to:** `src/writingRules.ts`, `src/transfer.ts`, `src/editing.ts`,
  `src/style.css`

## Context

The CLI refuses a title over 200 characters and a note with list lines or
headings, so agents write subtrees as children. The app accepted both, and the
two could drift.

## Decision

- The app and the CLI call the same checks in `src/writingRules.ts`; each says
  it in its own words.
- A title stops at 200 characters while typing or pasting: the text is cut to
  what fits and a toast says so. A counter shows from 180 characters. A title
  already longer can be shortened but not lengthened.
- List lines and headings typed in a note become children when the note is
  left, in one history step. A heading becomes a child with the list lines under
  it as its children, indented lines nest, prose stays in the note, and code
  fences and attachment links are left alone.
- A note is lifted only when it was edited and then left; opening and leaving
  it changes nothing, and existing items over the limits stay as they are.
- The CLI still refuses list lines in a note; only the app lifts them.
