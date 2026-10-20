/* Lines of an item's note: `:key: value` lines, which become properties when the note is left (doc/adr/0032), and ``` code blocks (doc/adr/0021). */

const PROPERTY_LINE = /^:([\p{L}\p{N}_-]+):[ \t]*(.*)$/u;

export function propertyLine(line: string): { key: string; value: string } | null {
  const match = PROPERTY_LINE.exec(line.trim());
  const key = match && propertyKey(match[1]);
  return key ? { key, value: match[2].trim() } : null;
}

/** A property's key as stored and synced, in lower case; null for one the sync server would refuse. */
export function propertyKey(written: string): string | null {
  const key = written.trim().toLowerCase();
  return /^[\p{L}\p{N}_-]{1,64}$/u.test(key) ? key : null;
}

/** Every property in a note, keyed in lower case; a key written twice keeps its last value. */
export function propertiesOf(note: string): Map<string, string> {
  const properties = new Map<string, string>();
  for (const line of linesOutsideCode(note)) {
    const property = propertyLine(line);
    if (property) properties.set(property.key, property.value);
  }
  return properties;
}

function linesOutsideCode(note: string): string[] {
  const lines = note.split("\n");
  const outside = isOutsideCode(lines);
  return lines.filter((_, index) => outside[index]);
}

/** The note without its code blocks: what links, tags and properties are read from. */
export function withoutCode(note: string): string {
  return linesOutsideCode(note).join("\n");
}

export function mapLinesOutsideCode(note: string, change: (line: string) => string): string {
  const lines = note.split("\n");
  const outside = isOutsideCode(lines);
  return lines.map((line, index) => (outside[index] ? change(line) : line)).join("\n");
}

/** True when the note text before the caret has opened a ``` fence and not closed it. */
export function isInCode(noteBefore: string): boolean {
  return noteBefore.split("\n").filter((line) => /^\s*```/.test(line)).length % 2 === 1;
}

/** For each line, whether it is ordinary note text rather than a ``` fence or a line inside one. */
function isOutsideCode(lines: string[]): boolean[] {
  let inCode = false;
  return lines.map((line) => {
    const fence = /^\s*```/.test(line);
    if (fence) inCode = !inCode;
    return !inCode && !fence;
  });
}

/** The `:key: value` lines of a note taken out of it, and the note without them. */
export function splitPropertyLines(note: string): { properties: Map<string, string>; rest: string } {
  const lines = note.split("\n");
  const outside = isOutsideCode(lines);
  const properties = new Map<string, string>();
  const rest = lines.filter((line, index) => {
    const property = outside[index] ? propertyLine(line) : null;
    if (property) properties.set(property.key, property.value);
    return !property;
  });
  return { properties, rest: rest.join("\n").replace(/^(?:[ \t]*\n)+/, "").replace(/(?:\n[ \t]*)+$/, "") };
}

/** Properties written as the note lines exports use: `:key: value`, one per line. */
export function propertyLines(properties: Readonly<Record<string, string>>): string[] {
  return Object.entries(properties).map(([key, value]) => `:${key}: ${value}`);
}

/** A private item's note as the sync server and devices without its key have it (doc/adr/0029). */
export const SEALED_NOTE = /^🔒private:1:([^:\n]+):([A-Za-z0-9+/=]+)$/u;

/** The key a sealed note was sealed with. */
export function sealedKeyOf(note: string): string | null {
  return SEALED_NOTE.exec(note)?.[1] ?? null;
}

export function isSealed(note: string): boolean {
  return SEALED_NOTE.test(note);
}

/** The key a note names: sealed with it, or a `:private:` line not yet lifted into the property, typed just now or written by an older build. */
export function privateKeyInNote(note: string): string | null {
  return sealedKeyOf(note) ?? (propertiesOf(note).get("private") || null);
}
