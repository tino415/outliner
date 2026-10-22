import { IncomingMessage, Server, ServerResponse, createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { parseSyncRequest } from "../src/sync/protocol";
import { Store } from "./store";
import { sendAppFile } from "./app-files";

export interface ServerOptions {
  store: Store;
  token: string;
  /** Origins allowed to call from a browser; `*` allows any, which is safe because nothing is sent without the token. */
  origins: string[];
  appDir?: string;
}

const MAX_BODY = 10 * 1024 * 1024;
export const MAX_FILE = 10 * 1024 * 1024;
const FILE_PATH = /^\/files\/([0-9a-f]{64})$/;

class TooLarge extends Error {}

export function createSyncServer({ store, token, origins, appDir }: ServerOptions): Server {
  return createServer(async (request, response) => {
    allowOrigin(request, response, origins);
    if (request.method === "OPTIONS") return send(response, 204);
    const path = new URL(request.url ?? "/", "http://localhost").pathname;

    if (request.method === "GET" && path === "/health") return send(response, 200, { ok: true });
    if (appDir && request.method === "GET" && !FILE_PATH.test(path) && (await sendAppFile(response, appDir, path))) return;
    if (!authorized(request, token)) return send(response, 401, { error: "missing or wrong token" });

    if (request.method === "POST" && path === "/sync") {
      try {
        const sync = parseSyncRequest(JSON.parse((await readBody(request, MAX_BODY)).toString("utf8")));
        store.write(sync.changes);
        return send(response, 200, { seq: store.latestSeq(), changes: store.changesAfter(sync.since) });
      } catch (error) {
        return send(response, 400, { error: (error as Error).message });
      }
    }

    const fileHash = FILE_PATH.exec(path)?.[1];
    if (fileHash && request.method === "PUT") return saveFile(request, response, store, fileHash);
    if (fileHash && request.method === "GET") return sendFile(response, store, fileHash);
    return send(response, 404, { error: "not found" });
  });
}

async function saveFile(request: IncomingMessage, response: ServerResponse, store: Store, hash: string): Promise<void> {
  try {
    const bytes = await readBody(request, MAX_FILE);
    if (createHash("sha256").update(bytes).digest("hex") !== hash) return send(response, 400, { error: "the content does not match its SHA-256" });
    store.saveFile(hash, request.headers["content-type"] ?? "application/octet-stream", bytes);
    return send(response, 201, { hash });
  } catch (error) {
    if (error instanceof TooLarge) return send(response, 413, { error: `files are limited to ${MAX_FILE / 1024 / 1024} MB` });
    throw error;
  }
}

function sendFile(response: ServerResponse, store: Store, hash: string): void {
  const file = store.file(hash);
  if (!file) return send(response, 404, { error: "no such file" });
  response.writeHead(200, { "Content-Type": file.type, "Cache-Control": "private, max-age=31536000, immutable" });
  response.end(Buffer.from(file.bytes));
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
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  response.setHeader("Access-Control-Max-Age", "86400");
  response.setHeader("Vary", "Origin");
}

function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new TooLarge("request too large"));
        request.resume();
      } else {
        chunks.push(chunk);
      }
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function send(response: ServerResponse, status: number, body?: unknown): void {
  response.writeHead(status, body === undefined ? {} : { "Content-Type": "application/json" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}
