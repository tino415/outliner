import { isOutsideCode } from "./notes";

export const MAX_TITLE_LENGTH = 200;

const LIST_LINE = /^\s*([-*+]|\d+[.)])\s/;
const HEADING = /^\s*#{1,6}\s/;

export function titleProblem(title: string): string | undefined {
  if (title.includes("\n")) return "a title is one line: an item is a heading, so put the next lines in children with add - --under ITEM";
  if (title.length > MAX_TITLE_LENGTH) {
    return `a title is at most ${MAX_TITLE_LENGTH} characters, this one has ${title.length}: an item is a heading, so put the rest in children with add - --under ITEM, or in a short note`;
  }
  return undefined;
}

export function noteProblem(note: string): string | undefined {
  const lines = note.split("\n");
  const outside = isOutsideCode(lines);
  const offending = lines.find((line, index) => outside[index] && (LIST_LINE.test(line) || HEADING.test(line)));
  if (offending === undefined) return undefined;
  return `a note is prose, not a list or headings: "${offending.trim().slice(0, 40)}" belongs in children with add - --under ITEM (code fences and attachment links are fine in a note)`;
}
