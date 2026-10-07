# 1. Plain TypeScript, no UI framework

- **Status:** accepted, 2026-10-07
- **Applies to:** `src/`, `package.json`

## Context

The app is one screen: a tree of editable lines, a header, a menu. The hard
part is not composing components, it is the caret. Every keystroke that
changes structure (Enter, Tab, Backspace at the start, moving an item) has to
leave the caret in a precise place in a `contenteditable` element that may
not have existed a moment ago.

Frameworks that own the DOM (React, Preact, Svelte, Lit) and
`contenteditable` disagree about who owns the text. The usual answers are an
editor library (ProseMirror, Lexical, TipTap) or a careful escape hatch around
every editable node. The brief also asked for few dependencies, and the time
box was six hours.

## Decision

No UI framework and no editor library. Vite and TypeScript for the build,
Vitest and Playwright for tests; the runtime has zero dependencies.

Rendering is a function from the document to DOM nodes (`renderItem` in
`src/app.ts`). Editing is delegated event handling on `document`, keyed by
the `data-id` on each editor element.

## Options considered

**Preact or Lit with uncontrolled editors.** Rejected: it would still need
the same caret code, plus a rule for which updates the framework may apply to
an element being typed in. Two owners of the same DOM is the bug class to
avoid.

**ProseMirror or Lexical with a nested-list schema.** Rejected for the time
box: both are large, and an outline as a single rich-text document makes
zoom (rendering one subtree as the page) and per-item operations harder, not
easier.

## Consequences

- The production bundle is about 35 kB of JavaScript, 12 kB gzipped.
- Everything a framework would give for free, such as escaping, is done by
  hand. `escape()` in `src/inline.ts` is the one place HTML is built from
  user text, and its tests pin that the rendered text equals the raw text.
- `src/app.ts` is the largest file and would be the first to split if the
  app grows.
