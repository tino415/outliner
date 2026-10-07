# 13. A dependency-free Node server with SQLite

- **Status:** accepted, 2026-10-07
- **Applies to:** `server/`, `compose.yaml`

## Context

The server only stores fields and hands out what changed. It runs on `dev`
in the Compose stack, next to the toolchain that builds the app.

## Decision

Node 24's `node:http` and `node:sqlite`, no npm dependencies. One table holds
the current value of every field with its clock and a sequence number that
increases on every accepted write. `POST /sync` with `{ since, changes }`
merges the changes and answers `{ seq, changes }`: every field written after
`since`, including the caller's own. A client remembers `seq` and asks for
what came after it next time.

The server and the CLI are TypeScript sharing `src/model.ts` and
`src/sync/`, bundled with Vite's server build.

Access needs `Authorization: Bearer <token>`, the token coming from the
environment. CORS allows the origins the app is served from.

## Options considered

**Express, Fastify, a hosted database.** Rejected: one endpoint and one
table do not need them, and every dependency is something to audit.

**Server-sent events or WebSockets for live updates.** Deferred: the app
polls every few seconds while visible, which is enough for one person
switching devices.

## Consequences

- The database is one file on a named volume; backing it up is copying it.
- Losing the token means setting a new one in the environment and on each
  device.
