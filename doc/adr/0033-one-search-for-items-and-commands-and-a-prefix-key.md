# 33. One search for items and commands, and a prefix key for the rest

- **Status:** accepted, 2026-10-09
- **Applies to:** `src/keys.ts`, `src/navigation.ts` (`searchEverything`), `src/palette.ts` (modes), the prefix handling in `src/chrome.ts`

## Context

Commands without a natural key had piled up on Alt-Shift plus a letter.
Martin pointed out that in many layouts Alt with a letter types a
character of the language, and the same goes for ⌥ on a Mac, so those keys
take characters away from typing. Ctrl-K showed items first and commands
only after `>`, which he found annoying; GitHub and Claude mix both in one
search.

## Decision

**Ctrl-K (⌘K) is one search for items and commands.** Commands whose name
the query starts words of come first, then items, then the other matching
commands. Tab cycles All, Items and Commands; Ctrl-Shift-K opens it on
Commands. `>` still means commands, for old habits.

**Ctrl-J (⌘J) is a prefix**, as C-x in Emacs: the next key picks the
command, with ⌘ or Ctrl held or not. Pausing shows what can follow. A key
sequence is written `Mod+j t` in the binding table, so the help, the
palette and the panel read it from the same place as every other shortcut.

**The Alt-Shift letters stay one release as second keys**, then go, so Alt
is left to typing. Alt-Shift with arrows or Enter types nothing and stays.

## Options considered

**Ctrl-C or Ctrl-X as the prefix**, as Emacs: copy and cut on Linux,
Windows and Android. **An Alt prefix**: types characters, the reason for
this change. **Punctuation (Ctrl-' or Ctrl-\\)**: on a Slovak or German
layout those keys move or need Shift. Ctrl-J is Chrome's downloads outside
a page, but a page may take it (Google Docs does).

## Consequences

- Firefox on Linux and Windows opens its web console on Ctrl-Shift-K before
  the page sees it; Ctrl-K with Tab does the same there.
- A key sequence cannot be pressed from the phone's toolbar; the toolbar,
  the item menu and Ctrl-K cover it there.
