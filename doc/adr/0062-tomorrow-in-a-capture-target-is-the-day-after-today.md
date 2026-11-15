# 62. `{tomorrow}` in a capture target is the day after today

- **Status:** accepted, 2026-11-15
- **Applies to:** `targetPath` in `src/capture.ts`
- **Extends:** 23, 59

## Context

A template target resolves `{date}` to today (ADR 23), for capture and for
going to the target (ADR 59). Opening or filing into the page of the next day,
the evening before, needed the page typed by hand.

## Decision

- `{tomorrow}` in a target is the day after today, written like `{date}`
  (`YYYY-MM-DD`), month and year ends included.
- It resolves wherever `{date}` does: capture, go to target,
  `?capture=<name>&go` and the CLI, since all of them call `targetPath`.
- `{date}` and `{tomorrow}` may appear in one target.

## Consequences

- No other placeholders (`{yesterday}`, offsets) exist.
