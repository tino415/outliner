import { DatabaseSync } from "node:sqlite";
import { Change, Field } from "../src/sync/replica";

/**
 * The current value of every field, with the clock that wrote it and a
 * sequence number that grows with every accepted write. Clients ask for
 * everything after the last sequence number they saw. Attached files are
 * kept by the SHA-256 of their content (doc/adr/0028).
 */
export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      create table if not exists fields (
        item text not null,
        field text not null,
        value text not null,
        clock text not null,
        seq integer not null,
        primary key (item, field)
      );
      create index if not exists fields_by_seq on fields (seq);
      create table if not exists files (
        hash text primary key,
        type text not null,
        bytes blob not null
      );
    `);
  }

  saveFile(hash: string, type: string, bytes: Uint8Array): void {
    this.db.prepare("insert into files (hash, type, bytes) values (?, ?, ?) on conflict (hash) do nothing").run(hash, type, bytes);
  }

  file(hash: string): { type: string; bytes: Uint8Array } | null {
    const row = this.db.prepare("select type, bytes from files where hash = ?").get(hash) as { type: string; bytes: Uint8Array } | undefined;
    return row ?? null;
  }

  latestSeq(): number {
    const row = this.db.prepare("select coalesce(max(seq), 0) as seq from fields").get() as { seq: number };
    return row.seq;
  }

  /** Keeps each change whose clock beats the stored one; returns how many were kept. */
  write(changes: Change[]): number {
    const current = this.db.prepare("select clock from fields where item = ? and field = ?");
    const upsert = this.db.prepare(`
      insert into fields (item, field, value, clock, seq) values (?, ?, ?, ?, ?)
      on conflict (item, field) do update set value = excluded.value, clock = excluded.clock, seq = excluded.seq
    `);
    let seq = this.latestSeq();
    let kept = 0;
    this.db.exec("begin");
    try {
      for (const change of changes) {
        const stored = current.get(change.item, change.field) as { clock: string } | undefined;
        if (stored && stored.clock >= change.clock) continue;
        seq += 1;
        upsert.run(change.item, change.field, JSON.stringify(change.value), change.clock, seq);
        kept += 1;
      }
      this.db.exec("commit");
    } catch (error) {
      this.db.exec("rollback");
      throw error;
    }
    return kept;
  }

  changesAfter(seq: number): Change[] {
    const rows = this.db.prepare("select item, field, value, clock from fields where seq > ? order by seq").all(seq) as {
      item: string;
      field: Field;
      value: string;
      clock: string;
    }[];
    return rows.map((row) => ({ item: row.item, field: row.field, value: JSON.parse(row.value), clock: row.clock }));
  }

  close(): void {
    this.db.close();
  }
}
