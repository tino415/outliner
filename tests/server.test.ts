import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { MAX_FILE, createSyncServer } from "../server/app";
import { Store } from "../server/store";
import { Change } from "../src/sync/replica";

const token = "test-token-0123456789";
let server: Server;
let store: Store;
let base: string;

beforeEach(async () => {
  store = new Store(":memory:");
  server = createSyncServer({ store, token, origins: ["https://app.example"] });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.close();
});

function sync(body: unknown, headers: Record<string, string> = { Authorization: `Bearer ${token}` }) {
  return fetch(`${base}/sync`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

const change = (item: string, value: string, clock: string): Change => ({ item, field: "text", value, clock });

describe("sync server", () => {
  it("stores changes and hands back everything after a sequence number", async () => {
    const first = await (await sync({ since: 0, changes: [change("a", "one", "1"), change("b", "two", "1")] })).json();
    expect(first.seq).toBe(2);
    expect(first.changes.map((c: Change) => c.value)).toEqual(["one", "two"]);

    const second = await (await sync({ since: 2, changes: [change("a", "uno", "2")] })).json();
    expect(second).toEqual({ seq: 3, changes: [change("a", "uno", "2")] });

    const nothingNew = await (await sync({ since: 3, changes: [] })).json();
    expect(nothingNew).toEqual({ seq: 3, changes: [] });
  });

  it("keeps the change with the later clock whatever order they arrive in", async () => {
    await sync({ since: 0, changes: [change("a", "later", "5")] });
    const answer = await (await sync({ since: 0, changes: [change("a", "earlier", "3")] })).json();
    expect(answer.changes).toEqual([change("a", "later", "5")]);
  });

  it("rejects requests without the token", async () => {
    expect((await sync({ since: 0, changes: [] }, {})).status).toBe(401);
    expect((await sync({ since: 0, changes: [] }, { Authorization: "Bearer wrong" })).status).toBe(401);
  });

  it("rejects malformed changes and stores none of them", async () => {
    const response = await sync({ since: 0, changes: [change("a", "fine", "1"), { item: "b", field: "owner", value: "x", clock: "1" }] });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("unknown field owner");
    expect(store.latestSeq()).toBe(0);
  });

  it("answers CORS preflights for allowed origins only", async () => {
    const allowed = await fetch(`${base}/sync`, { method: "OPTIONS", headers: { Origin: "https://app.example" } });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://app.example");
    const other = await fetch(`${base}/sync`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows PUT from the browser, for attachments", async () => {
    const allowed = await fetch(`${base}/files/x`, { method: "OPTIONS", headers: { Origin: "https://app.example" } });
    expect(allowed.headers.get("access-control-allow-methods")).toContain("PUT");
  });

  it("keeps data across restarts of the store", async () => {
    const file = `/tmp/outline-test-${process.pid}-${Date.now()}.db`;
    const first = new Store(file);
    first.write([change("a", "kept", "1")]);
    first.close();
    const second = new Store(file);
    expect(second.changesAfter(0)).toEqual([change("a", "kept", "1")]);
    second.close();
    rmSync(file);
  });
});

describe("attachments", () => {
  const bytes = new TextEncoder().encode("a small screenshot");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const auth = { Authorization: `Bearer ${token}` };
  const put = (name: string, body: Uint8Array, headers: Record<string, string> = auth) =>
    fetch(`${base}/files/${name}`, { method: "PUT", headers: { "Content-Type": "image/png", ...headers }, body });

  it("stores a file under its SHA-256 and hands it back with its type", async () => {
    expect((await put(hash, bytes)).status).toBe(201);
    const back = await fetch(`${base}/files/${hash}`, { headers: auth });
    expect(back.status).toBe(200);
    expect(back.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes);
  });

  it("refuses a file whose content does not match the name", async () => {
    const response = await put("0".repeat(64), bytes);
    expect(response.status).toBe(400);
    expect((await fetch(`${base}/files/${"0".repeat(64)}`, { headers: auth })).status).toBe(404);
  });

  it("needs the token to store or read a file", async () => {
    expect((await put(hash, bytes, {})).status).toBe(401);
    await put(hash, bytes);
    expect((await fetch(`${base}/files/${hash}`)).status).toBe(401);
  });

  it("refuses a file over the size limit", async () => {
    const big = new Uint8Array(MAX_FILE + 1);
    const response = await put(createHash("sha256").update(big).digest("hex"), big);
    expect(response.status).toBe(413);
  });
});
