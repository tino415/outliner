import { Change, Field } from "./replica";

/** What a client sends: its unsent changes and the last sequence number it has seen. */
export interface SyncRequest {
  since: number;
  changes: Change[];
}

/** What the server answers: every field written after `since`, and the sequence number to ask from next time. */
export interface SyncResponse {
  seq: number;
  changes: Change[];
}

const FIELDS: Record<Field, "string" | "boolean" | "string or null"> = {
  text: "string",
  note: "string",
  parent: "string or null",
  position: "string",
  collapsed: "boolean",
  completed: "boolean",
  deleted: "boolean",
};

const MAX_TEXT = 100_000;

/** Throws with a readable reason unless `body` is a well-formed sync request. */
export function parseSyncRequest(body: unknown): SyncRequest {
  const request = body as Partial<SyncRequest> | null;
  if (!request || typeof request !== "object") throw new Error("expected a JSON object");
  if (!Number.isInteger(request.since) || request.since! < 0) throw new Error("since must be a non-negative integer");
  if (!Array.isArray(request.changes)) throw new Error("changes must be an array");
  request.changes.forEach((change, index) => {
    const problem = changeProblem(change);
    if (problem) throw new Error(`change ${index}: ${problem}`);
  });
  return request as SyncRequest;
}

function changeProblem(change: Partial<Change>): string | null {
  if (typeof change !== "object" || change === null) return "not an object";
  if (typeof change.item !== "string" || change.item.length === 0 || change.item.length > 64) return "bad item id";
  if (typeof change.clock !== "string" || change.clock.length > 100) return "bad clock";
  const kind = FIELDS[change.field as Field];
  if (!kind) return `unknown field ${String(change.field)}`;
  const value = change.value;
  const fits =
    kind === "boolean"
      ? typeof value === "boolean"
      : kind === "string"
        ? typeof value === "string"
        : value === null || typeof value === "string";
  if (!fits) return `${change.field} must be a ${kind}`;
  if (typeof value === "string" && value.length > MAX_TEXT) return `${change.field} is too long`;
  return null;
}
