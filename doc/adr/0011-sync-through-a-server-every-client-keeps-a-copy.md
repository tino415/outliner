# 11. Sync through a server; every client keeps a full copy

- **Status:** accepted, 2026-10-07
- **Supersedes:** "sync, sharing, accounts: out of scope" from part 1's cut
  list, for sync only. [0004](0004-localstorage-and-snapshot-undo.md) still
  holds for the browser's own copy.
- **Applies to:** `src/sync/`, `server/`, `cli/`

## Context

The same outline should be on a Mac and a phone, with a CLI so scripts and
AI agents can read and change it. The data must stay on private machines. The
options were a server on one of them, browsers syncing peer to peer, or a
mix.

## Decision

A small sync server on a private machine, reachable only over Tailscale.
Every client, the app on each device and the CLI, works on a full copy of the outline and
exchanges changes with the server. The app keeps working offline and sends
its changes when it can reach the server again.

## Options considered

**Browsers syncing peer to peer.** Rejected: two devices would have to be
online at the same moment, they need signalling and NAT traversal, and a CLI
has no natural place in it. Nothing would hold a copy when every browser is
closed.

**The server as the only copy, clients as views.** Rejected: the app would
stop working offline, which part 1 promised (0005).

## Consequences

- Clients merge changes, so the merge has to be deterministic and commutative
  ([0012](0012-merge-fields-by-hybrid-clock-order-by-fractional-position.md)).
- The server holds the outline in plain text on that machine. Tailscale is the
  boundary; there is no end-to-end encryption.
- One outline, one user. A token keeps other software on the tailnet out; it
  is not an account system.
