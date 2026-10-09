import { Doc } from "./model";

/*
 * An item's kind is the capitalised word or words before a colon that start
 * its text: "Question: …", "Needs you: …" (doc/adr/0027). Up to three words of
 * letters, so "Mon 9:30" and "Reply 2026-10-09:" stay plain text.
 */

const KIND = /^(\p{Lu}\p{L}*(?: \p{L}+){0,2}):(?= |$)/u;

export function kindOf(text: string): string | null {
  return KIND.exec(text)?.[1] ?? null;
}

/** The text with `kind` in place of its current one; an empty kind removes it. */
export function withKind(text: string, kind: string): string {
  const rest = text.slice(kindPrefixLength(text)).trimStart();
  return kind ? `${kind}: ${rest}` : rest;
}

/** How much of the text the kind takes, with its colon and the space after it. */
export function kindPrefixLength(text: string): number {
  const kind = kindOf(text);
  if (kind === null) return 0;
  return kind.length + 1 + (text[kind.length + 1] === " " ? 1 : 0);
}

export function isKindName(text: string): boolean {
  return kindOf(`${text}:`) === text;
}

/** Kinds in use, most used first. */
export function kindsIn(doc: Doc): string[] {
  const counts = new Map<string, number>();
  for (const item of Object.values(doc.items)) {
    const kind = kindOf(item.text);
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([kind]) => kind);
}
