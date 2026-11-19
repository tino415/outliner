# 67. Tags are a property shown after the title

- **Status:** accepted, 2026-11-19
- **Extends:** [0032](0032-properties-are-a-field-of-their-own.md), whose lifting
  of `:key: value` note lines this repeats for tags
- **Applies to:** `liftTags` and `tagsOf` in `src/model.ts`, `takeTags` in
  `src/inline.ts`, `src/app.ts`, `src/editing.ts`, `src/completion.ts`,
  `src/propertyChips.ts`, `src/transfer.ts`, `cli/run.ts`

## Context

A `#tag` stayed wherever it was typed: in the middle of a title, in a note,
highlighted in place. Tags are metadata of the item, and read best in one
place after its title.

## Decision

- An item's tags live in its `tags` property, space separated, without the
  `#`.
- A `#word` typed in a title or note moves into the property when the item is
  left, and a tag picked from completion moves at once. Lifting leaves single
  spaces where the tag was, drops a note line that was only tags, and leaves a
  title that is only a tag as it is.
- The same lifting runs when the app starts, on every CLI save and on every
  import, so agents and older builds that write `#tag` are absorbed. A `#`
  inside code, a link or a reference is not a tag.
- A tag shows as a `#chip` leading the property chips; a click searches for it.
- `#tag` queries, the agenda's `#todo` and completion read the property, and
  still the tags written in a title.
- CLI `show`, `find`, the Markdown and OPML exports print the tags after the
  title as `#a #b`, and leave them out of the property lines.
