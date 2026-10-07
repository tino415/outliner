# 5. A hand-written service worker, cache first

- **Status:** accepted, 2026-10-07
- **Applies to:** `src/sw.template.js`, `serviceWorker()` in `vite.config.ts`

## Context

The app must install as a PWA and start offline. The build emits hashed file
names, so the service worker needs to know them, and the app is served from
a sub-path (`/outliner-lab/`) on the published host.

## Decision

A 30-line service worker, generated at build time from a template. A small
Vite plugin writes the exact list of built files and a version hash derived
from that list into `sw.js`. On install it caches the whole list; on activate
it deletes older caches.

Every same-origin GET is answered from the cache first, navigations included,
with the network only as a fallback. All paths are relative and the build
uses `base: "./"`, so the same build works at `/` and under any sub-path.

Cache matching ignores `Vary`. Measured: with the Vite preview server, cached
module scripts did not match their own requests, and the app came up offline
as an unstyled page with no script.

## Options considered

**vite-plugin-pwa / Workbox.** Rejected: a large dependency tree to produce
the same 30 lines.

**Network first for navigations.** Tried first and dropped: on a flaky or
absent network (Tailscale down) startup waits for the network to fail before
falling back.

## Consequences

- A new version is fetched in the background and shows on the next start,
  not the current one. There is no "update available" prompt.
- `e2e/pwa.spec.ts` pins the offline start: load, wait for the worker, go
  offline, reload, see the outline.
