# 74. `{current-week}` in a capture target is the ISO week of today

- **Status:** accepted, 2026-11-28
- **Applies to:** `withToday` in `src/capture.ts`, `isoWeekOf` in
  `src/dates.ts`
- **Extends:** 23, 62, 63
- **Supersedes:** the part of 62 that says no other placeholders exist

## Context

A target knows `{date}` and `{tomorrow}` (ADR 23, 62). A journal kept by week,
such as `Food/Journal/2026-W48/2026-11-27`, needed the week page typed by hand
every Monday.

## Decision

- `{current-week}` is the week of today, written like `2026-W48`. It always
  means today's week, as `{date}` always means today.
- `{tomorrow-week}` is the week of the day after today. On a Sunday,
  `{current-week}/{tomorrow}` would file Monday under the old week, and
  Monday's own template would make a second page;
  `{tomorrow-week}/{tomorrow}` files it under its own week.
- Weeks are ISO 8601: Monday starts a week, and week 1 holds the year's first
  Thursday. The year in the name is the week's year, so 2027-01-01 is
  `2026-W53`. The number has two digits: `2026-W02`.
- Both resolve wherever `{date}` does: the target, and the children and
  properties a template copies onto a new page (ADR 63), for capture, go to
  target, `?capture=<name>&go` and `outline capture`.
- A missing week page is made on the way like any missing page, and gets none
  of the template's children.

## Consequences

- No other placeholders (`{yesterday}`, `{week}`, `{today}`, offsets) exist.
- A page further ahead than tomorrow is out of reach of any template.
- The live outline resolves the new names only once both the sync server and
  the CLI run this change.
