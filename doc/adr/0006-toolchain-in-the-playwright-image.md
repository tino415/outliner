# 6. The toolchain and the browsers live in the Playwright image

- **Status:** accepted, 2026-10-07
- **Applies to:** `compose.yaml`, `Dockerfile.dev`, `playwright.config.ts`

## Context

Nothing is installed on the host. Commands go through `dev-run`, which sends
them into the `app` service of this project's Compose stack when one is up.
The browser tests need Chromium. The host has nixpkgs browsers, but a
`@playwright/test` installed inside the container would not find them, and
mixing a container's Node with the host's browsers splits the toolchain
across two places.

## Decision

`Dockerfile.dev` starts from `mcr.microsoft.com/playwright:v1.63.0-noble`,
which carries Node and browsers matching `@playwright/test` 1.63.0, pinned
exactly in `package.json`. The service idles (`sleep infinity`); the work
directory is bind-mounted at `/workspace` and `node_modules` is a named
volume, so the host never sees or runs those binaries.

The tests build nothing themselves: `playwright.config.ts` serves the last
`vite build` through `vite preview` on port 5189 inside the container, so
the browser tests run against what will be published, service worker
included.

## Options considered

**`node:24` plus the nixpkgs browsers from the host.** Rejected: browser
binaries from the host's store inside the container, and a version coupling
between nixpkgs and npm that nobody would see until it broke.

**Testing against the Vite dev server.** Rejected: the service worker and
the hashed assets exist only in the build, and those are the parts most
likely to break offline.

## Consequences

- The image is about 2.6 GB, pulled once.
- Upgrading `@playwright/test` means changing the image tag in the same
  commit.
- `npm run build` has to run before `npx playwright test`; the suite does
  not rebuild on its own.
