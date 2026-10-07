# 10. Version the service worker by content

- **Status:** accepted, 2026-10-07
- **Supersedes:** how [0005](0005-hand-written-service-worker.md) versions the
  cache (a hash of the built file names). The rest of 0005 stands.
- **Applies to:** `serviceWorker()` in `vite.config.ts`, `src/sw.template.js`

## Context

A review found that a build whose only change was `index.html` or a file in
`public/` produced a byte-identical `sw.js`. Hashed asset names change with
their content, but `index.html` is not in the bundle when `generateBundle`
runs, and public files keep their names. The browser saw no new worker, and
the cache-first worker kept serving the old `index.html`, which holds the
markup for the menu, the toolbar and the dialogs.

The same review pointed out that `cache.addAll` goes through the HTTP cache,
so a new worker could pair an old `index.html` with new assets.

## Decision

Write `sw.js` in `writeBundle`, after everything else is on disk. List every
file in the output directory, hash their paths and contents, and use that
hash as the cache version. Precache requests use `cache: "reload"` so they
bypass the HTTP cache.

Verified by building twice with a one-word change to `index.html`: the cache
name changed from `outliner-lab-1502fbb9fc85` to `outliner-lab-c6e38f616d25`.

## Consequences

- Any change to any shipped file installs a new worker. Two identical builds
  produce identical workers, so rebuilding without changes does not churn
  installed clients.
- The build commit is part of the bundle (`__BUILD_COMMIT__`), so builds of
  different commits always produce different workers, even when nothing else
  changed.
- Updates still show on the next start, not the current one; there is no
  "update available" prompt.
