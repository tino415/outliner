# Working on this repository

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
