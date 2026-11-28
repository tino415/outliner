# 79. `{current-weekday}` in a capture target is the English name of today's weekday

- **Status:** accepted, 2026-11-28
- **Applies to:** `withToday` in `src/capture.ts`, `weekdayNameOf` in
  `src/dates.ts`
- **Extends:** 23, 62, 63, 74
- **Supersedes:** the part of 74 that says no other placeholders exist

## Context

A day page titled with its date, such as `2026-11-27`, counts as an item dated
that day, and from the next day on the Agenda lists every such page under
Overdue. Day pages named by their weekday under their week,
`2026-W48/Friday`, are the first form tried; no other was weighed. A target
knew the date, the day after and their weeks, but no weekday, so such a page
was typed by hand.

## Decision

- `{current-weekday}` is today's weekday and `{tomorrow-weekday}` that of the
  day after, as full names with a capital: `Friday`.
- The names are English on every device, whatever language the browser has,
  so one path names the same page in every browser and in the CLI.
- They are named after `{current-week}` and `{tomorrow-week}`, so tomorrow's
  page is written `{tomorrow-week}/{tomorrow-weekday}`.
- They resolve wherever `{date}` does: the target, and the children and
  properties a template copies onto a new page (ADR 63), since capture, go to
  target, `?capture=<name>&go` and `outline capture` share one function.

## Consequences

- A weekday page has no date in its title: the Agenda does not list it, and
  only its week says which Friday it is.
- A target with a weekday and no week, such as `Plan/{current-weekday}`,
  reuses one page every week.
- A path step ignores case, so a page typed as `friday` is found and filed
  into.
- A page in next week has no placeholder and is typed by hand until Sunday,
  when `{tomorrow-week}` and `{tomorrow-weekday}` reach Monday.
  `{next-week}` is left out of this first version, for no particular reason.
- No other placeholders exist.
- The live outline resolves the new names only once both the sync server and
  the CLI run this change.
