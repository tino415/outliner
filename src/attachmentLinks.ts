/*
 * An attachment is a Markdown link to `att:` and the SHA-256 of the file
 * (doc/adr/0028): `![screenshot.png](att:…)` for an image, shown as one,
 * `[report.pdf](att:…)` for any other file.
 */

export const ATTACHMENT = /(!?)\[([^\]\n]*)\]\(att:([0-9a-f]{64})\)/;

export function attachmentLink(name: string, hash: string, type: string): string {
  const label = name.replace(/[[\]\n]/g, " ").trim() || "file";
  return `${type.startsWith("image/") ? "!" : ""}[${label}](att:${hash})`;
}

export function typeFromName(name: string): string {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
  };
  return types[extension] ?? "application/octet-stream";
}

const linkTo = (hash: string) => new RegExp(String.raw`!?\[[^\]\n]*\]\(att:${hash}\)`, "g");

export function linksAttachment(note: string, hash: string): boolean {
  return linkTo(hash).test(note);
}

export function withoutAttachment(note: string, hash: string): string {
  const link = linkTo(hash);
  return note
    .split("\n")
    .map((line) => ({ line, left: line.replace(link, "") }))
    .filter(({ line, left }) => left.trim() !== "" || line.trim() === "")
    .map(({ left }) => left)
    .join("\n");
}
