# 22. Computed columns: a formula in the column spec

- **Status:** accepted, 2026-10-09
- **Applies to:** `src/formula.ts`, `parseColumns` and `columnCells` in `src/properties.ts`,
  cells in `src/render.ts`, `outline show --columns`

## Context

Properties should work as a small spreadsheet. The example is time
planning: on a day, each item's `start` is the day's start plus the
durations of the items before it, so a plan reads as a timetable and
moving an item reschedules everything after it.

Org mode has column formulas only in tables (`#+TBLFM`), not in column
view. Spreadsheet-like outliners (Tana, Notion) attach formulas to a field
of a type. Here a column is already declared in one place, the page's
`:columns:` property (ADR 0017).

## Decision

**A column whose braces start with `=` is computed:**
`:columns: effort start{=parent.start + before(effort)}`. On the page that
declares it, every row below the page that has no value of its own gets the
formula's value; a row with its own value keeps it, so `:start: 14:00` on a
meeting pins it. The page row shows its own value, which is where the
timetable starts.

**The language is small and has no side effects:** amounts (`350 kcal`,
`1h30m`, `9:00`), `+ - * /` and parentheses, a column of this item (`effort`),
of its parent (`parent.start`) or previous sibling (`previous.end`),
`before(key)` summing the siblings above, `sum min max mean (key)` over the
children, and `clock(x)` to show a duration as a time of day. A value written
`9:00` is a time of day and shows as one; adding a duration keeps it a time.
Values of other columns are what the column view shows for that row,
rollups included, so `before(effort)` counts a whole group by its total.

**Errors stay in their cell.** A formula that does not parse, adds a
duration to a number or depends on itself shows `error`, with the reason on
hover; the rest of the view still computes. Computed cells are drawn in the
accent colour.

## Options considered

**A formula as a property value on each item (`:start: =…`).** Rejected:
every item would repeat it, and the CLI and phone would have to write it
into every new item.

**JavaScript expressions.** Rejected: running code that arrives by sync is
the plugin question (doc/design/plugins-and-scripting.md), not something a
column should open. The interpreter is about 150 lines and runs the same in
the app and the CLI.

## Consequences

- Formulas are text in a note, so they sync, and the CLI's
  `show --columns` computes them with the same code.
- `9:00` as an own value now shows as `9:00` rather than `9h`; rollups of
  times are durations again (adding times of day means nothing).
- No references across pages, no ranges, no conditionals. A cell whose
  value comes from another subtree needs a reference syntax first (see the
  references backlog item).
