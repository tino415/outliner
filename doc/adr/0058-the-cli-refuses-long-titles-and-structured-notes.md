# 58. The CLI refuses long titles and structured notes

- **Status:** accepted, 2026-11-13
- **Applies to:** `cli/run.ts`, `src/writingRules.ts`, `parseIndentedText` in
  `src/transfer.ts`

## Context

Agents write most long titles and notes holding lists or headings, because a
subtree took a heredoc whose ids were lost and a note took one call. Titles
over 200 characters grew by 40 percent in a week. A title is one line (ADR 3).

## Decision

- `add` and `edit` refuse a title with a newline or over 200 characters, and
  `add -` checks every item it reads. The message points at `add - --under`.
- `note` and `add --note` refuse list lines and headings outside code fences,
  with no flag to override. Code fences and attachment links stay allowed:
  plugins and attachments live in notes (ADR 21, 28, 30).
- `add -` prints every created item indented as `- text  [id]`, and `--json`
  prints the tree. `note ITEM -` and `edit ITEM -` read stdin. There is no
  `--append`.
- `show --json` carries each item's `path`. `outline help` repeats the rules
  under `add`.
- `parseIndentedText` keeps the lines of a code fence in the item's note, so
  a `- ` line inside a fence no longer becomes an item.
- The rules live in `src/writingRules.ts` so the app can share them.

## Consequences

- The limits apply to the CLI only until the app adopts the same rules.
- Agents get the change with the next `rev` bump of the sync server's pin.
- `add - --json` prints trees instead of a list of ids.
