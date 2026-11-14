# 59. Go to a capture template's target

- **Status:** accepted, 2026-11-14
- **Applies to:** `goToTarget` and `captureRequest` in `src/capture.ts`,
  `openGoToTarget` and `visit` in `src/capturing.ts`
- **Extends:** 23

## Context

A template whose target holds `{date}` already finds or creates the page of
today under any parent, but only to file an item into it. Opening today's plan
needed a capture, or a search.

## Decision

- Going to a target resolves the template's path as capture does, creates the
  pages that are missing, files nothing and zooms into the page.
- A page the resolver creates takes its place from its parent's `:new:`, so a
  parent with `:new: top` shows today first. This holds for capture too.
- Ways in: Ctrl-J W then the template's `:key:` (a picker built from the
  Capture dialog), "Go to target: <name>" in Ctrl-K, a Go there button in the
  Capture dialog, a click on the value of a `:capture:` chip (its key still
  opens the palette), and `?capture=<name>&go` in the address.
- `?capture&go` without a known name opens the picker.

## Consequences

- Looking at today's page creates it.
