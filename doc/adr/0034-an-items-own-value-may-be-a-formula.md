# 34. An item's own value may be a formula

- **Status:** accepted, 2026-10-10
- **Extends:** [22](0022-computed-columns-with-formulas.md), where formulas live only in a page's `:columns:`
- **Applies to:** `formulaIn` and `columnCells` in `src/properties.ts`, `ownFormulaResults` in `src/render.ts`, `src/propertyChips.ts`

## Context

Martin plans a day as sleep, activities and sleep again, and wants the last
sleep's effort to be whatever is left of the day. A column formula applies
to every row without a value, so it cannot single out one item, and an
item's own value was taken literally.

## Decision

**A property value starting with `=` is a formula of that item's own**, in
the language of ADR 22: `effort: =24:00 - start`. It reads the item's other
values, including ones a column computes for it, and its result counts like
any value: in rollups, in `before()`, in other formulas. A value that ends
up depending on itself is an error, not a loop.

**The chip shows the result**, marked as computed, with the formula on
hover; a click edits the formula. Column view shows it as a computed cell.
The result is computed over the page being shown, once per render, and is
part of each row's display state (ADR 9), so a row follows the values its
formula reads.

**The value stays the formula as written**: it is what syncs, what the CLI
prints in `show`, and what an export writes. `show --columns` prints the
result.

## Consequences

- Items hidden by the view (completed ones, when hidden) count for nothing,
  as in rollups; a formula reading them sees no value.
- A plain value that has to start with `=` cannot be written; none is known.
