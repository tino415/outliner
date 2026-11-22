# 71. A Checks: child types the properties under its parent

- **Status:** accepted, 2026-11-20
- **Extends:** [0032](0032-properties-are-a-field-of-their-own.md), whose
  properties took any text
- **Applies to:** `src/checks.ts`, `src/propertyPicker.ts`,
  `src/propertyChips.ts`, `src/board.ts`, `src/render.ts`, `src/bookmarks.ts`,
  `src/completion.ts`, `src/editing.ts`, `src/app.ts`, `src/keys.ts`,
  `cli/run.ts`

## Context

A property holds any text. A kind of item that wants `effort` to be low,
medium or high, or `estimate` to be a number, had nothing to say so, and
`bookmarks` can only be set to 1 to 9 by knowing it.

## Decision

- A child titled `Checks:` types the properties under its parent. It holds one
  child per property, written `key: type`, and the nearest `Checks:` up the
  tree decides a key. The item with the `Checks:` child is not itself checked.
- Types are `one of`, `integer`, `date`, `time` and `text`; `unique` in front
  of any of them makes the value one no other item under the parent has.
  `one of` takes its values as children, or as an integer range,
  `one of 1..9`. Patterns are left for later.
- The app refuses a value that breaks its check, with a toast naming the check
  and where it is set: the value picker offers only the listed values, a date
  check opens the date picker, a `:key: value` note line with a refused value
  stays in the note, and `outline set` and `outline capture --set` fail with
  the same message. A formula (`=…`) and an empty value pass.
- A value that already breaks a check, because the check came later, the item
  moved or an old client wrote it, shows as a red chip with the reason on
  hover.
- A `Checks:` child is neither a column nor a card on a board, is muted in the
  tree and made folded, and is not a bookmark under Bookmarks.
- The `Checks:` subtree is checked too: a row of unknown type, a key checked
  twice, children under anything but `one of` and a value listed twice show
  red with the reason, and a red check checks nothing. Completion offers the
  keys in use under the parent, the type words, and the values already used
  under `one of`; a typed character that starts no valid type is refused.
- A board has a Checks button and Ctrl-K has "Edit checks of this page"; both
  zoom into the page's `Checks:` child, making it when the page has none.
