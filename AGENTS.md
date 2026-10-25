# Working on this repository

Setup that belongs to one machine (how commands reach the container, the
live server and how work is tracked there) goes in `AGENTS.local.md`, which
is gitignored.

## Changing the code

- Run every toolchain command in the `app` container of the Compose stack
  (see README). Bring the stack up with `podman compose up -d` first; the
  browsers exist only in the container.
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

- `main` on `git@github.com:tino415/outliner.git` holds all work. Work on a
  branch and open a PR; do not push to `main` directly.
- A worktree's own compose stack runs with
  `podman compose -p <worktree dir> -f compose.worktree.yaml up -d`, which
  publishes no ports.
- `.env.sync` (the sync token) is gitignored and exists only in the checkout
  that created it. Do not print it, commit it or regenerate it: a new token
  disconnects every device.

## The sync server

- Browser and unit tests start their own server (`e2e/sync-server.ts`);
  never point a test at a live one.
- The sync server serves the app (`serveApp`), so an app change reaches
  devices only when the server is redeployed. Changing what the server
  accepts needs the app and the server to agree; old clients keep running
  on phones.
- The commit shows at the bottom of the ⋯ menu (`buildCommit`), which is
  how to check what a device runs.

## Tests

- The merge gate is `npm run check` in the `app` container, one run at a
  time on the machine: build, stylelint on the CSS, unit suite, and every
  Playwright project (desktop, phone, iPhone, Firefox, desktop WebKit). It fails on a
  skipped test that is not in `expectedSkips` in `e2e/skip-gate.ts`, and on
  `test.only`. Do not merge on anything less.
- CI (`.github/workflows/ci.yaml`) runs `npm run check:ci`, the check without the
  timed `performance` project, which the shared runner is too slow for, in the Playwright
  image. A PR from a `docs/*` branch may change only Markdown and runs only
  `npm run check:docs` (prettier on `**/*.md`) instead.
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
