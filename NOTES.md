# outliner-lab

## Morning summary (2026-10-08)

Both backlog items are done and published:

- Phone: a bigger fold target and swipes on rows (ADR 0016).
- Properties and column view: `key:: value` lines in notes, plus a column
  view with rollups (ADR 0017).

Try the column view with Alt-Shift-C, or Columns in the ⋯ menu. Two examples:

- Under a week, add days, then meals, then foods with notes like
  `kcal:: 420`.
- Put `effort:: 1h30` on subtasks.

A review round on the new code and on sync found 14 bugs, all fixed. Each fix
has a test that was run against the old code and failed first. The ones you
would notice:

- **Turning sync off on a device that joined.** The device fell back to its
  old outline after a reload. It now keeps the synced one.
- **Two tabs offline.** The tab that saved last dropped the other tab's
  edits. Each tab is now a replica that merges in what the others stored
  (new ADR 0018).
- **Joining replaced the outline already on the device.** The toast now
  offers "Add mine back", which copies it under "From this device, <date>".
- **A note over 100,000 characters.** The server rejected the whole batch, so
  nothing synced after it. That change now stays on the device, the status
  dot turns red with a reason, and everything else still syncs.
- **Column view:**
  - Escape left a dead input in the cell.
  - Clicking a note typed into a hidden property line.
  - `{:max}` was summed.
  - Values with mixed units and `1h30` were dropped.
  - `1,200` was read as 1.2.
  - A key written twice edited the wrong line.
  - Hidden completed items counted in totals.
- **CLI:** tables were misaligned with wide characters.
- **Phone:** a tap right after a swipe could be swallowed.

Checks: 101 unit tests, and 156 browser tests across 5 browser profiles
(10 skipped on engines without the touch tooling), all passing. The sync
server code did not change, so the running `sync` container was left alone.

Not done: nothing has been tried on a real phone.

A WorkFlowy-style outliner as an installable, offline PWA. Everything stays in
the browser (localStorage). Time box: 2026-10-07 21:50 to 2026-10-08 03:50.

Part 2, sync and a CLI: 2026-10-07 23:52 to 2026-10-08 05:52. Its plan is
below; part 1's report follows it.

## Session 3 (2026-10-09 00:28, about four hours)

Tasks came from the backlog below and from the outline itself
(Outliner/TODO and Outliner/Comments). Martin's answers, 00:40:

- Big features: my pick, about four hours.
- Folding: keep it shared across devices (backlog item 6 closed, no code).
- Properties `:key: value`: the existing `key::` lines in the live outline
  may be thrown out, so the old form is not kept.
- Allowed without asking: push a branch and open a draft PR, publish to
  `~/srv/pub/outliner-lab/`, restart `sync` if the server changes.

Order of work, small first:

1. Keyboard: Ctrl-E to the end of the item; Ctrl-F / Ctrl-B a character
   forward and back; zoom keys off the browser's history keys; one fold
   toggle on Ctrl-.; Ctrl-N / Ctrl-P in the Ctrl-K list.
2. Ctrl-K also runs commands, each shown with its shortcut.
3. The "Stored only in this browser" line in the menu while syncing.
4. CLI `--before` / `--after`; a Nix package for the CLI.
5. Properties as `:key: value`, with key completion on `:`.
6. Tags as chips, completion from existing tags, a shortcut to add one.
7. Code blocks.
8. Formulas in columns.
9. Capture templates, plus a PWA shortcut and share target into capture.
10. References and mirrors, if time is left.
11. Design notes only: plugins and scripting, encrypted nodes.

Assumptions (Martin away):

- Emacs-style keys stay the model; no vim mode (the comment in the outline
  prefers Emacs and asks for vim only if conflicts pile up).

## Backlog (from Martin, 2026-10-08)

