# 12. Merge fields by hybrid clock, order by fractional position

- **Status:** accepted, 2026-10-07
- **Applies to:** `src/sync/`

## Context

Two devices edit offline and then sync. The merge must give every replica
the same outline whatever order changes arrive in, without a library, and
the app's model (immutable `Doc`, children arrays, 0002) should not change.

## Decision

A replica is a set of fields per item: `text`, `note`, `parent`, `position`,
`collapsed`, `completed`, `deleted`. Each field carries the clock of the
change that last wrote it, and a change wins if its clock is greater
(last writer wins, per field). Clocks are hybrid logical clocks written as
sortable strings: wall time, a counter, and the device id as tie-breaker.

Sibling order is not an array but a `position` string per item: a
fractional index that sorts between its neighbours. Inserting or moving an
item writes only that item's `parent` and `position`.

Clients do not emit changes themselves. After every commit, the sync layer
diffs the previous and next `Doc` and turns the difference into field
changes. Undo, paste, import and every tree operation therefore sync
without knowing about sync. Remote changes go the other way: merged into the
replica, then a `Doc` is built from it, reusing unchanged items so row reuse
(0009) still works.

Building a `Doc` is deterministic: children sorted by position then id;
items under a deleted or unknown parent are not shown; a cycle from two
crossing moves is broken by putting the cycle's member with the latest
`parent` change under the root.

## Options considered

**Yjs or Automerge.** Rejected: both are large, both would replace the
document model the whole app is built on, and neither moves tree nodes
without its own workarounds. Per-field last-writer-wins is a few hundred
lines and enough for one person on a few devices.

**Operation logs replayed in order.** Rejected: replaying needs a total order
and undo of remote operations; field state with clocks needs neither.

## Consequences

- Concurrent edits to different items, or different fields of one item,
  merge cleanly. Two devices editing the same item's text offline keep the
  later edit and lose the other one.
- A deleted item is kept as a tombstone so a late edit cannot bring it back
  half-alive; tombstones are never collected.
- Moving an item under another one that was deleted elsewhere hides it
  along with the deleted subtree.
