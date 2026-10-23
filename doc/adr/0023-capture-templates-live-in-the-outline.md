# 23. Capture templates live in the outline; shortcuts reach them by URL

- **Status:** accepted, 2026-10-09
- **Applies to:** `src/capture.ts`, `src/capturing.ts`, `outline capture`,
  `public/manifest.webmanifest`

## Context

The app should have org-capture: a key, a template, and the new entry filed
in a set place with a few properties asked for, reachable straight from a
phone's home screen and from a Mac without opening the outline first.

## Decision

**A template is an item whose note has a `:capture:` property**, the target:
a path of item texts or an item id, `{date}` standing for today. `:ask:`
lists properties to ask for, `:at: top` files at the top, `:key:` is the
letter that picks it. The item's text is the template's name. Templates are
outline items, so they sync, the CLI uses the same ones, and making one
needs no settings screen. Without templates, capture files into a top-level
`Inbox`. Pages missing on the way to a target are created.

**One dialog**, from Alt-Shift-N, the ⋯ menu or Ctrl-K: template chips
(with several, a template's letter picks it, as in org), the text, one field
per asked property.

**Shortcuts into capture are URLs**: `?capture` opens the dialog,
`?capture=Meal` with that template, `?title=…&text=…&url=…` with the text
filled. The manifest offers a "Capture" app shortcut (long press on the
icon, Android and desktop Chrome) and a share target (Android: Share → the
app). iOS supports neither for web apps; an iOS Shortcut that opens the URL
does the same. On the Mac, the installed app's Dock menu has the shortcut,
and `outline capture TEXT` (the Nix package) can sit behind a macOS
Shortcut or a Raycast/Alfred command.

## Options considered

**Templates in device preferences.** Rejected: they would not reach the
phone, the Mac or the CLI.

**A companion app (Android or Mac) with a native share sheet or global
hotkey.** Not now: the PWA share target covers Android; a Mac app cannot be
built on Linux, and the CLI behind
a macOS Shortcut gives a global hotkey without one.

**A share target with POST**, so shared files arrive too. Rejected for now:
it needs the service worker to take the request apart; GET carries text and
links, which is what an outline holds.

## Consequences

- A `:capture:` property on an ordinary item makes it a template; the name
  is easy to avoid but not reserved.
- Capturing offline works: the service worker answers the URL with the
  cached app, ignoring the query.
- Untested on a real phone: Playwright has no share sheet; the test opens
  the URL a share would.
