# 15. Remote changes reset undo history

- **Status:** accepted, 2026-10-08
- **Applies to:** `src/syncing.ts`, `History.reset` in `src/store.ts`

## Context

Undo restores whole-document snapshots
([0004](0004-localstorage-and-snapshot-undo.md)). With sync, a snapshot taken
before another device's edit arrived does not contain that edit. Undoing to
it would make the document look as if the edit never happened, the diff
([0012](0012-merge-fields-by-hybrid-clock-order-by-fractional-position.md))
would turn that into changes, and the other device's work would be reverted
everywhere.

## Decision

When a sync round brings changes that win against the local replica, the
document is rebuilt from the replica and the undo history starts over.
Changes that come back from the server but were made on this device do not
win (their clocks are equal), so they leave the history alone. With one
device in use at a time, which is the normal case for one person, undo
works as before.

## Options considered

**Rebasing every snapshot onto the remote changes.** Rejected for now: a
snapshot has no replica of its own, so rebasing would mean keeping a replica
per undo step or replaying field changes onto each snapshot.

**Undo as inverse field changes.** The proper fix, deferred: undo would
record, per step, the previous value of every field it wrote, and undo would
write those values back with new clocks. It replaces the snapshot history.

## Consequences

- Editing on two devices at the same time loses undo steps on the device
  that receives changes.
- Changes arriving from another tab of the same browser still go through
  the old path and stay undoable, because that tab sends them to the server
  itself.
