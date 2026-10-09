# 25. A new version offers a reload

- **Status:** accepted, 2026-10-09
- **Applies to:** `src/updates.ts`, `toast` in `src/chrome.ts`
- **Supersedes:** the "no update prompt" item of the first session's cut list

## Context

The service worker serves the app from its cache and takes over as soon as
a new version installs ([0005](0005-hand-written-service-worker.md),
[0010](0010-version-the-service-worker-by-content.md)). The page already on
screen keeps running the old code, and a phone keeps an installed app alive
for days. Martin could not tell how to update the app on his phone and
reinstalled it, which also cleared his sync settings.

## Decision

**Coming back to the app looks for a new version** (`registration.update()`
when the page becomes visible), on top of the browser's own check at start.

**When a new version takes over a page that already had one, a toast says
"A new version is ready" with Reload**, and stays until used. On the first
install there is nothing to replace, so no toast.

## Options considered

**Reload by itself when the new version takes over.** Rejected: it would
pull the page away mid-edit.

**Wait for the user instead of taking over (no `skipWaiting`).** Rejected:
the new version would then only run once every tab is closed, which on a
phone may be never.

## Consequences

- Updating is: open the app, tap Reload.
- The browser test serves the build on a port of its own so it can change
  `sw.js` mid-test; Playwright cannot intercept the service worker's own
  update request.
