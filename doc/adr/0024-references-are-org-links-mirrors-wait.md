# 24. References are org links by id; mirrors wait

- **Status:** accepted, 2026-10-09
- **Applies to:** `src/references.ts`, the `ref` token in `src/inline.ts`, `pickReference`
  in `src/editing.ts`, backlinks in `src/render.ts`

## Context

The request was for references from an item's text, note or properties
to another item, "like Logseq's `[[reference][label]]`, in org mode `C-c C-l`",
and for a reference as a child, like WorkFlowy's mirrors, open to
interpretation.

## Decision

**A reference is an org link in the raw text:** `[[id:ITEM][label]]`. The
id keeps it working when the target is renamed or moved; the label is what
shows. `[[Some text]]` also works and points at the first item with that
text, Logseq style, so a link can be typed by hand or by an agent through
the CLI. Like every other mark-up the brackets stay in the text and hide
outside editing (ADR 0003); export, sync and the CLI see plain text.

Typing `[[`, or Alt-Shift-L (org's `C-c C-l` taken in spirit), opens the
item picker; choosing writes the link with the item's current text as its
label. A click on a link zooms to the target. A zoomed page lists the items
that link to it under its title ("Linked from").

**Mirrors are not built.** Rows are kept between renders keyed by item id
(ADR 0009), and the caret, selection, drag and drop and swipes all find a
row by its item's id. A mirror shows the same item twice on one page, so
each of those would need an identity per occurrence first. A link as a
child item covers reaching the target; editing it in place does not exist
yet.

## Options considered

**A reference field on items.** Rejected: a model and sync change (ADR 0012) for what text can carry.

**Labels looked up at render time instead of stored.** Rejected for now:
rendering would need the document, which `renderInline` does not have, and
a stale label is also what org does. Renaming the target leaves old labels
as they were.

## Consequences

- Backlinks are computed on every render by scanning all text; fine at the
  5,000-item budget, worth an index if outlines grow much larger.
- Properties can hold links (`:see: [[id:…][Plan]]`); columns show them as
  text.
- Mirrors stay on the backlog with the row-identity problem stated.
