# 37. A built-in agenda lists items by date

- **Status:** accepted, 2026-10-19
- **Applies to:** `src/agendaItems.ts`, `src/agenda.ts`, the agenda branch of `render` and the editing actions it turns off in `src/editing.ts`

## Context

A proposal for org-style views had items with a query whose page shows the
items that match. The first step is a built-in agenda (⋯ → Agenda:
overdue, today, the next 7 days), with query items after it. It builds
on the dates of ADR 36.

## Decision

**The agenda is a page of its own at `#agenda`**, opened from ⋯ → Agenda
or Ctrl-J G (⌘J G). It is not an item, so nothing about it syncs or shows
in the CLI. Search over it searches the whole outline, as on Home.

**What it lists, in sections:** _Overdue_, the open items whose dates have
all passed, oldest first; then each day from today to a week from today
that has items, each item on its next date, timed ones first by time, the
rest in outline order; then _To do, without a date_, the items tagged
`#todo` that have no date. An item's dates are those of ADR 36: `scheduled`,
`due` and the dates in its text. Completed items, and everything under one,
follow the Show completed switch, and are never overdue. Items dated further
ahead are left out.

**The rows are the items themselves.** Their text, note, properties and
dates are edited in place and completing works; each row shows the path to
where the item lives, a link there, and its bullet zooms into it. What would
move an item in the outline does nothing here: Enter leaves editing, and
Tab, Shift-Tab, moving up or down, a new first child, joining with
Backspace or Delete, folding and selecting items are off, since the agenda
does not show where the item would go.

**Flat by date, not grouped by parent**, as the proposal had it for the
agenda; grouping by parent is left to query views.

## Consequences

- An item edited so that it no longer has a date in the week leaves the
  agenda at the next render, as completing does with completed items hidden.
- The page rebuilds every row on each render, as the board does; it walks
  the whole outline once per render while it is shown.
- Query items (`:query:`), a `group:` setting and `outline find --query`
  remain to do.
