# 2. One immutable document, re-rendered on structure, never on typing

- **Status:** accepted, 2026-10-07
- **Applies to:** `src/model.ts`, `src/app.ts`

## Context

An outline needs undo for every operation, a save after every change, and
operations that are easy to test without a browser. It also needs typing to
feel native: a re-render under the user's fingers breaks IME composition,
autocorrect on phones, and the browser's own selection.

## Decision

The document is a flat map of items (`id`, `text`, `note`, `parent`,
`children`, flags), and every operation is a pure function from one document
to the next. Items are copied on write (`Draft` in `src/model.ts`), so
untouched items are shared between versions.

Two kinds of change reach the screen differently:

- **Typing** updates the model from the element's `textContent`. Nothing is
  re-rendered; the DOM already shows what was typed.
- **Structure** (split, indent, move, merge, complete, fold, zoom, undo)
  re-renders the visible tree from scratch and then puts the caret back by
  item id and text offset.

Keyboard navigation between items uses the order of editors in the DOM, not
the model. What the user sees is the order they move through, including in
search results and with completed items hidden, without a second
implementation of "what is visible".

## Options considered

**Keyed DOM diffing.** Rejected for now: a full rebuild of a few hundred
rows is well under a frame, and the rebuild removes a whole class of stale
DOM bugs. It is the first thing to revisit if outlines with thousands of
visible rows feel slow.

**Mutable model with an operation log for undo.** Rejected: inverse
operations for merge and move are where outliner undo bugs live. Snapshots
cannot get the inverse wrong.

## Consequences

- Structural operations are unit-tested in Node (`tests/model.test.ts`)
  without a DOM.
- Formatting of an item being edited is stale until it loses focus (see
  [0003](0003-items-are-raw-text.md)).
- Each keystroke copies the item map (shallow, O(n) pointers). Fine for
  thousands of items; not measured beyond that.
