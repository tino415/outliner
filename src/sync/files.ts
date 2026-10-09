import { Endpoint, SyncError } from "./client";

/* Attached files on the sync server, kept by the SHA-256 of their content (doc/adr/0028). */

export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadFile(endpoint: Endpoint, hash: string, type: string, bytes: Blob | Uint8Array): Promise<void> {
  const response = await request(endpoint, hash, { method: "PUT", headers: { "Content-Type": type || "application/octet-stream" }, body: bytes as BodyInit });
  if (!response.ok) throw new SyncError(`the server refused the file: ${await reason(response)}`, response.status);
}

export async function downloadFile(endpoint: Endpoint, hash: string): Promise<Blob | null> {
  const response = await request(endpoint, hash, { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) throw new SyncError(`cannot fetch the file: ${await reason(response)}`, response.status);
  return response.blob();
}

async function request(endpoint: Endpoint, hash: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${endpoint.server.replace(/\/+$/, "")}/files/${hash}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${endpoint.token}` },
    });
  } catch (error) {
    throw new SyncError(`cannot reach ${endpoint.server}: ${(error as Error).message}`);
  }
}

async function reason(response: Response): Promise<string> {
  const detail = await response.json().catch(() => ({ error: response.statusText }));
  return `${response.status} ${detail.error}`;
}
