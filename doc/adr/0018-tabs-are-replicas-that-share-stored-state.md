# 18. Tabs are replicas that share stored state

- **Status:** accepted, 2026-10-08
- **Applies to:** `src/syncing.ts`, `onDocChangedInAnotherTab` in `src/storage.ts`

## Context

The sync state (replica, queue of unsent changes, last sequence number) is
one localStorage entry per browser. Two tabs each held it in memory and
wrote it back whole, so the tab that wrote last dropped what the other had
queued. Offline, that lost edits for good. Both tabs also stamped with the
same device id, so their clocks could collide.

## Decision

While syncing, each tab is a replica of its own:

- it stamps with `<device>.<tab>`, a clock id of its own;
- before writing the shared entry it merges in what is stored: the replica
  field by field, the queues keeping the latest change per field, the
  highest sequence number;
- on a storage event for that entry it does the same and shows what won;
- the outline entry from other tabs
  ([0004](0004-localstorage-and-snapshot-undo.md)) is ignored while
  syncing, since the replica carries the same changes.

## Consequences

- A change can be sent twice, by two tabs that both had it queued. The
  server and every replica ignore a change whose clock they already hold.
- Changes another tab brings in reset undo history, as remote ones do
  ([0015](0015-remote-changes-reset-undo-history.md)).
