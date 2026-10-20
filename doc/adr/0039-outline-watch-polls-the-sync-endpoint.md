# 39. `outline watch` polls the sync endpoint

- **Status:** accepted, 2026-10-20
- **Applies to:** `cli/watch.ts`, `cli/run.ts`
- **Decides:** the script layer of the card "Plugin: add option to query and be triggered by adding node to node" (Projects/Outliner), with Martin's answers of 2026-10-19

## Context

Plugin events (ADR 38) fire only in the tab that made the change. A move
made from the CLI, by an agent or on an untrusted phone needs something
that sees changes from everywhere.

## Decision

**`outline watch` keeps running and prints one line per change**, made on
any device from the moment it starts: the events of ADR 38 with ids,
`{"event", "id", "from", "to"}`, with `--json`, or a line of words
without it.

**It polls the existing `/sync` endpoint** from the last sequence number
it has seen, every 5 seconds by default (`--every N`), and keeps its own
copy of the outline to compare before and after. The server and the wire
format do not change.

**Private items print nothing**: they are sealed to the CLI.

**Scripts are trusted as the CLI is**: they have the token, with no
sandbox and no approval. A script stops its own loops by checking the
state before acting.

## Options considered

**Running plugin code under `outline watch`.** It would need a sandbox
under Node, which ADR 30 left out; Martin chose shell scripts with `jq`.

**A push stream from the server.** It needs a server change and a sync
rebuild; polling every few seconds is enough for scripts.

## Consequences

- A script reacts within a few seconds, not at once.
- A script needs a process kept running, such as a systemd user unit.
