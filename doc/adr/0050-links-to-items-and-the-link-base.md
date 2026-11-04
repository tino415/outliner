# 50. A link to an item, its base, and the wait for sync

- **Status:** accepted, 2026-11-04
- **Applies to:** `src/links.ts`, `src/itemLink.ts`, `src/navigation.ts`,
  `src/syncing.ts`

## Context

An item opens zoomed in at `#/<id>`, but nothing gave a person that address to
paste into chat, a pull request or notes. Two things made a copied address
unreliable: the address the app was opened at is not always the one other
devices use, and a link to an item this device has not received yet landed at
the top of the outline, because the zoom target was missing and nothing
zoomed to it when the item arrived.

## Decision

- "Copy link" (item menu, palette), Mod+J Y (command `copy-link`, rebindable
  as in 0040) and "Copy link to this page" in the ⋯ menu put `<base>#/<id>`
  on the clipboard and show "Link copied". Cards have no menu of their own: a
  card's link is copied from the page opened on it.
- The base is a `link-base` property on any item, the first in outline order
  winning, as with `shortcuts: on` and capture templates. Without one it is
  `location.origin + location.pathname`.
- With a coarse pointer and `navigator.share`, the system share sheet opens
  with the address and the item's plain text as title instead. A private item
  shares the address only. Cancelling does nothing; any other failure copies.
- A link to an item this device does not have keeps its `#/<id>` until the
  first sync answer. A remote change that brings the item zooms to it. After
  the first answer, or at once without sync, a link to an item that is still
  missing goes to the top with "That item isn't here".

## Consequences

- Phones and desktops behave differently on copy; the phone path has its own
  tests with a stubbed `navigator.share`.
- `link-base` is one more setting to keep up. Without it, links copied over a
  local-only address work only on the machine that serves it.
