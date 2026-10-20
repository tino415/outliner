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

## Session 7 (2026-10-20, Nix step 2 up to the move)

- PR 29 (464df0f): the sync server closes open connections on SIGTERM. A
  client that was only connected, or halfway through a request, kept it
  running until podman killed it. Test in `tests/node-bundle.test.ts`,
  failing first. The live container still runs the old server.
- PR 17 merged with a merge commit (9139417, head c0c1637): the module,
  `sync` out of `compose.yaml`, README and AGENTS.md for the service, ADR 42.
  `npm run check` green (one rerun: the plugin drag test is flaky, card in
  TODO). The module's unit builds with the machine's nixos 25.11 channel at
  c0c1637.
- The CLI: Martin wanted it on loopback, and a container cannot reach the
  host's loopback (the tailnet address works from one). `bin/outline` is
  gone; `outline` comes from llm's home-manager (tino415/llm#16,
  `home-manager/outline`) at c0c1637, with `~/.config/outline/config` (0600)
  holding `http://127.0.0.1:8791` and a copy of the token. It already works
  against the container.
- tino415/system#41 squashed (6de90db), pinned to c0c1637, pulled into
  `~/src/system`; nothing rebuilt. Main pulled into `~/src/outliner-lab`.
- The move plan, with steps, backup, verification and rollback, is
  `~/srv/pub/outliner-nix-move/plan.md`. Martin gave the go for when he is
  at the machine; the container runs until then. `/var/lib/private` exists,
  0700.
- Left out: a second signal while the server is closing closes the
  database twice and exits with an error. systemd sends one signal.
- A worktree's own stack: `podman compose -p <name> -f compose.yaml -f
  <override>` with `ports: !reset []` on `app`.

## Session 6 (2026-10-19, Nix step 2 and the sync outage)

Fixed:

- The sync server crashed at every start (502 on outliner-sync.dev.localhost
  and the tailscale route): `server.mjs` imported a shared chunk that
  `Dockerfile.sync` and the Nix package never copy. The node bundles are now
  built one entry at a time into single files; `tests/node-bundle.test.ts`
  starts each one copied alone. PR 18, bb5b211. `sync` rebuilt and recreated
  23:15 at seq 8937; backup
  `~/backups/outliner-lab/outline-2026-10-19-before-chunk-fix.db`.

Nix step 2, not cut over:

- `nix/module.nix` (`services.outline-sync`, DynamicUser, database in
  `/var/lib/outline-sync`): draft PR 17, branch `nix-step2`.
- `configuration.nix` fetches the outliner repo at a pinned commit over
  https and imports the module: draft PR tino415/system#41. Martin chose
  making the repo public over ssh keys or vendored files; only
  `configuration.nix` is copied to `/etc/nixos`.
- Needed before the move: `app` and `bin/outline` reach the host server
  instead of `sync:8791`; `sync` leaves `compose.yaml` so `compose up -d`
  cannot start the old database; PR 41 re-pinned to a commit with bb5b211;
  PR 17 merged with a merge commit; an ADR; PR 41 squashed;
  `/var/lib/private` created 0700 before copying the database.
- The move itself: stop `sync`, back up, root copies the database and the
  token, `nixos-rebuild switch`; rollback is stopping the unit and starting
  the container, whose volume stays.

## Session 5 (2026-10-09 evening to 2026-10-10)

From Martin's requests in the session; since 2026-10-10 the tasks are cards
on the board at Projects/Outliner, and merging and publishing are left to
the agent (AGENTS.md). Main published after this report's commit. The `sync` container was
rebuilt once, for properties (backup in ~/backups/outliner-lab first).

Done, each with tests (PRs #2 to #15):

- Board view (ADR 31); the board fills the window so its scrollbar is at
  the bottom (a `:has()` rule made edits five times slower; a class instead).
- Gaps under items in column view.
- Properties as their own synced field, `prop:<key>`, with chips, Ctrl-;,
  the phone toolbar and a + on the row; note lines lifted once (ADR 32).
  Two review agents found seven bugs in it (properties left readable when
  an item is made private, a typed `:private:` line not sealing, a stale
  device overwriting newer values on upgrade, keys the server refuses
  stopping sync, …); all fixed.
- Plugins: calls take an item or its id, read and set properties, errors
  from calls not awaited are shown.
- Keyboard (ADR 33): Ctrl-K searches items and commands at once with Tab
  for All / Items / Commands; Ctrl-J (⌘J) is a prefix key; the Alt-Shift
  letters are gone, left to typing.
- Fixes from Martin's reports: properties moving to the item above on a
  join, the Private keys dialog cut off on a phone, `.#flake` and `#123`
  read as tags (`\#` now writes a plain #), Capture from the Mac's Dock
  while the app is open (launch_handler and the launch queue).
- A property value starting with `=` is a formula of the item's own
  (ADR 34), for "the rest of the day".

A closing review (two agents, after Martin left) read everything merged
in the session. Fixed, each with a test that failed first (ADR 35):
joining a private item, or its first child into its headline, sent its
content in plain (my fix that left a joined item's properties behind had
dropped `private` too); a stray ⌘J stayed armed until any later letter,
its own key repeat ran Jump, and the tag list took the key after it; Enter
in Ctrl-K could run "Clear this page" for "clear"; one `=…` value made
every render compute the whole page (75 ms, now about 20); a refused key
already queued kept sync stuck; coming back online lifted the note being
typed; a plugin could write `:private:` through `setNote`; formula hovers
and empty results; JSON import dropped capitalised keys. Left as a card:
a typed but not yet lifted `:private:` line, where sync and the outline
briefly disagree on what is private.

Open, on the board under Deciding with proposals and questions: dates,
views and an agenda, plugin events (or a column that completes cards),
mirrors as embeds, `??` in formulas.

Machine issue, not worked around: desktop WebKit dies in the app container
("Failed to apply scheduling attributes … Operation not permitted", then
"browser has been closed"). Martin chose to leave it out: it runs only with
`WEBKIT=1`; the iPhone project still runs.

## Session 4 (2026-10-09, afternoon)

Tasks from Outliner/TODO in the outline. Martin's answers (14:40, asked in
the session and recorded under each task): attachments where I see fit;
private subtrees as one sealed value, structure hidden; all three ordering
proposals; any leading `Words:` is a kind (I advised a declared list); ids
that carry their private item, so links into one are recognisable; merge
to main and push.

