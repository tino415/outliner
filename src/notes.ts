/* Lines of an item's note: `:key: value` properties as in an org drawer, and ``` code blocks (doc/adr/0020, 0021). */

const PROPERTY_LINE = /^:([\p{L}\p{N}_-]+):[ \t]*(.*)$/u;

export function propertyLine(line: string): { key: string; value: string } | null {
  const match = PROPERTY_LINE.exec(line.trim());
  return match ? { key: match[1].toLowerCase(), value: match[2].trim() } : null;
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

/** The note with `key` set to `value`: the existing line is rewritten, a new one appended, an empty value removes it. */
export function setProperty(note: string, key: string, value: string): string {
  const wanted = key.toLowerCase();
  const lines = note === "" ? [] : note.split("\n");
  const outside = isOutsideCode(lines);
  const index = lines.findLastIndex((line, i) => outside[i] && propertyLine(line)?.key === wanted);
  const written = `:${key}: ${value.trim()}`;
  if (value.trim() === "") return lines.filter((_, i) => i !== index).join("\n");
  if (index === -1) return [...lines, written].join("\n");
  return lines.map((line, i) => (i === index ? written : line)).join("\n");
}

/** A private item's note as the sync server and devices without its key have it (doc/adr/0029). */
export const SEALED_NOTE = /^🔒private:1:([^:\n]+):([A-Za-z0-9+/=]+)$/u;

/** The key a private item is encrypted with: `:private: <key>` where it is open, the sealed note's key elsewhere. */
export function privateKeyOf(note: string): string | null {
  if (!note.toLowerCase().includes("private")) return null;
  return SEALED_NOTE.exec(note)?.[1] ?? propertiesOf(note).get("private") ?? null;
}

export function isSealed(note: string): boolean {
  return SEALED_NOTE.test(note);
}
