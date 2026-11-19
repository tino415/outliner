# 68. The + button opens an Add menu

- **Status:** accepted, 2026-11-19
- **Extends:** [0032](0032-properties-are-a-field-of-their-own.md), whose
  property picker the + button used to open directly
- **Applies to:** `src/addMenu.ts`, `src/propertyPicker.ts`, `src/render.ts`,
  `src/board.ts`, `index.html`

## Context

The + beside an item's title opened the property picker only. Adding a child
or an attachment under an item meant the keyboard or the item menu behind a
long press, so the + was taken for a general "add" and misled.

## Decision

- The + opens an Add menu: Child item, Attachment…, Tag…, Property…. Its label
  is "Add…".
- Child item appends a last child, unfolds the item and puts the caret in it.
  Attachment… is the file picker of the item menu's Attach. Tag… is a palette
  of the tags in use or a new name, and the tag joins the `tags` property.
  Property… is the property picker, unchanged.
- The menu is the same on rows, board cards, card children and column heads,
  is placed like the item menu, and answers the arrow keys, Enter and Escape.
