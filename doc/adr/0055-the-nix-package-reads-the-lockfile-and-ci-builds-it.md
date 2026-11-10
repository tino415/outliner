# 55. The Nix package reads the lockfile, and CI builds it

- **Status:** accepted, 2026-11-10
- **Applies to:** `nix/outline.nix`, the `nix-package` job in
  `.github/workflows/ci.yaml`

## Context

A change to `package-lock.json` that left `npmDepsHash` in `nix/outline.nix`
stale passed `npm run check` and CI, and failed only when the deploy ran
`nixos-rebuild`. Nothing before the merge evaluated the Nix package.

## Decision

- The package takes its dependencies from `importNpmLock`, which reads
  `package-lock.json` at evaluation time, so no hash is kept in the repository.
- CI builds `.#outline` on every PR that is not documentation only, so any
  other change that breaks the package fails before the merge too.

## Consequences

- Each dependency is fetched as its own derivation, which is slower on a cold
  store.
- The CI run takes a few minutes longer per PR.
- Every lockfile entry needs `resolved` and `integrity`; npm writes both.
