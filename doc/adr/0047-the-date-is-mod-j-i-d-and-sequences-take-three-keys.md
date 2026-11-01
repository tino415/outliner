# 47. The date is ⌘J I D, and key sequences take up to three keys

- **Status:** accepted, 2026-11-01
- **Supersedes:** [32](0032-properties-are-a-field-of-their-own.md) where Set a property… is ⌘; (Ctrl-; elsewhere), now ⌘J P only; [36](0036-dates-are-iso-text-shown-as-chips.md) where the picker opens on ⌘J ;, now ⌘J I D; [35](0035-alt-shift-letters-removed-and-the-prefix-wait-ends.md) where the prefix waits only for the next key
- **Applies to:** `src/keys.ts`, `src/chrome.ts`, `src/shortcuts.ts`, `README.md`

## Context

A shortcut that needs `;` is another physical key on localized keyboards,
so ⌘; and ⌘J ; cannot be pressed on some of them.

## Decision

**The date picker opens on ⌘J I D**, with I as the insert prefix. Only the
date is under I for now.

**⌘; is removed.** Set a property… keeps ⌘J P.

**A sequence may have three keys.** After the prefix the app keeps waiting
while a longer sequence can follow, and the panel shown on a pause lists
what follows the keys pressed so far. A click, focus moving, the window
losing focus or Escape cancels the wait, as before. Shortcut settings accept
up to three keys in a row.

## Consequences

A sequence that is also the start of a longer one never waits: the shorter
one runs, so a setting that binds ⌘J I makes ⌘J I D unreachable.
