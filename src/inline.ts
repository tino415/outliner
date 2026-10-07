/*
 * Renders an item's raw text as HTML whose textContent is exactly the raw
 * text: markdown markers stay in the DOM inside `.md` spans, which CSS hides
 * until the item is being edited. Caret offsets therefore mean the same thing
 * in the rendered and the raw form.
 */

const TOKEN = new RegExp(
  [
    String.raw`(?<code>\x60[^\x60\n]+\x60)`,
    String.raw`(?<bold>\*\*[^*\n]+\*\*)`,
    String.raw`(?<italic>(?<![\w*])\*[^*\s](?:[^*\n]*[^*\s])?\*(?![\w*]))`,
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

function renderToken(groups: Record<string, string | undefined>, raw: string): string {
  if (groups.code) return wrapped("code", "", raw, 1);
  if (groups.bold) return wrapped("strong", "", raw, 2);
  if (groups.italic) return wrapped("em", "", raw, 1);
  if (groups.mdlink) {
    const [, label, url] = /^\[([^\]]+)\]\((.+)\)$/.exec(raw)!;
    return `${marker("[")}<a class="link" href="${escape(url)}" target="_blank" rel="noopener">${escape(label)}</a>${marker(`](${url})`)}`;
  }
  if (groups.url) return `<a class="link" href="${escape(raw)}" target="_blank" rel="noopener">${escape(raw)}</a>`;
  if (groups.tag) return `<span class="tag" data-tag="${escape(raw.toLowerCase())}">${escape(raw)}</span>`;
  return escape(raw);
}

function wrapped(tag: string, attributes: string, raw: string, markerLength: number): string {
  const open = raw.slice(0, markerLength);
  const inner = raw.slice(markerLength, raw.length - markerLength);
  return `<${tag}${attributes}>${marker(open)}${escape(inner)}${marker(open)}</${tag}>`;
}

function marker(text: string): string {
  return `<span class="md">${escape(text)}</span>`;
}

/** The text as a reader sees it, without markdown markers: for breadcrumbs, titles and labels. */
export function plainText(text: string): string {
  const container = document.createElement("div");
  container.innerHTML = renderInline(text);
  container.querySelectorAll(".md").forEach((marker) => marker.remove());
  return container.textContent ?? "";
}

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function tagsIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].filter((match) => match.groups?.tag).map((match) => match[0].toLowerCase());
}
