/*
 * Renders an item's raw text as HTML whose textContent is exactly the raw
 * text: markdown markers stay in the DOM inside `.md` spans, which CSS hides
 * until the item is being edited. Caret offsets therefore mean the same thing
 * in the rendered and the raw form.
 */

import { kindOf } from "./kinds";
import { ATTACHMENT } from "./attachmentLinks";

const TOKEN = new RegExp(
  [
    String.raw`(?<code>\x60[^\x60\n]+\x60)`,
    String.raw`(?<bold>\*\*[^*\n]+\*\*)`,
    String.raw`(?<italic>(?<![\w*])\*[^*\s](?:[^*\n]*[^*\s])?\*(?![\w*]))`,
    String.raw`(?<ref>\[\[[^\[\]\n]+\](?:\[[^\[\]\n]+\])?\])`,
    String.raw`(?<att>!?\[[^\]\n]*\]\(att:[0-9a-f]{64}\))`,
    String.raw`(?<mdlink>\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))`,
    String.raw`(?<url>https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"])`,
    String.raw`(?<tag>(?<![\p{L}\p{N}_#])#[\p{L}\p{N}_-]*[\p{L}\p{N}_])`,
  ].join("|"),
  "gu",
);

export function renderInline(text: string): string {
  let html = "";
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    html += escape(text.slice(last, match.index));
    html += renderToken(match.groups!, match[0]);
    last = match.index! + match[0].length;
  }
  return html + escape(text.slice(last));
}

/** An item's own text: its kind as a badge (doc/adr/0027), then the rest inline. */
export function renderItemText(text: string): string {
  const kind = kindOf(text);
  if (kind === null) return renderInline(text);
  const badge = `<span class="kind" data-kind="${escape(kind)}">${escape(kind)}${marker(":")}</span>`;
  return badge + renderInline(text.slice(kind.length + 1));
}

function renderToken(groups: Record<string, string | undefined>, raw: string): string {
  if (groups.code) return wrapped("code", raw, 1);
  if (groups.bold) return wrapped("strong", raw, 2);
  if (groups.italic) return wrapped("em", raw, 1);
  if (groups.ref) {
    const [, target, label] = /^\[\[([^\]]+)\](?:\[([^\]]+)\])?\]$/.exec(raw)!;
    const opening = label === undefined ? "[[" : `[[${target}][`;
    const shown = label ?? target;
    return `${marker(opening)}<span class="ref" data-ref="${escape(target)}">${escape(shown)}</span>${marker("]]")}`;
  }
  if (groups.att) {
    const [, bang, label, hash] = ATTACHMENT.exec(raw)!;
    const preview = bang ? `<img class="att-image" data-att="${hash}" alt="${escape(label)}" contenteditable="false">` : "";
    return (
      `<span class="att ${bang ? "att-is-image" : "att-is-file"}" data-att="${hash}" data-name="${escape(label)}">` +
      `${marker(`${bang}[`)}<span class="att-label">${escape(label)}</span>${marker(`](att:${hash})`)}${preview}</span>`
    );
  }
  if (groups.mdlink) {
    const [, label, url] = /^\[([^\]]+)\]\((.+)\)$/.exec(raw)!;
    return `${marker("[")}<a class="link" href="${escape(url)}" target="_blank" rel="noopener">${escape(label)}</a>${marker(`](${url})`)}`;
  }
  if (groups.url) return `<a class="link" href="${escape(raw)}" target="_blank" rel="noopener">${escape(raw)}</a>`;
  if (groups.tag) return `<span class="tag" data-tag="${escape(raw.toLowerCase())}"><span class="tag-hash">#</span>${escape(raw.slice(1))}</span>`;
  return escape(raw);
}

function wrapped(tag: string, raw: string, markerLength: number): string {
  const open = raw.slice(0, markerLength);
  const inner = raw.slice(markerLength, raw.length - markerLength);
  return `<${tag}>${marker(open)}${escape(inner)}${marker(open)}</${tag}>`;
}

function marker(text: string): string {
  return `<span class="md">${escape(text)}</span>`;
}

const PROPERTY = /^(\s*)(:)([\p{L}\p{N}_-]+)(:[ \t]*)(.*)$/u;

const FENCE = /^\s*```/;

/**
 * A note: like item text, but `:key: value` lines show as a key and a value
 * (doc/adr/0020), and lines between ``` fences as a code block (doc/adr/0021).
 */
export function renderNote(note: string): string {
  const lines = note.split("\n");
  let html = "";
  for (let index = 0; index < lines.length; index++) {
    const fenceEnd = FENCE.test(lines[index]) ? closingFence(lines, index) : null;
    const end = fenceEnd ?? index;
    const lineBreak = end < lines.length - 1 ? "\n" : "";
    html +=
      fenceEnd === null
        ? renderNoteLine(lines[index], lineBreak)
        : renderCodeBlock(lines.slice(index, end + 1), FENCE.test(lines[end]) && end > index) + lineBreak;
    index = end;
  }
  return html;
}

/** The line that closes the fence opened at `start`, or the last line when it is never closed. */
function closingFence(lines: string[], start: number): number {
  const close = lines.findIndex((line, index) => index > start && FENCE.test(line));
  return close === -1 ? lines.length - 1 : close;
}

function renderCodeBlock(lines: string[], closed: boolean): string {
  const [opening, ...rest] = lines;
  const code = closed ? rest.slice(0, -1) : rest;
  const closing = closed ? marker((code.length ? "\n" : "") + rest.at(-1)!) : "";
  const language = opening.trim().slice(3).trim();
  return (
    `<span class="code-block"${language ? ` data-language="${escape(language)}"` : ""}>` +
    `${marker(opening + (rest.length ? "\n" : ""))}<code>${escape(code.join("\n"))}</code>${closing}</span>`
  );
}

function renderNoteLine(line: string, lineBreak: string): string {
  const property = PROPERTY.exec(line);
  if (!property) return renderInline(line) + lineBreak;
  const [, lead, opening, key, separator, value] = property;
  return (
    `<span class="prop-line" data-key="${escape(key.toLowerCase())}">${escape(lead)}<span class="prop">` +
    `${marker(opening)}<span class="prop-key">${escape(key)}</span>${marker(separator)}<span class="prop-value">${renderInline(value)}</span>` +
    `</span>${lineBreak}</span>`
  );
}

/** The text as a reader sees it, without markdown markers: for breadcrumbs, titles and labels. */
export function plainText(text: string): string {
  const container = document.createElement("div");
  container.innerHTML = renderInline(text);
  container.querySelectorAll(".md").forEach((marker) => marker.remove());
  return container.textContent ?? "";
}

export function shortLabel(text: string, length: number): string {
  const plain = plainText(text).trim();
  return plain.length > length ? `${plain.slice(0, length - 1).trimEnd()}…` : plain;
}

export function itemLabel(text: string, length: number): string {
  return shortLabel(text, length) || "Untitled";
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
