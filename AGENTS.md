# Working on this repository

## Using the outline

Martin's outline is reachable from a shell with `bin/outline` (see README,
"CLI"). Prefer `--json` and item ids when acting on it; `bin/outline help`
lists the commands. It changes the real outline on every device, so read
before writing and do not delete without being asked.

## Changing the code

- Run every toolchain command through `dev-run` (see README). Bring the stack
  up with `podman compose up -d` first; without it `dev-run` falls back to the
  sandbox, which has no browsers.
- `npx playwright test` serves `dist/`, so run `npm run build` first or the
  tests exercise the previous build.
- Rendering keeps rows between renders (doc/adr/0009). Any new display state
  that changes a row's markup must go into the display-state string in
  `renderItem`, or the row will not be rebuilt. A change that edits the DOM
  directly instead of rendering goes through `commitShownEdit`, never bare
  history commits.
- Shortcuts live in one table in `src/keys.ts`: editor, selection and global
  bindings. Global ones say where they apply (`reach`) instead of being
  special-cased in the handler.
- Item text is raw text with markdown markers kept in the DOM
  (doc/adr/0003). `renderInline` output must have the raw text as its
  `textContent`; `tests/transfer.test.ts` pins this.
- Bug fixes come with a browser or unit test in `e2e/regressions.spec.ts` or
  `tests/`, committed first and shown failing.
- New decisions get a record in `doc/adr`; accepted records are not edited,
  they are superseded.

## Where the work is

- The remote is `git@github.com:tino415/outliner.git` (private); `main` there
  holds all work so far. Work on a branch and open a PR; do not push to
  `main` directly. Martin left merging and publishing to the agent
  (2026-10-10): once the tests pass, merge the PR yourself and publish,
  without waiting for him. Rebuilding `sync` still needs the backup first.
- A session working in a worktree under `.claude/worktrees/` cannot run git
  in the main checkout (`~/src/outliner-lab`); to pull main there (needed
  before rebuilding `sync`), leave the worktree keeping it, run git in the
  checkout, and enter the worktree again. A worktree has no `.env.sync`, so
  its own compose stack needs a separate project name and an empty one.
- `.env.sync` (the sync token) is gitignored and exists only in the checkout
  that created it. Do not print it, commit it or regenerate it: a new token
  disconnects every device.
- The project's tasks are cards on the board at "Projects/Outliner"
  (since 2026-10-10), tagged #feature, #bug, #keyboard, #test. Read it with
  `bin/outline show Projects/Outliner --ids` at the start of a session.
  The columns:
  - Deciding: not agreed yet. Write a proposal (what, why, trade-off)
    into the card's note, questions as "Question: …" children; Martin
    moving the card to TODO approves it.
  - TODO: agreed, or an obvious bug fix; take from here.
  - Implementing: move a card here when starting it.
  - Review: merged and published; add a one-line note on how to try it.
  - Done: Martin moves cards here, or back with a comment.
  Move cards with `bin/outline move <id> --under <column id>`. The item
  "Outliner" at the top keeps Martin's remarks in "Comments" and an item
  per session with what needs him; its old "TODO" is empty. NOTES.md keeps
  the session reports; its "Backlog" section is history.

## Live services

- The `sync` container holds Martin's real outline and is reached by his
  phone and Mac. Browser and unit tests start their own server
  (`e2e/sync-server.ts`); never point a test at the live one.
- Rebuild and restart `sync` (`podman compose up -d --build --force-recreate
  --no-deps sync`; without `--force-recreate` the old container keeps
  running the old image) only when
  `server/` or the wire format in `src/sync/protocol.ts` changes, and say so
  in the report. Changing what the server accepts needs the app and the
  server to agree; old clients keep running on phones.
- Publishing: build with `BUILD_COMMIT=<short sha>`, remove the old files in
  `~/srv/pub/outliner-lab/`, then copy `dist/.` there. The commit shows at the
  bottom of the ⋯ menu, which is how Martin checks what his phone runs.

## Tests

- The merge gate is `dev-run npm run check`: build, unit suite, and every
  Playwright project (desktop, phone, iPhone, Firefox). It fails on a
  skipped test that is not in `expectedSkips` in `e2e/skip-gate.ts`, and on
  `test.only`. Do not merge on anything less.
- Projects pick tests by tag (doc/adr/0041). Untagged tests run on desktop
  only. `@phone` adds the Pixel phone, `@touch` means phones only (Pixel
  and iPhone, never desktop), `@keys` adds Firefox (and WebKit with
  `WEBKIT=1`). Tag a test `{ tag: "@phone" }`, or a whole `test.describe`;
  a phone bug's test in `regressions.spec.ts` needs `@phone`.
  `tests/playwright-projects.test.ts` checks that every spec file runs
  somewhere, not that a test has the tag it needs.
- The performance tests (`@performance`) run last, in a project of their
  own that waits for all the others and retries twice, so a machine
  loaded by other sessions does not push them over their budget. A
  "flaky" performance test in the summary means it was slow at least once. Run them alone with
  `npx playwright test --project=performance --no-deps`.
- Which binding a key gets, on a Mac and elsewhere, is unit-tested in
  `tests/keys.test.ts`, passing the platform to `bindingFor`. Browser tests
  fake `navigator.platform` only where the whole path matters.
- Real touch input goes through the Chrome DevTools protocol
  (`Input.dispatchTouchEvent`), so touch tests skip outside Chromium.
  Chrome itself swallows a tap that follows a fast swipe (it stops the
  fling); swipe tests that tap afterwards use a slow, short swipe.
- A test must fail against the old code before it counts. Check that it
  exercises the broken path: a click-swallowing bug is invisible to a test
  that only checks focus, which comes from pointerdown.
- Running the suite rewrites `screenshots/`; commit them with the change
  that altered the UI.

## Conventions set so far

- Commits: one plain line, no trailers; a bug fix is the failing test
  committed alone as WIP, then the fix amended into it.
- Settings that belong to the outline (column specs) live in the outline as
  `:key: value` lines, so they sync and the CLI sees them; settings of one
  device (theme, the Columns switch) live in `Prefs`.
- "Mod" in `src/keys.ts` is Ctrl or ⌘ alike; "Ctrl" bindings are the Ctrl
  key itself (Emacs habits on a Mac). Ctrl-N cannot be taken from Chrome on
  Linux or Windows.
