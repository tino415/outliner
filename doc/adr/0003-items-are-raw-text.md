# 3. Items are raw text; formatting is rendered around it, not into it

- **Status:** accepted, 2026-10-07
- **Applies to:** `src/inline.ts`, `.md` rules in `src/style.css`

## Context

Outliners show bold, links and tags. WorkFlowy stores rich text; Logseq
stores Markdown and shows raw text while editing. Rich text in
`contenteditable` means `execCommand`, pasted HTML to sanitise, and caret
offsets that no longer match the stored string.

## Decision

An item's text is a plain string with a little Markdown: `**bold**`,
`*italic*`, `` `code` ``, `[label](url)`, bare URLs and `#tags`.

`renderInline` turns it into HTML whose `textContent` is exactly the raw
string. Markers are kept in the DOM inside `<span class="md">`, hidden by CSS
until the editor has focus. So a caret offset means the same thing whether
the item is showing formatting or being edited, and clicking into formatted
text needs no translation of positions.

Editors are `contenteditable="plaintext-only"`, so the browser never inserts
markup of its own. Ctrl-B, Ctrl-I and Ctrl-E wrap the selection in markers.

## Options considered

**Swap to raw text on focus and back on blur.** Rejected: the caret position
from the click would have to be translated from formatted to raw offsets.

**Live re-highlighting while typing.** Rejected: it means re-rendering the
element under the caret on every keystroke, which [0002](0002-immutable-document-rerender-on-structure.md)
avoids for good reasons.

## Consequences

- When editing starts, the markers appear and the line can shift by a few
  characters. That is the visible cost.
- Links and tags are clickable only when the item is not being edited; a
  click on an unfocused link opens it instead of placing the caret.
- Search, export and copy and paste all deal in the same plain string.
