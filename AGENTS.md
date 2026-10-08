# Working on this repository

## Using the outline

Martin's outline is reachable from a shell with `bin/outline` (see README,
"CLI"). Prefer `--json` and item ids when acting on it; `bin/outline help`
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

- The remote is `git@github.com:tino415/outliner.git` (private); `main` there
  holds all work so far. Work on a branch and open a PR; do not push to
  `main`.
- `.env.sync` (the sync token) is gitignored and exists only in the checkout
  that created it. Do not print it, commit it or regenerate it: a new token
  disconnects every device.
- The backlog for the next sessions is in NOTES.md, "Backlog".

## Live services

- The `sync` container holds Martin's real outline and is reached by his
  phone and Mac. Browser and unit tests start their own server
  (`e2e/sync-server.ts`); never point a test at the live one.
- Rebuild and restart `sync` (`podman compose up -d --build sync`) only when
  `server/` or the wire format in `src/sync/protocol.ts` changes, and say so
  in the report. Changing what the server accepts needs the app and the
  server to agree; old clients keep running on phones.
- Publishing: build with `BUILD_COMMIT=<short sha>`, remove the old files in
  `a static host directory`, then copy `dist/.` there. The commit shows at the
  bottom of the ⋯ menu, which is how Martin checks what his phone runs.

## Tests

- Each Playwright project runs a subset picked by file name in
  `playwright.config.ts` (`phone` runs only `mobile`, `screenshots` and
  `columns` specs). A new spec file outside those names never runs on the
  phone.
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
  `key:: value` lines, so they sync and the CLI sees them; settings of one
  device (theme, the Columns switch) live in `Prefs`.
- "Mod" in `src/keys.ts` is Ctrl or ⌘ alike; "Ctrl" bindings are the Ctrl
  key itself (Emacs habits on a Mac). Ctrl-N cannot be taken from Chrome on
  Linux or Windows.