Done, each with tests:

- Ctrl-U to the parent item.
- Exports (app and `outline export --md`) write links as their labels.
- `:completed: last`, `:new: top`, Alt-Shift-Enter for a first child (ADR 26).
- Kinds as dark badges, completion, Alt-Shift-K (ADR 27).
- Formulas: time + duration is a time on either side, different units do
  not add, `before()` linear; ⋯ → Formula help with example pages a unit
  test computes.
- `nix run .#outline-sync-server` (step 1 of packaging the server).
- Attachments: paste, drop, Alt-Shift-A; files on the sync server by
  SHA-256, kept in IndexedDB; `outline attach` and `outline file` (ADR 28).
- Private items: Alt-Shift-P, sealed at the sync boundary, keys copied by
  hand, the CLI sees a lock (ADR 29). A review agent read the first
  version and found six ways plaintext or edits could slip through; all
  fixed, each with a test, before anything was published. A second
  review of the fixes found three more (a note-only private item, two
  keys of one name, making public while another device adds inside);
  fixed the same way.
- Plugins: Ctrl-K commands in a sandboxed iframe, approved by an HMAC with
  the `trust` key, so the CLI cannot approve and any code change needs a
  new approval (ADR 30).

Not done or left out:

- Plugin hooks on events (an item was added) and plugins in the CLI: a
  hook would fire once per device; see ADR 30.
- The live `sync` container was rebuilt at 17:44 from main (49a9da8);
  attachments upload from then on. `podman compose up -d --build sync`
  rebuilt the image but kept the old container; it needed
  `--force-recreate`.
- Step 2 of the Nix server (NixOS module, moving the live database) waits
  for Martin.
