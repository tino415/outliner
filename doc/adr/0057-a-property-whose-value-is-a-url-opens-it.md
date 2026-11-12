# 57. A property whose value is a URL opens it, its key edits it

- **Status:** accepted, 2026-11-13
- **Applies to:** `src/propertyChips.ts`, `bindPropertyChips` and `chooseValue`
  in `src/propertyPicker.ts`, `onlyUrl` in `src/inline.ts`
- **Amends:** 32 (its sentence that a click on a chip changes or removes its
  value)

## Context

Every chip was one `<button>`, and a click anywhere on it opened the value
palette. A property holding a pull request URL could be edited and never
followed.

## Decision

- A chip whose value is exactly one http(s) URL is a `<span class="prop-chip
link-chip">` holding a `<button class="prop-key">` and an `<a class="link
prop-value" target="_blank" rel="noopener">`. An `<a>` cannot sit inside a
  `<button>`, so the chip is no longer one target.
- A click on the value is left to the browser and opens the URL in a new tab.
  A click on the key opens the value palette as before.
- The palette of a URL-valued property offers `Open <url>` first, so the
  keyboard and a tap that hits the key by mistake can follow the link too.
- A value with words around the URL, a `[[item]]` link, a markdown link, a
  computed value and the cells of the column view keep today's behaviour.

## Options considered

**Open on a click anywhere on the chip and edit from the item menu.**
Rejected: it takes editing away from the most common target.

**A short label such as `github.com/…/pull/77`.** Rejected: the URL as
written is what a link in text shows, and the chip's width already cuts it.

## Consequences

- On a phone the key is the smaller part of a link chip, so editing takes a
  more careful tap, or the item menu's Property.
