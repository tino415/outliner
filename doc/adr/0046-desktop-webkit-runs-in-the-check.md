# 46. Desktop WebKit runs in the check, and the app container has no process limit

- **Status:** accepted, 2026-10-22
- **Supersedes:** [41](0041-one-check-command-and-projects-picking-tests-by-tag.md) where `@keys` runs in WebKit only when `WEBKIT=1`; the rest of 41 stands
- **Applies to:** `compose.yaml`, `compose.worktree.yaml`, `playwright.config.ts`, `README.md`, `AGENTS.md`

## Context

Desktop WebKit ran only with `WEBKIT=1` because it died in the app container
("Failed to apply scheduling attributes … Operation not permitted", then
"browser has been closed"). On a Mac the app runs in Safari, so WebKit is the
engine that matters there.

## Decision

**The `webkit` project is part of `npm run check`**, running the `@keys`
tests; `WEBKIT=1` is gone. **The app container sets `pids_limit: -1`.**

The scheduling message is only log noise: it also appears in passing runs.
`cap_add: SYS_NICE` with a 1 GB `shm_size` did not help; the same three
tests in `editing.spec.ts` failed in three full runs. The container's
default limit of 2048 processes was the cause: WebKit starts many threads,
and a browser launching while the other projects' browsers ran failed with
"Target page, context or browser has been closed". With the limit off, three
full runs passed (one with the first performance try slow, which the retry
covers).

## Consequences

- A stack started from an older compose file still has the limit; recreate it
  with `podman compose up -d`.
- The `webkit` skips are the ones `iphone` and `firefox` already have in
  `expectedSkips`.
