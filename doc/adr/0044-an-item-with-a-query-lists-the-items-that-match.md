# 44. An item with a query lists the items that match

- **Status:** accepted, 2026-10-22
- **Applies to:** `src/query.ts`, `src/queryView.ts`, the query branch of `render`, `outline find --query`
- **Decides:** the card "Query views" (Projects/Outliner), the rest of the proposal in "Think about adding sort of org agend/views/queries" after ADR 37

## Context

ADR 37 built the agenda and left query items for later. The proposal:
a view is an item with a query, its page shows the real items that match,
each with its path, grouped by parent unless `group:` says date, and the
CLI reads the same language.

## Decision

**A view is an item with a `:query:` property.** Zoomed into it, the page
shows its title and note as any page does, and in place of its children
the items that match, from all over the outline. The view's own children
stay in the outline and show in search and the CLI, but not on its page.
The query is a property, so it syncs and the CLI sees it like any other.

**The language**, words separated by spaces, all of which must hold:

- a plain word: in the item's text or note, ignoring case;
- `#tag`: the item's text carries the tag;
- `is:open`, `is:done` (or `is:completed`), and `is:overdue` from ADR 36;
- `has:key`: the item has property `key` set;
- `under:Outliner`, `under:"Projects/Outliner"`: below an item whose path
  ends with these texts, compared as written, ignoring case;
- the date words of search: `due:<+7d`, `scheduled:this-week`,
  `date:>=today`;
- `-word`: any of the above, negated;
- `OR` between groups of words: any one group.

Words that look like an operator but are not one (`is:soon`) are plain
words. Comparisons on property values (`effort>1h`) are left out until a
view needs them.

**The rows are the agenda's rows**, with the same rules (ADR 37): edited
and completed in place, keys that would move an item do nothing, Enter in
the view's title leaves editing instead of adding a child. Completed items
and what is under them follow the Show completed switch, as on any page.

**Grouped by parent unless `:group: date`.** By parent, each section is
headed by the path to where its items live, a link there, in the order the
parents first appear in the outline. By date, the sections are the
agenda's: overdue, each coming day without the agenda's seven-day limit,
then undated items, then completed items whose dates have passed, and each
row shows its path.

**`outline find QUERY --query`** answers with the same language over the
whole outline, completed items included, in outline order, as `find` does.

## Consequences

- A query walks the whole outline on each render of its page, as the agenda
  does.
- An item edited so it no longer matches leaves the view at the next render.
- `under:` matches item text as written, the way CLI paths do: an item
  written `**Outliner**` is `under:**Outliner**`.
- A view does not list itself, but can list another view.
