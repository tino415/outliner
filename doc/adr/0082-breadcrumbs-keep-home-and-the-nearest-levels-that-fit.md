# 82. Breadcrumbs keep Home and the nearest levels that fit; the rest go behind a path button

- **Status:** accepted, 2026-11-28
- **Applies to:** `src/crumbs.ts`, `src/keys.ts`, `index.html`, `src/style.css`

## Context

On a phone the breadcrumbs share the top bar with Search. Five levels deep
every level shrank to a letter and the parent was cut off, so there was no
way to tap it. Ctrl-[ goes to the parent page, but a phone has no keys, and
the toolbar shows only while an item is edited, while the need comes while
reading.

## Decision

- Home always stays. After it come the nearest levels that fit with their
  whole names, the parent first.
- The levels that do not fit go behind one button, "Whole path", between
  Home and the levels that stay. It shows only when a level is hidden.
- The rule is whether the path fits, not the device: a narrow desktop window
  gets the button too. The fit is measured again when the breadcrumbs change
  width.
- Only the parent may shrink with "…", and only when it alone does not fit.
- The button opens the whole path, Home and this page included, each level
  indented one step more. A level zooms there; this page is the last line,
  marked "this page". On touch the list opens as a bottom sheet, as the item
  menu does.
- The command "Show the path" (`show-path`, Mod-J U) opens the same list on
  the line "Zoom out" goes to: the parent, or the board for a card. It opens
  also when no level is hidden. At Home it does nothing.
- "Zoom out" stays the direct key to the parent, and the palette lists it
  also when no item is being edited.

## Consequences

- A toolbar button and an item-menu line were not added: the toolbar is
  there only while editing, and the item menu takes two steps.
- Breadcrumbs no longer cut a level's name at 28 characters; a long name
  takes the room and pushes further levels behind the button.
