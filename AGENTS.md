# Working on this repository

## Using the outline

Martin's outline is reachable from a shell with `outline`, installed for
the account at the commit the server runs (see README, "CLI"). Prefer `--json`
and item ids when acting on it; `outline help`
lists the commands. It changes the real outline on every device, so read
before writing and do not delete without being asked.

## Changing the code

- Run every toolchain command through `podman compose exec app` (see README). Bring the stack
  up with `podman compose up -d` first; without it `podman compose exec app` falls back to the
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

- The remote is `git@github.com:tino415/outliner.git` (public, so the
  machine's `configuration.nix` can fetch it); `main` there
  holds all work so far. Work on a branch and open a PR; do not push to
  `main` directly. Martin left merging to the agent
  (2026-10-10): once the tests pass, merge the PR yourself,
  without waiting for him. Deploying the sync server still needs the backup
  first.
- Worktrees are made with `git -C <main checkout> worktree add
  .claude/worktrees/<x> -b <branch>`, then `cd` into them. Git for main runs
  as `git -C <main checkout> …`, e.g. `git -C <main checkout> pull`.
  A worktree's own compose stack runs with
  `podman compose -p <worktree dir> -f compose.worktree.yaml up -d`, which
  publishes no ports.
- `.env.sync` (the sync token) is gitignored and exists only in the checkout
  that created it. Do not print it, commit it or regenerate it: a new token
  disconnects every device.
- The project's tasks are cards on the board at "Projects/Outliner"
  (since 2026-10-10), tagged #feature, #bug, #keyboard, #test. Read it with
  `outline show Projects/Outliner --ids` at the start of a session.
  The columns:
  - Deciding: not agreed yet. Write a proposal (what, why, trade-off)
    into the card's note, questions as "Question: …" children; Martin
    moving the card to TODO approves it.
  - TODO: agreed, or an obvious bug fix; take from here.
  - Implementing: move a card here when starting it.
  - Review: merged; add a one-line note on how to try it.
  - Done: Martin moves cards here, or back with a comment.
  Move cards with `outline move <id> --under <column id>`. The item
  "Outliner" at the top keeps Martin's remarks in "Comments" and an item
  per session with what needs him; its old "TODO" is empty. NOTES.md keeps
  the session reports; its "Backlog" section is history.

## Live services

- The NixOS service `outline-sync` holds Martin's real outline and is
  reached by his phone and Mac (README, "Sync server"). Browser and unit
  tests start their own server (`e2e/sync-server.ts`); never point a test
  at the live one.
- Deploy the server whenever `server/`, the app or the wire format in
  `src/sync/protocol.ts` changes, and say so in the report: back up, move
  `rev` in `configuration.nix` (repository the machine's configuration repository) to the merged
  commit, and ask Martin before `nixos-rebuild switch`. The sync server
  serves the app (`serveApp`), so an app change reaches the phone and the
  Mac only after that install. Changing what the server accepts needs the app
  and the server to agree; old clients keep running on phones.
- The commit shows at the bottom of the ⋯ menu (`buildCommit`), which is how
  Martin checks what his phone runs.

## Tests

- The merge gate is
  `flock ~/.cache/outliner-gate.lock podman compose exec app npm run check`, so only one
  runs at a time on the machine: build, unit suite, and every
  Playwright project (desktop, phone, iPhone, Firefox, desktop WebKit). It fails on a
  skipped test that is not in `expectedSkips` in `e2e/skip-gate.ts`, and on
  `test.only`. Do not merge on anything less.
- A PR that touches only `doc/`, NOTES.md or TODO.md needs only
  `podman compose exec app npm run build` before merging. A feature's NOTES.md entry goes in
  the feature's PR, not a PR of its own.
- Projects pick tests by tag (doc/adr/0041). Untagged tests run on desktop
  only. `@phone` adds the Pixel phone, `@touch` means phones only (Pixel
  and iPhone, never desktop), `@keys` adds Firefox and desktop WebKit.
  Tag a test `{ tag: "@phone" }`, or a whole `test.describe`;
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