- Testing on a real phone, and the Todoist project (its connector needs
  Martin's sign-in).
- The performance test failed twice under the full five-browser run while
  passing alone at the same timings as main (13 to 30 ms); load.

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
- Emacs Ctrl keys (A, E, F, B) work on a Mac, where Ctrl is not ⌘. On Linux
  and Windows Ctrl is the command key, so Ctrl-F stays search, Ctrl-B bold,
  Ctrl-E inline code and Ctrl-A select all; the shortcut list there leaves
  the Emacs ones out. Ctrl-N/P and Ctrl-. work everywhere.
- Zoom moved to Ctrl-] / Ctrl-[ (the Ctrl key itself, also on a Mac);
  ⌘[ ⌘] and ⌥← ⌥→ are the browser's again. Browser back still zooms out,
  because zooming changes the address.
- Ctrl-K lists matching commands above matching items; `>` lists commands
  only. Commands are the shortcuts that act on their own plus the ⋯ menu.
- The tag shortcut is Alt-Shift-T (org's `C-c C-q` collides with copy):
  it adds `#` at the end of the item and opens the tag list.
- The capture shortcut is Alt-Shift-N; links are Alt-Shift-L.
- `9:00` written as a value is a time of day and shows as `9:00`; before, it
  showed as `9h`. `1:30` therefore shows as `1:30`, still summed as 1h 30m.

Review round (two review agents, 01:20): 16 bugs confirmed with failing
tests, fixed in two commits ("Fix review round on properties and
formulas", and the palette/completion/code-block/capture round).

Continued at 04:40 (the session had run out of budget at 01:40):

- The two intermittent browser tests failed 10 runs in 20. Both were a key
  arriving before an asynchronous event: Escape in Ctrl-K left the caret
  restore to the dialog's `close` event, which comes a task later, and a key
  after a click reached the completion list before `selectionchange` closed
  it. Escape and a backdrop click now restore the caret at once, and every
  key checks the caret before the list acts on it. 45 runs in 45 pass.
- The rest of the review's list, each with a test shown failing first:
  - CLI config: an unreadable file says `cannot read <path>: EISDIR`
    instead of a stack trace; `# comment` after a value is dropped; an
    empty variable in the environment no longer hides the file's value.
  - `outline capture --template m` also finds the template by its `:key:`.
  - A template is never a capture target, so a template named `Inbox`
    with `:capture: Inbox` files into a separate `Inbox`.
  - Code blocks hold neither links nor tags: backlinks and tag completion
    skip them, and `[[` and `:` inside one type text instead of opening
    the link picker or key completion.
  - In formulas a hyphen joins words only before a letter: `time-spent`
    is a key, `effort-15m` subtracts.
- Still open from the review, judged minor: work in `columnCells` grows
  with the square of the number of siblings (2.6 s for 3,000 siblings with
  a formula); the clock flag follows the left operand (`effort +
  parent.start` shows as a duration); number + number keeps the left unit
  (`5 kg + 3 lb` is `8 kg`); exports write `[[id:…][label]]` raw.
- Checks at 05:00: 161 unit tests and 208 browser tests pass (12 skipped
  on engines without the touch tooling). In one of three full runs "the
  CLI and the app see each other's changes" (e2e/sync.spec.ts) hit its
  30-second timeout; it passed 36 runs in 36 on its own and the next full
  run was clean. Probably load in the shared container; not investigated.

Blocked:

- Converting the three `key::` lines in the live outline (Food plan /
  Monday, musly, greek yoghurt) to `:key:` was refused by Claude Code's
  permission check ("Modify Shared Resources"), so they still read
  `key::` and no longer count as properties. Either retype them, or run:

  ```sh
  bin/outline note y7d6mzbd0tdb ":columns: kcal"
  bin/outline note k5lsnycuwxdq ":kcal: 230"
  bin/outline note jn5h8esweha4 ":kcal: 120"
  ```

  (`+kcal` in the old `columns::` line was read as the key `kcal`.)

## Backlog (from Martin, 2026-10-08)

Since 2026-10-09 the backlog lives in the outline, under Outliner / TODO
(see AGENTS.md). This section is kept as history.

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

1. ~~**Code samples.**~~ Done (ADR 21). Something in place of fenced ``` blocks. Research how
   WorkFlowy and Dynalist do it, pick the best fit and build it. (dotflowy
   gives nodes a type, with a note being one type of child; a "code" type
   would be trivial there. Not to be copied, only as a reference point.)
2. ~~**Formulas in columns.**~~ Done (ADR 22). A small spreadsheet on properties. Example: in
   time planning, `start` on an item is the sum of the durations of the
   items before it up to an ancestor (the Monday node), for time tracking.
3. **Scripting and plugins.** A design note for discussion: doc/design/plugins-and-scripting.md. Make the app extensible, along the lines of
   Amplenote, where a note with embedded JavaScript becomes a plugin. Needs
   discussion first. One idea to brainstorm: a small Lisp-like language
   whose scripts can be checked statically (walk the AST, expand every
   macro until only resource-access nodes remain, and sandbox on that).
   Probably too much effort; worth a brainstorm.
4. ~~**Capture, as in org-capture.**~~ Done (ADR 23). Templates that file a new item at a set
   place and ask for some properties.
5. ~~**A phone (and maybe Mac) shortcut straight into capture.**~~ Done as a PWA shortcut, a share target, `?capture` links and `outline capture` (ADR 23); no companion app. Options run
   from a PWA shortcut or share target to a small companion app. A native
   Mac app cannot be built on this Linux machine, so that one needs
   infrastructure changes.
6. ~~**Folding syncs across devices, which surprised Martin.**~~ Martin, 2026-10-09: keep it shared. `collapsed` is
   an item field like any other (ADR 0012). Decide whether it should stay
   shared or be kept per device, like the Columns switch; check what
   WorkFlowy and Dynalist do.
7. ~~**A Nix package for the CLI**~~ Done: `flake.nix`, built on dev; untested on the Mac. So `outline` installs on other machines
   (the Mac, other NixOS hosts) without this repo's container. The bundle
   in `dist-node/outline.mjs` needs only Node; the package would wrap it
   with `OUTLINE_SERVER` and `OUTLINE_TOKEN` read from the environment or a
   config file, never baked in.
8. ~~**CLI: place an item next to another.**~~ Done. `--before ITEM` and `--after ITEM`
   for `add` and `move`, putting it beside ITEM under ITEM's parent. Today
   only `--under` and `--first` exist.
9. ~~**Ctrl-E to the end of the item**~~ Done, on a Mac (see session 3 assumptions). As in Emacs, instead of inserting
   anything. A `Ctrl` binding in `src/keys.ts` (Ctrl-A would be its pair,
   but it is Select all on Linux and Windows).
10. ~~**Properties written org-style as `:key: value`**~~ Done (ADR 20). So typing `:` at the
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
- ~~A new version shows on the next start, without a prompt.~~ Since
  2026-10-09 a toast offers Reload (ADR 25).
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
