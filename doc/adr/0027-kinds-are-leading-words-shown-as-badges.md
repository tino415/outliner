# 27. Kinds are the leading words before a colon, shown as badges

- **Status:** accepted, 2026-10-09
- **Applies to:** `src/kinds.ts`, `renderItemText` in `src/inline.ts`, kind completion in `src/completion.ts`

## Context

Agents and Martin write items such as "Question: …", "Needs you: …" and
"Answer: …" into the outline. The first proposal was org-mode TODO
keywords. Martin objected: TODO keywords describe a state that changes
(TODO, DONE), while these words say what the item is, and they should
behave more like tags. Without a leading character such as `#` there is
also nothing that obviously starts a completion.

## Decision

**A kind is one to three words of letters, the first capitalised, then a
colon at the start of an item's text, followed by a space or the end.**
It shows as a dark badge with the colon hidden; while the item is being
edited it shows as written. The text is not changed: `textContent` is still
the raw text (doc/adr/0003), the CLI shows it as is, and a click on the
badge searches for `Kind:`.

**Any such prefix is a kind; there is no list to declare.** Martin chose
this over a `:kinds:` list on a page, knowing that an ordinary "Monday:
write the draft" becomes a badge too.

**Completion offers the kinds in use** while the text typed so far at the
start of an item could be one, most used first. **Alt-Shift-K** sets,
replaces or removes the kind from anywhere in the item through the palette
and puts the caret back where it was.

## Options considered

**Org TODO keywords declared per page (`:keywords:`), cycled by a key.**
Rejected after Martin's objection above.

**A declared list of kinds.** Fewer accidental badges, but one more thing
to set up; offered and not chosen.

**Digits and dates in kinds ("Reply 2026-10-09:").** Rejected: dates would
make every reply a kind of its own, and "Mon 9:30" would turn into one.

## Consequences

- Plain sentences that start with "Word:" show a badge.
- Typing a capital letter at the start of an item can open the list;
  Enter then picks a kind instead of making a new item. The list only
  opens when a kind in use starts with what was typed.
