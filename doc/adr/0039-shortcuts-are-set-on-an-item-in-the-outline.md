# 39. Shortcuts are set on an item in the outline

- **Status:** accepted, 2026-10-20
- **Applies to:** `src/shortcuts.ts`, the binding table in `src/keys.ts`, the help dialog

## Context

Martin asked for keyboard shortcuts he can change. The card "Configurable
keyboard shortcuts" was approved on 2026-10-19 with its defaults: the
settings live in the outline, as column specs do, so they sync and the CLI
sees them; the Ctrl-J prefix itself stays; plugin commands and a key
recorder come later.

## Decision

**An item with the property `shortcuts: on` holds the settings**, found
anywhere in the outline as capture templates are. Each other property is a
command name and its keys, several separated by commas: `tag: Mod+j g`,
`zoom-in: Ctrl+]`. `none` unbinds a command, since an empty value removes
a property everywhere (app, CLI and note lines).

**Each settable binding has a stable name** of the type `CommandName`, so
renaming a label never breaks a setting. The help dialog shows the name
beside each command. Typing and caret keys (Enter, Backspace, Tab, arrows,
Escape, the Emacs Ctrl keys) have no name and cannot be set.

**A setting replaces the command's default keys**, in the editor, outside
it and in selection mode alike. Selection mode keeps the keys it has of
its own (Backspace and Delete delete a selection whatever `delete-item`
is). The first binding of the command in each context gets the new keys.

**Yours win.** Keys set for one command are taken from any other command
that had them, and the help says so under that command. Outside a Mac,
Ctrl and Mod are one key, so `Ctrl+u` and `Mod+u` count as the same there.
Two settings with the same keys: the first one in outline order wins.

**Some keys are refused**, with the reason listed in the help dialog, and
the command keeps its defaults if none of its keys is left:
- keys without Mod or Ctrl, which type;
- Alt with a single character, which types on a Mac (⌥) and with AltGr
  on Windows (Ctrl+Alt), extending ADR 35;
- Mod or Ctrl with N, T or W, with or without Shift, which the browser
  keeps for windows and tabs; on every platform, since one keymap serves
  all devices;
- Mod+C, Mod+X and Mod+V, which copy, cut and paste, and keys typing or
  the caret use;
- `Mod+j` alone, the prefix, and `Mod+j Escape`, which cancels it; a
  sequence other than `Mod+j` and one key.

Unknown names and unreadable keys are listed there too. Keys are read
loosely (`cmd+shift+K`, `⌘+⇧+K`, `Mod+Up`) and kept in the table's form.

## Consequences

- The help dialog, Ctrl-K and the Ctrl-J panel read the merged table, so
  they show the set keys with no code of their own.
- The table is merged again on a render when the settings changed; a
  setting typed into a note applies once the note is left and the line
  becomes a property.
- One keymap for every device: a key only one keyboard has would need a
  per-device override, which is not planned.
- Plugin commands (ADR 30) can join later by command name.
