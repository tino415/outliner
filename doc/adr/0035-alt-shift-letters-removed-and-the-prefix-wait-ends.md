# 35. The Alt-Shift letters are gone, and the prefix's wait ends

- **Status:** accepted, 2026-10-10
- **Supersedes:** [33](0033-one-search-for-items-and-commands-and-a-prefix-key.md) where it keeps the Alt-Shift letters for a release and puts named commands above items; the rest of 33 stands
- **Applies to:** `src/keys.ts`, the prefix in `src/chrome.ts`, `searchEverything` in `src/navigation.ts`

## Context

ADR 33 kept the Alt-Shift letters for one release. By the next day ⌘J
was confirmed to work on a Mac, and Alt goes back to typing. A
review of the prefix then found that its wait never ended on its own, so a
stray ⌘J turned a later letter into a command, and that ranking a named
command first let Enter run "Clear this page" for "clear".

## Decision

**No Alt-Shift letter is bound.** Alt-Shift with arrows or Enter types
nothing and stays. A test checks that none of the 26 letters is taken.

**The prefix waits only for the next key.** A click, focus moving or the
window losing focus cancels it; holding ⌘J does not take its own repeat as
the next key, and a key held after a sequence does not type. The prefix is
read on the window in the capture phase, before the completion list.

**The second key may be pressed with ⌘ or Ctrl held, except N and T**,
which the browser keeps for a new window and a new tab.

**Commands that delete, clear or remove are never ranked above items** in
Ctrl-K's All mode, and an item counts as named by the query when its plain
text, without markdown markers, starts with it.
