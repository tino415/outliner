# 77. A computed column may roll up and round

- **Status:** accepted, 2026-11-28
- **Applies to:** `parseColumns` and `cellsUnder` in `src/properties.ts`,
  column titles in `src/render.ts`, `src/formulaHelp.ts`
- **Extends:** 22

## Context

Calories are computed per ingredient, from its grams and its kcal per 100 g,
and a meal and a day should show the total of their rows. A computed column
(22) does not roll up: a parent with no value of its own computes the formula
from the sums of its children's inputs, and the page shows nothing. Its
results also show up to two decimals, which a calorie count does not need.

## Decision

**A summary word before the `=` makes a computed column roll up:**
`kcal{sum = grams * per100 / 100}`. The words are those a plain column takes:
`+`, `sum`, `min`, `max`, `mean`, `avg`. In such a column a row shows the
first of these that gives a value:

- its own formula, written `=…`;
- the summary of its children, when any child has a value;
- the column's formula, when the row has no value of its own;
- its own typed value.

The page that declares the column sums too, so the column head shows the
total.

**A column with only `{= …}` does not roll up, as before.** The timetable
column `start{=parent.start + before(effort)}` reads its parent's start, so a
parent that summed its children would depend on itself.

**`round` in the braces shows computed values and summaries as whole
numbers:** `kcal{sum round = …}`, or `score{mean round}` without a formula.
Typed values, durations and times show as before. A total adds the exact
values and is rounded only when shown: two rows of 88.5 show 89 each and
their parent 177.

**An unknown word before the `=` is an error** in every computed cell of the
column, `unknown WORD: use sum, min, max, mean or round` on hover. In a
column without a formula an unknown word still sums.

## Options considered

**Every computed column sums its children.** Rejected: it breaks the
timetable, whose parents would depend on themselves.

**A `round()` function in formulas.** Rejected: it rounds what a formula
computes but leaves sums unrounded, and every formula would repeat it.

## Consequences

- The CLI's `show --columns` rolls up and rounds with the same code.
- A row with a typed value and children with values shows the children's
  summary, as a plain column does.
