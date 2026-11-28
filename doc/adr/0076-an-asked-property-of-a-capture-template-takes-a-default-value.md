# 76. An asked property of a capture template takes a default value

- **Status:** accepted, 2026-11-28
- **Extends:** [0023](0023-capture-templates-live-in-the-outline.md)
- **Applies to:** `src/capture.ts`, `src/capturing.ts`, `outline capture`

## Context

A formula divides by the grams of the item a line links, so every
ingredient captured with a template needs `grams: 100`. `:ask:` held keys
only, every field of the Capture dialog opened empty, and the same 100 was
typed for each ingredient.

## Decision

- A default follows its key after `=`: `:ask: grams=100 kcal`.
- The field opens holding the default, and Capture files it like a typed
  value.
- Focusing a field that still holds its default selects it, so typing
  replaces it.
- `outline capture` writes the default unless `--set` gives the key. A
  default that breaks a `Checks:` child fails `outline capture`, as a
  `--set` value does; the dialog files it unchecked, as it files a typed
  value.
- A default holds no space and no comma, since those separate the asked
  keys: `unit="100 g"` is not read as one default.
- A default is plain text: `{date}` in it is not replaced.
- `grams=` with nothing after it asks for grams with no default. An emptied
  field, or `--set grams=`, files the item without the property.
- On a switch of template an untouched default follows the new template; a
  typed value stays.

## Consequences

- Nothing changes in the sync protocol or the server.
- A build older than this shows a field named `grams=100` and writes nothing
  for it, since a property key cannot hold `=`.
- Selection on focus is untested on a real iPhone; the browser tests cover
  Chromium, the Pixel and iPhone emulations, Firefox and desktop WebKit.
