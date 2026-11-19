import { EditorContext, editorContext } from "./editing";
import { Command, editorCommands } from "./keys";
import { PaletteOption, openPalette } from "./palette";
import { select } from "./caret";

interface SlashOption extends PaletteOption {
  command: Command;
}

export function openSlashCommands(c: EditorContext): void {
  const commands = editorCommands(() => editorContext(c.editor));
  openPalette<SlashOption>({
    placeholder: "Command…",
    hint: "↑ ↓ or Ctrl N / P to choose · Enter to run · Esc keeps the /",
    candidates: (query) => matching(commands, query),
    choose: (option) => runInPlaceOfSlash(c, option.command),
  });
}

function matching(commands: Command[], query: string): SlashOption[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return commands
    .filter((command) => terms.every((term) => command.label.toLowerCase().includes(term)))
    .map((command) => ({ command, text: command.label, path: [], shortcut: command.shortcut }));
}

function runInPlaceOfSlash(c: EditorContext, command: Command): void {
  c.editor.focus();
  select(c.editor, c.start - 1, c.start);
  document.execCommand("delete");
  command.run();
}
