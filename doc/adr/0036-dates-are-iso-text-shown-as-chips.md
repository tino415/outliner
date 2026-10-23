# 36. Dates are ISO text, shown as chips

- **Status:** accepted, 2026-10-19
- **Applies to:** `src/dates.ts`, `src/datePicker.ts`, the date token in `src/inline.ts`, date values in `src/propertyChips.ts`, date words in `src/search.ts`

## Context

Org mode, WorkFlowy and others let a date be inserted without typing it,
show it as something more readable than digits, and search by it. The
choice (2026-10-10) is ISO dates shown as chips, with a picker on ⌘J ;
or on typing `!!`. The agenda (ADR 37) needs to know an item's dates.

## Decision

**A date is written as ISO text**: `2026-10-14`, or `2026-10-14 9:00`, in
an item's text, its note or a property value. It stays plain text (ADR 3),
so it syncs, sorts and greps as is, and the CLI and exports print it as
written. A day that does not exist (`2026-02-30`) is not a date. A date
inside a word or a longer number, or in code, is not one either.

**It shows as a chip** that says when: "today", "tomorrow", "yesterday",
otherwise "Tue 14 Oct", with the year when it is not this one, and the
time after. Past days are red, except on completed items. The ISO text
stays in the DOM, hidden until the item is edited, and the label comes from
an attribute, so `textContent` is still the raw text. The label depends on
the day, so the day is part of each row's display state (ADR 9), and a page
renders again when it is looked at on a new day.

**The picker** opens on ⌘J ; (Ctrl-J ; elsewhere), on typing `!!`, on a
click on a chip outside editing (to change or remove that date), and as
the value step of the properties `scheduled` and `due`. It reads
`today`, `tomorrow`, weekdays (`fri`, the next one from today on), `+3d`,
`2w`, `-1d`, `+1m`, `25` (the next 25th), `14.10.`, `14 oct`, `oct 14`
and ISO, each with an optional time `9:00`. A date without a year that has
passed means next year's, as org prefers the future. It writes the date
apart from the words around it, else the date would not be one. Escape
after `!!` keeps the two characters.

**An item's dates** are its `scheduled` and `due` properties and the dates
in its text. Dates in its note are not, since notes hold logs and history.
An open item is **overdue** when every one of its dates has passed.

**Search learns date words**: `due:`, `scheduled:` and `date:` (any of the
item's dates) take a day (`today`, `fri`, `2026-10-14`, `+7d`), optionally
after `<`, `<=`, `>` or `>=`, or `this-week` / `next-week` (weeks start on
Monday); `is:overdue` finds overdue items. A word the filters cannot read
is searched as text, and date words are not highlighted.

## Consequences

- A date is no amount: a `due` column shows the dates instead of summing
  their years. Columns and formulas do not compute with dates yet.
- The proposal had a bare `overdue`; it is `is:overdue`, so the word
  "overdue" can still be searched for.
- Labels are in English and weeks start on Monday, whatever the browser's
  language.
- Typing `!!` in a sentence opens the picker; Escape keeps the text.
