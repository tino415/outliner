# 14. A stateless CLI instead of an MCP server

- **Status:** accepted, 2026-10-07
- **Applies to:** `cli/`

## Context

Scripts and AI agents should read and change the outline. Agents
that have a shell, Claude Code among them, can run any command; an MCP
server would add a protocol only some clients speak.

## Decision

A CLI, `outline`, that talks to the sync server like any other client. Each
run fetches the whole outline, applies one command with the same tree
operations the app uses, and sends the resulting changes. It keeps no state
between runs, so it never has stale data or a cache to repair.

Items are addressed by id or by a text path (`Projects/Garden`). Every
command can print JSON (`--json`), and text input can come from stdin, so it
composes with pipes and is easy for an agent to parse.

## Options considered

**An MCP server.** Deferred: it can later wrap the same commands; doing it
first would leave scripts without a tool.

**Reading and writing the SQLite file directly.** Rejected: it would bypass
the merge, and the CLI could not run anywhere but on the server's machine.

## Consequences

- The CLI needs the server; it does not work offline.
- Fetching the whole outline per command is fine for thousands of items, not
  for millions.
