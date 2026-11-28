# 74. A formula reads the item a link property points to

- **Status:** accepted, 2026-11-28
- **Supersedes:** in [0022](0022-computed-columns-with-formulas.md), "No
  references across pages"
- **Extends:** [0057](0057-a-property-whose-value-is-a-url-opens-it.md), to
  item links
- **Applies to:** `src/formula.ts`, `cellsUnder` in `src/properties.ts`,
  `onlyReference` in `src/references.ts`, `src/propertyChips.ts`,
  `src/propertyPicker.ts`, `src/formulaHelp.ts`

## Context

Calorie tracking keeps ingredients, portions and meals in the outline. A
portion is an amount of an ingredient, a day's entry an amount of a portion
or an ingredient. A formula read only the item, its parent and the sibling
before it, so every portion had its numbers typed again, and a corrected
ingredient left them wrong.

## Decision

- `food.kcal` is the kcal of the item this item's `food` property links. Any
  name before the dot other than `parent` and `previous` names a property of
  the item. One dot only: `food.food.kcal` does not parse.
- A link is a whole value written `[[id:…][label]]` or `[[Some text]]`,
  resolved as a link in text is. A value with words around the link is not
  one.
- The value read is what the outline shows for the linked item: its own
  value, its own `=…` formula, the sum of its children, or the column's
  formula. A chain needs no syntax: an entry reads a portion, whose formula
  reads the ingredient.
- A column's formula fills only the items under the item that declares it. A
  linked item outside that tree shows what is written on it and the sums of
  its children. The linked item is computed with the columns of the page
  shown, and read even when the view hides it as completed.
- No `food` property: no value, an empty cell. A value that is not a link:
  `food is not a link`. A link this device cannot resolve: `food links an
item that is not here`. Items that link each other: `kcal depends on
itself`, on every item of the loop.
- A chip whose value is one link shows its label as written, `[[id:…]]` with
  no label its target. A click on the label follows the link as text does;
  a click on the key opens the value palette, which offers `Open <label>`
  first. A renamed item keeps its old label on the chips that link it.
- A link in a property does not count in Linked from.

## Options considered

**A lookup function, `lookup(food, kcal)`.** Rejected: the dot already
reads another item's value for `parent` and `previous`.

**Chains in the syntax, `food.food.kcal`.** Rejected: the linked item's own
formula follows the chain, so a portion that links a portion needs nothing
new.

**Fill every linked item with the column's formula.** Rejected: a linked item
can sit anywhere, and a formula would then compute rows of pages that never
declared it.

## Consequences

- A meal has no grams of its own: its weight is the sum of its lines. A
  weight that differs is pinned as `grams: =350`.
- A formula column does not sum its rows yet, so a meal's own kcal is empty,
  and an entry that links a meal is empty too.
