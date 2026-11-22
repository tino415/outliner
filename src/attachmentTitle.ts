export const ATTACHMENT = /(!?)\[([^\]\n]*)\]\(att:([0-9a-f]{64})\)/;

const WHOLE_TITLE = new RegExp(`^\\s*${ATTACHMENT.source}\\s*$`);

export interface AttachmentTitle {
  image: boolean;
  name: string;
  hash: string;
}

/** An attachment child is an item whose whole title is one attachment link (doc/adr/0069). */
export function attachmentTitle(text: string): AttachmentTitle | null {
  const found = WHOLE_TITLE.exec(text);
  return found && { image: found[1] === "!", name: found[2], hash: found[3] };
}
