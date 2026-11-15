# 63. A template's children fill the page its target creates

- **Status:** accepted, 2026-11-15
- **Applies to:** `goToTarget` and `fillPage` in `src/capture.ts`,
  `copyChildren` in `src/model.ts`
- **Extends:** 23, 59

## Context

Going to a target (59) opens or creates a page, but always an empty one, and
capture files one bare item. The children of a template were never used, so a
page per day with the same sections needed copying and pasting by hand, which
is awkward on a phone.

## Decision

- When resolving a template's target adds its last page, the template's
  children are copied into that page with their notes, properties, completed
  and collapsed state; a sealed child is left out.
- The template's own properties go onto the page, except `capture`, `key`,
  `ask`, `at`, `private`, `plugin` and `approved`, so `:new:`, `:view: board` and `:columns:` on a template
  shape the page.
- `{date}` is replaced by today in the copied text, notes and property values
  as in the target.
- A page that already exists only opens, even when it is empty. Pages made on
  the way to the target stay bare, and a target given as an item id or the
  Inbox fallback fills nothing.
- Capture, Go to target and `outline capture` all go through the same
  resolver, so all three fill. Capture files its item after filling, by `:at:`
  or the page's `:new:`.

## Consequences

- A template's children become part of what the template does, not a place
  for notes.
- A filled page is created in one commit, so one undo removes it with its
  children.
