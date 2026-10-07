# outliner-lab

A WorkFlowy-style outliner as an installable, offline PWA. Everything stays in
the browser (localStorage). Time box: 2026-10-07 21:50 to 2026-10-08 03:50.

## Research

Sources looked at: WorkFlowy's hotkey reference (workflowy.com/help/hotkeys),
WorkFlowy's feature overview, Dynalist's keyboard shortcut reference
(help.dynalist.io/article/91). What WorkFlowy, Dynalist and Logseq agree on as
the core of an outliner:

- one infinite tree of bullets, edited in place, no "save"
- Enter splits / creates a sibling, Tab / Shift-Tab indent and outdent,
  Backspace at the start of an item merges it into the one above
- collapse / expand a subtree (click the arrow, Ctrl-Up / Ctrl-Down)
- zoom into any bullet so it becomes the page, with breadcrumbs back out
- complete an item (Ctrl-Enter), strike it through, hide or show completed
- move items up / down among siblings (Alt-Shift-Up / Down), drag and drop
- a note under an item (Shift-Enter)
- live search that filters the tree but keeps ancestors for context
- undo / redo across everything
- export (WorkFlowy: plain text, formatted, OPML), import
- light inline formatting (bold, italic, links, #tags that are clickable)

Shortcuts differ between products; this app takes WorkFlowy's where they do
not collide with the browser, and accepts Dynalist's as aliases.

## Scope for the time box

In:

1. Tree editing: Enter split, Enter on an empty nested last item outdents,
   Tab / Shift-Tab, Backspace merge, Delete merge-forward, arrow navigation
   across items, Ctrl-Shift-Backspace deletes an item
2. Collapse / expand with arrows and Ctrl-Up / Ctrl-Down
3. Zoom into a bullet, breadcrumbs, editable page title, URL hash so browser
   back / forward work, Alt-Right / Alt-Left and Ctrl-] / Ctrl-[ for in / out
4. Complete with Ctrl-Enter, show / hide completed
5. Move up / down with Alt-Shift-Up / Down, drag and drop by the bullet
6. Notes with Shift-Enter
7. Search / filter (Ctrl-F, or `/` outside an item), ancestors shown,
   clickable #tags
8. Undo / redo (Ctrl-Z, Ctrl-Shift-Z, Ctrl-Y), whole-document snapshots with
   typing coalesced per item
9. Export JSON, OPML, Markdown; import JSON and OPML
10. Light / dark / system theme
11. Inline rendering of `**bold**`, `*italic*`, `` `code` ``, links, #tags when
    an item is not being edited; raw text while editing
12. Mobile: touch-sized targets, a toolbar above the keyboard (indent,
    outdent, move, complete, undo)
13. PWA: manifest, icons, hand-written service worker, works offline
14. Several tabs open at once pick up each other's changes (storage event)
15. A short welcome outline on first run that teaches the shortcuts

Cut (and why):

- mirrors, backlinks, date tags, boards, tables, headings / item types:
  each is its own feature with its own edge cases; none is basic
- multiple documents / sidebar: one tree with zoom is the WorkFlowy model
- multi-item selection (Shift-Up / Down) and bulk operations: fiddly with
  contenteditable, stretch goal only
- rich-text editing (WYSIWYG): markdown-ish raw text while editing keeps the
  caret logic simple and survives copy / paste
- sync, sharing, accounts: out of scope by constraint
- IndexedDB: localStorage is enough for a text outline of a few MB and is
  synchronous, which keeps saving trivial

## Machine issues hit (not investigated, per instructions)

- 2026-10-07 22:30, checking the Tailscale URL from `dev` itself:
  `curl https://dev.taile622dc.ts.net/outliner-lab/` →
  `curl: (60) SSL: no alternative certificate subject name matches target hostname 'dev.taile622dc.ts.net'`
  (same for `https://dev.taile622dc.ts.net/`). The Mac URL
  `https://artifacts.dev.localhost/outliner-lab/` answers 200 from `dev`. The
  Tailscale URL has not been verified from a tailnet device.
- `EnterWorktree` refused to start in the empty repository ("Failed to resolve
  base branch HEAD"); an empty first commit on `main` fixed that, and the work
  lives on branch `worktree-outliner`.

## Stack

- Vite + TypeScript, no UI framework. One immutable document object; every
  structural change re-renders the visible tree and restores the caret by
  item id and offset. Typing only updates the model.
- Vitest for the tree operations, Playwright for the browser flows.
- Everything runs in the `app` service of `compose.yaml`, built from
  `Dockerfile.dev` on the Playwright image, so browsers come from the image.
