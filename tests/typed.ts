import { Doc, ItemId, liftNoteProperties, setNote } from "../src/model";

/** A note as typed and then left: its `:key: value` lines become properties, as in the app (doc/adr/0032). */
export function setNoteAsTyped(doc: Doc, id: ItemId, note: string): Doc {
  return liftNoteProperties(setNote(doc, id, note), [id]);
}
