# 8. Selecting items is a mode without a caret

- **Status:** accepted, 2026-10-07
- **Applies to:** "selecting several items" in `src/app.ts`, block operations in `src/model.ts`

## Context

Every editor is its own `contenteditable`, so the browser's text selection
cannot span items: dragging across two items selects text in one of them.
Moving, indenting or deleting several items at once still matters; WorkFlowy
and Dynalist both have it.

## Decision

Selecting items is a separate mode. It starts with Shift-Up at the start of
an item or Shift-Down at its end (so Shift-arrows inside text still select
text first), or with Shift-click on another item. On entry the editor is
blurred: there is no caret, and the selected rows are highlighted.

The selection is an anchor and a head, both item ids. The selected items are
the editors between them in DOM order, the same visible order arrow keys use
([0002](0002-immutable-document-rerender-on-structure.md)). Operations apply
to the roots: selected items with no selected ancestor. Indent and move treat
the roots as one block; if the first (or last, going down) cannot move,
nothing moves.

While selecting: Tab and Shift-Tab, Alt-Shift-arrows, Ctrl-Enter, Backspace
or Delete, Ctrl-C and Ctrl-X (as a Markdown list that pastes back as items),
Ctrl-A for the page. Arrow keys, Escape, a click or typing leave the mode.

## Options considered

**One `contenteditable` for the whole tree.** Rejected: it gives cross-item
text selection for free but takes back everything
[0001](0001-plain-typescript-no-ui-framework.md) and
[0002](0002-immutable-document-rerender-on-structure.md) avoid; the browser
would own the structure.

**Checkboxes or a long-press selection mode for touch.** Not done in the time
box. On a phone there is no way to select several items yet.

## Consequences

- Selection survives operations, because ids survive re-renders; it ends when
  an id it refers to leaves the screen (undo, collapse).
- Copy uses the async clipboard API, which needs a secure context; elsewhere
  it falls back to `execCommand("copy")`.
- Mouse drag across items still selects text in one item only.
