# outliner-lab

A WorkFlowy-style outliner as an installable, offline PWA. Everything stays in
the browser (localStorage). Time box: 2026-10-07 21:50 to 2026-10-08 03:50.

## Report

### Where it is

- Mac: https://artifacts.dev.localhost/outliner-lab/
- Tailscale: https://dev.taile622dc.ts.net/outliner-lab/ (not verified, see
  "Machine issues" below)
- Code: branch `worktree-outliner` of this repository (`main` holds only the
  empty first commit; `git merge --ff-only worktree-outliner` brings it over).
- The build shows its commit at the bottom of the ⋯ menu.

### What I built

An outliner that opens with a short welcome outline teaching itself. It has:

- in-place editing: Enter splits, Tab and Shift-Tab, Backspace joins, Delete
  pulls the next item up, arrow keys move across items keeping the column
- collapse and expand, zoom into any bullet with breadcrumbs and browser
  back and forward, an editable page title
- complete (struck through), show or hide completed, delete completed
- notes under items, `**bold**`, `*italic*`, `` `code` ``, links and
  clickable `#tags`, with the markers visible only while editing
- search that keeps ancestors for context, highlights matches and keeps
  items you edit on screen
- Ctrl/⌘-K jump to any item, Alt-Shift-M move an item anywhere
- multi-item selection (Shift-arrows, Shift-click, Ctrl/⌘-A twice): indent,
  move, complete, delete, copy and cut as a block
- drag and drop by the bullet, and an item menu (right click or long press)
- undo and redo for everything, with the caret put back
- export Markdown, OPML and a JSON backup; import any of them, plus pasted
  indented text, into the current page
- light, dark and automatic themes, three text sizes
- phone layout: a toolbar above the keyboard, bottom-sheet item menu
- installable PWA that starts offline; several tabs stay in sync

### Why it looks and works this way

Every argued choice has a record in [doc/adr](doc/adr/README.md). In short:
no framework, because the hard part is the caret in `contenteditable`, not
components (0001); an immutable document so undo is snapshots and tree
operations are unit-tested without a browser (0002, 0004); raw text with
markers kept in the DOM so caret offsets mean the same thing formatted or not
(0003); rows reused between renders once 5,000 items proved slow (0009); a
hand-written service worker versioned by content (0005, 0010); selection as a
mode without a caret (0008).

The look: warm paper background in light mode, near-black in dark, one
accent colour, 6 px bullets with a halo when folded, thin guide lines for
nesting, the system font (SF on the Mac). The focused item's bullet turns
the accent colour.

### What I cut

Mirrors, backlinks, date tags, boards, item types and headings, multiple
documents, sharing and sync, rich-text editing, IndexedDB, and an "update
available" prompt. Multi-item selection was on the cut list at the start and
made it in.

### How it was checked

- 48 unit tests (tree operations, import and export, inline rendering, undo
  history) and 128 browser tests run in the container on desktop Chromium,
  a Pixel 7 profile, desktop WebKit, an iPhone 15 profile and Firefox:
  keyboard flows, zoom, search, palette, selection, drag and drop, item menu,
  phone toolbar and virtual-keyboard input, offline start, persistence, cross-
  tab saves, a 5,000-item render budget.
- Three review rounds by separate agents found 24 bugs (14, 9, then 1 after
  the refactor), and running the phone tests on iPhone WebKit found one more
  (toolbar taps ignored). Each fix came with a test shown failing first
  (`e2e/regressions.spec.ts`). A four-angle simplification pass went over the
  whole of `src/`.

### Known bugs and limits

- Undo history does not survive a reload.
- A new version shows on the next start, without a prompt.
- On touch, a drag that starts on a bullet does not scroll the page.
- On a phone there is no multi-item selection.
- A trailing line break at the very end of a note is not visible until text
  follows it.
- Links and tags are clickable only when the item is not being edited.
- Firefox skips two tests that need Chromium-only test tooling (synthetic
  clipboard, real touch input); the behaviour itself is untested there.
- Only tested in headless browsers in a container, without the Mac's fonts.
  Real iOS Safari and macOS Safari are untested.

### Screenshots

In `screenshots/`, for `desktop-` and `phone-`, each in `light` and `dark`:
`home`, `editing`, `zoomed`, `empty-page`, `search`, `menu`, `item-menu`,
`jump`, plus `desktop-*-selection` and `desktop-*-help`.

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

- Vite + TypeScript, no UI framework, no runtime dependencies (about 16 kB of
  JavaScript gzipped). One immutable document object; structural changes
  re-render the visible rows that changed and restore the caret by item id
  and offset. Typing only updates the model.
- Vitest for the tree operations, Playwright for the browser flows.
- Everything runs in the `app` service of `compose.yaml`, built from
  `Dockerfile.dev` on the Playwright image, so browsers come from the image.
  See README.md for the commands.
