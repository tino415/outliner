# 45. The sync server also serves the app

- **Status:** accepted, 2026-10-22
- **Applies to:** `server/app.ts`, `server/app-files.ts`, `server/main.ts`, `nix/outline.nix`, `nix/module.nix`, `flake.nix`
- **Decides:** installing the app with the Nix package, 2026-10-22

## Context

The app should install on a NixOS system from this repository, folded into
the sync package. The app is static files (`dist/`); until now they were
copied by hand to a directory a web server serves. The Nix package already builds the
sync server and the CLI from the same sources.

## Decision

**The package `outline` also builds the app** and installs `dist/` as
`share/outline/app`. Its commit is the flake's `shortRev`, or the
module's `buildCommit`.

**The sync server serves the app on its own port when `OUTLINE_APP_DIR`
names a directory**: a GET for a file in it is answered without the
token, `/` is `index.html`. Everything else, and every path that is not a
file there, goes on to the token check as before, so sync and attachments
are not reachable without it. A path that leaves the directory is not a
file there.

**The module turns this on with `services.outline-sync.serveApp`**, off
by default, so moving `rev` does not change what the live server answers
until the option is set.

## Options considered

**A second package and a second service for the app**, or an nginx
virtual host on the package's files. The app and the server it syncs with
would be versioned and deployed apart, and a NixOS system would need a
web server for a handful of static files.

**Serving the app always**, with no option. One fewer setting, but a
server that exists only for sync would answer `/` with a page.

## Consequences

- A system that sets `serveApp` reaches the app and its sync server at
  one address, so the app's origin and the sync origin are the same.
- Building the package now runs the app's Vite build too.
- A copy of `dist/` on a static host still works; moving a deployment to
  `serveApp` is a separate step.
