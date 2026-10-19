export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export type Platform = "mac" | "other";
export const platform: Platform = isMac ? "mac" : "other";

/** Spells "Ctrl" and "Shift" in prose the way this platform's keyboard does. */
export function keyNames(text: string): string {
  if (!isMac) return text;
  return text.replaceAll("Ctrl ", "⌘ ").replaceAll("Shift ", "⇧ ");
}
