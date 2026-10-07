import { IncomingMessage, Server, ServerResponse, createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { parseSyncRequest } from "../src/sync/protocol";
import { Store } from "./store";

export interface ServerOptions {
  store: Store;
  token: string;
  /** Origins allowed to call from a browser; `*` allows any, which is safe because nothing is sent without the token. */
  origins: string[];
}

const MAX_BODY = 10 * 1024 * 1024;

export function createSyncServer({ store, token, origins }: ServerOptions): Server {
  return createServer(async (request, response) => {
    allowOrigin(request, response, origins);
    if (request.method === "OPTIONS") return send(response, 204);
    const path = new URL(request.url ?? "/", "http://localhost").pathname;

    if (request.method === "GET" && path === "/health") return send(response, 200, { ok: true });
    if (!authorized(request, token)) return send(response, 401, { error: "missing or wrong token" });

    if (request.method === "POST" && path === "/sync") {
      try {
        const sync = parseSyncRequest(JSON.parse(await readBody(request)));
        store.write(sync.changes);
        return send(response, 200, { seq: store.latestSeq(), changes: store.changesAfter(sync.since) });
      } catch (error) {
        return send(response, 400, { error: (error as Error).message });
      }
    }
    return send(response, 404, { error: "not found" });
  });
}

function authorized(request: IncomingMessage, token: string): boolean {
  const given = Buffer.from(request.headers.authorization?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function allowOrigin(request: IncomingMessage, response: ServerResponse, origins: string[]): void {
  const origin = request.headers.origin;
  if (!origin || !(origins.includes("*") || origins.includes(origin))) return;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Max-Age", "86400");
  response.setHeader("Vary", "Origin");
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("request too large"));
        request.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function send(response: ServerResponse, status: number, body?: unknown): void {
  response.writeHead(status, body === undefined ? {} : { "Content-Type": "application/json" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}
