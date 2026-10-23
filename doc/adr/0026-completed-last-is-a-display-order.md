# 26. Completed items last is an order of display, new items on top a page property

- **Status:** accepted, 2026-10-09
- **Applies to:** `childrenInOrder`, `newChildIndex` in `src/model.ts`, `src/capture.ts`, `cli/run.ts`

## Context

A task list collects new tasks at the bottom while finished ones pile up
at the top, so the open work is the last thing on the page. Completed
items should go to the end and new ones to the top. All three proposals
were taken: completed items sink, a command adds a first child,
and a page can file new items at the top.

## Decision

**`:completed: last` changes the order children are shown in, not the
stored order.** It applies to the page it is on and every page below,
until a page says otherwise. `shownChildren` returns open children first,
and moving, indenting and walking with the keys follow that shown order,
so what sits above an item on screen is what Alt-Shift-↑ swaps it with and
what Tab puts it under. The CLI prints the same order.

**`:new: top` is read only on the page itself**: the + button, capture
without an `:at:` of its own, and `outline add --under` file new children
first. Alt-Shift-Enter adds a first child under any item.

## Options considered

**Move an item to the bottom when it is completed.** Rejected: uncompleting
leaves it at the bottom, the existing pile would need a one-off sort, and
every client that completes items (CLI, old phone builds) would have to do
the moving too. A display order needs nothing from old clients.

**A per-device setting.** Rejected: the CLI and agents read the same page
and should see what every device shows, which is why this is an outline property
like `:columns:`.

## Consequences

- Reading the order looks up the page's properties on every render; fine at
  today's sizes.
- Exports and JSON keep the stored order.
- An item uncompleted under `:completed: last` returns to its old place
  among the open items.
