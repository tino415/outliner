import { SyncRequest, SyncResponse } from "./protocol";

export interface Endpoint {
  server: string;
  token: string;
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** One round trip: send changes, receive everything newer than `since`. */
export async function exchange(endpoint: Endpoint, request: SyncRequest): Promise<SyncResponse> {
  let response: Response;
  try {
    response = await fetch(`${endpoint.server.replace(/\/+$/, "")}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.token}` },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw new SyncError(`cannot reach ${endpoint.server}: ${(error as Error).message}`);
  }
  if (response.status === 401) throw new SyncError("the server refused the token", 401);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ error: response.statusText }));
    throw new SyncError(`the server answered ${response.status}: ${detail.error}`, response.status);
  }
  return (await response.json()) as SyncResponse;
}
