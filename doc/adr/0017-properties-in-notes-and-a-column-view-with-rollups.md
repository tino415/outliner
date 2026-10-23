# 17. Properties in notes, and a column view with rollups

- **Status:** accepted, 2026-10-08
- **Applies to:** `src/properties.ts`, column view in `src/render.ts`, `outline set`
  and `outline show --columns`

## Context

Org mode's properties and column view serve two uses here: effort
estimates on subheadings summed on every parent, and calories on food under
meal under day under week, summed per meal, day and week. Plain outliners
(WorkFlowy, Dynalist) have neither.

How others do it, looked up on 2026-10-08:

- org mode keeps properties as text in a `:PROPERTIES:` drawer inside the
  entry; column view shows chosen properties as columns, and a summary type
  per column (`{+}`, `{:}` for durations, `{min}`, `{max}`, `{mean}`) fills
  parent rows. Columns come from `#+COLUMNS` or a `COLUMNS` property that
  applies to a subtree.
- OmniOutliner has document columns whose parent rows show a sum, average,
  minimum or maximum of their children. It is the closest relative outside
  org.
- Logseq and Roam write properties as `key:: value` lines in a block and
  offer table views; Notion and Tana have typed fields with rollups, built
  around databases rather than outlines.

## Decision

**Properties are `key:: value` lines in an item's note.** Keys are words
(letters, digits, `-`, `_`), case-insensitive. Like org's drawer they are
text in the entry, so they sync, export, search and reach the CLI with no
change to the document model or the sync protocol
([0012](0012-merge-fields-by-hybrid-clock-order-by-fractional-position.md)).
Outside editing, property lines show as small key–value chips.

**A column view per page.** It shows chosen properties as right-aligned
columns beside the outline, with a header row. Cells can be edited in place;
editing writes the note line.

**Rollups.** A row whose descendants have values for a column shows the
summary of its children instead of its own value, recursively, as org does.
Values are numbers with an optional unit (`350 kcal`) or durations (`45m`,
`1h30m`, `1:30`, `2d`, a day being 24 hours). Summaries are sum (the
default), `min`, `max` and `mean`.

**Which columns.** A `columns:: effort{+} calories{mean}` property on the
page, or on its nearest ancestor that has one, declares the columns and
their summaries, and turns the column view on for that subtree. Without it
the view, switched on from the menu, shows every property found under the
page, summed.

## Options considered

**Properties as separate fields of an item.** Rejected: every client, the
sync validation and the CLI would need a new field kind, and the values
would be invisible to export and search unless each learned about them.

**Rollups shown inline on every parent, without a column view.** Rejected as
the only way: with two or three properties the rows get noisy. Inline chips
stay for an item's own values.

## Consequences

- Two devices editing different properties of the same item while offline
  keep only the later note (per-field last-writer-wins on `note`).
- A property line is ordinary note text: deleting the line deletes the
  property, and typos make a different key.
- Column cells are part of a row's display state, so rows rebuild when their
  rollups change ([0009](0009-reuse-rows-between-renders.md)).