1. ~~**Phone usage.**~~ Done (ADR 0016): a fold target the height of the row
   and wider than the chevron, always visible on touch; swipe right to
   complete or reopen, swipe left to fold or, without children, to open the
   item menu; Collapse / Expand in the item menu. Tested with real touch
   input on the Pixel profile. After Martin's first try: the swipe band was
   drawn below its row (fixed), and a longer left swipe now opens the menu
   on every item (ADR 0019).
2. ~~**Properties and column view, as in org mode.**~~ Done (ADR 0017):
   `key:: value` lines in notes, shown as chips; a column view per page
   with rollups (sum, min, max, mean; numbers with units and durations),
   page totals in a sticky header, editable cells; `columns::` on a page
   declares columns like org's COLUMNS; CLI `set` and `show --columns`.
   Martin's two cases are the browser and unit tests: calories per meal,
   day and week, and effort summed on parents.
3. ~~**Ctrl-N / Ctrl-P to the next and previous item.**~~ Done; bound to the
   Ctrl key itself, so ⌘N and ⌘P stay the browser's.

### Next session (from Martin, 2026-10-08 09:00)

Per-node column mode already works through `columns::` (inherited by the
nodes below); the Columns switch staying per device is fine, Martin sees
value in both.

1. **Code samples.** Something in place of fenced ``` blocks. Research how
   WorkFlowy and Dynalist do it, pick the best fit and build it. (dotflowy
   gives nodes a type, with a note being one type of child; a "code" type
   would be trivial there. Not to be copied, only as a reference point.)
2. **Formulas in columns.** A small spreadsheet on properties. Example: in
   time planning, `start` on an item is the sum of the durations of the
   items before it up to an ancestor (the Monday node), for time tracking.
3. **Scripting and plugins.** Make the app extensible, along the lines of
   Amplenote, where a note with embedded JavaScript becomes a plugin. Needs
   discussion first. One idea to brainstorm: a small Lisp-like language
   whose scripts can be checked statically (walk the AST, expand every
   macro until only resource-access nodes remain, and sandbox on that).
   Probably too much effort; worth a brainstorm.
4. **Capture, as in org-capture.** Templates that file a new item at a set
   place and ask for some properties.
5. **A phone (and maybe Mac) shortcut straight into capture.** Options run
   from a PWA shortcut or share target to a small companion app. A native
   Mac app cannot be built on this Linux machine, so that one needs
   infrastructure changes.
6. **Folding syncs across devices, which surprised Martin.** `collapsed` is
   an item field like any other (ADR 0012). Decide whether it should stay
   shared or be kept per device, like the Columns switch; check what
   WorkFlowy and Dynalist do.
7. **A Nix package for the CLI**, so `outline` installs on other machines
   (the Mac, other NixOS hosts) without this repo's container. The bundle
   in `dist-node/outline.mjs` needs only Node; the package would wrap it
   with `OUTLINE_SERVER` and `OUTLINE_TOKEN` read from the environment or a
   config file, never baked in.
8. **CLI: place an item next to another.** `--before ITEM` and `--after ITEM`
   for `add` and `move`, putting it beside ITEM under ITEM's parent. Today
   only `--under` and `--first` exist.
9. **Ctrl-E to the end of the item**, as in Emacs, instead of inserting
   anything. A `Ctrl` binding in `src/keys.ts` (Ctrl-A would be its pair,
   but it is Select all on Linux and Windows).
10. **Properties written org-style as `:key: value`**, so typing `:` at the
    start of a note line can offer autocomplete of known keys. Today they
    are `key:: value` (ADR 0017, superseded by a new ADR). Notes and the CLI
    already hold `key::` lines: read both forms or convert them.

## Part 2: sync and a CLI

Asked for: the same outline on several devices, plus a CLI for scripting and
for AI agents (an MCP server would be the other option; a CLI was preferred).
Decided with Martin: a server on `dev`, reachable over Tailscale only; no
migration of existing outlines.

Decisions are in doc/adr 0011 to 0014. In short: a small sync server on
`dev`, every client keeps a full copy and merges, fields win by a hybrid
clock, order is kept as fractional positions, the server is Node with its
built-in SQLite and no dependencies, and the CLI is a stateless client of the
same server.

Scope:

1. A shared sync core: per-field changes stamped with a hybrid logical
   clock, diffing two documents into changes, merging changes into a
   replica, and building a document back from a replica (deterministic, so
   every replica shows the same tree, cycles from concurrent moves broken
   the same way everywhere).
2. A sync server: `POST /sync` takes a client's changes and returns
   everything newer than what the client has seen. SQLite file, bearer
   token, CORS for the app's origins.
3. The app: a "Sync" panel in the menu (server URL and token), syncing on
   every change, on focus and every few seconds, a status dot, offline edits
   kept and sent later. Connecting adopts the server's outline if it has
   one, otherwise uploads this device's.
4. A CLI, `outline`, for people and agents: show, find, add, edit, done,
   undone, move, delete, export, all with `--json`, items addressed by id or
   by a text path.
5. Deployment: a `sync` service in compose.yaml on 127.0.0.1:8791, put on
   the tailnet with `tailscale serve` (asked before doing it).
6. Tests: convergence of random concurrent edits, server and CLI against a
   real server, two browsers syncing through it.

Cut: end-to-end encryption, accounts and several users, real-time push
(polling instead), an MCP server (the CLI covers agents that have a shell),
history on the server.

### Part 2 report

Built all six items of the scope, in about three hours of the six.

- **Sync core** (`src/sync/`): hybrid clock, fractional positions, per-field
  merge, diff from documents, deterministic rebuild. A convergence test runs
  40 random seeds of concurrent edits on three devices; crossing moves,
  edits under deleted items and same-text conflicts have their own tests.
- **Server** (`server/`): Node with built-in SQLite, no dependencies, one
  endpoint, token, CORS, input validation. Runs as the `sync` service in
  compose.yaml (`node:24-alpine`, data on the `outliner-lab_sync_data`
  volume), up on 127.0.0.1:8791 now and empty.
- **App**: ⋯ → Sync…, a status dot next to the menu (green synced, pulsing
  blue sending, grey offline, red token refused), pushes 0.4 s after an edit,
  pulls every 5 s and on focus, keeps edits made offline across reloads.
- **CLI** (`cli/`, `bin/outline`): show, find, add (also from stdin), edit,
  note, done, undone, move, rm, export; `--json`, ids or text paths.
- **Tests**: 75 unit (27 new: sync core, server, CLI), 133 browser (5 new:
  two devices both ways, offline, CLI and app together, wrong token, a
  server holding only deleted items).
- One bug found while deploying and fixed test-first: connecting counted
  deleted items as "the server has an outline" and would have replaced the
  device's outline with an empty one.

Not done, left to Martin: putting the server on the tailnet. He first chose
to run it himself, then asked me to; as user `llm` it failed (2026-10-08,
not investigated, per instructions):

```
$ tailscale serve --bg --https=10001 http://127.0.0.1:8791
sending serve config: Access denied: serve config denied

Use 'sudo tailscale serve --bg --https=10001 http://127.0.0.1:8791'.
To not require root, use 'sudo tailscale set --operator=$USER' once.
```

Port 10001 was free at the time (10000, 443 and 8443 are taken). Martin ran
it with sudo; `https://dev.taile622dc.ts.net:10001/health` answers.

Known limits:

- Remote changes reset undo history (ADR 0015).
- Two devices editing the same item's text offline keep only the later edit.
- Polling, not push: another device's edit shows within 5 seconds, or at
  once when the tab regains focus.
- The CLI needs the server; `bin/outline` needs the Compose stack up.
- Podman restarts the `sync` container after a crash (`restart:
  unless-stopped`), but after a reboot only if podman's restart service is
  enabled for this user; otherwise `podman compose up -d sync`.
- Not tested on a real phone or over the tailnet, only in containers.

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
