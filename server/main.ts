import type { AddressInfo } from "node:net";
import { createSyncServer } from "./app";
import { Store } from "./store";

const token = process.env.OUTLINE_TOKEN;
if (!token || token.length < 16) {
  console.error("OUTLINE_TOKEN must be set to a secret of at least 16 characters");
  process.exit(1);
}

const store = new Store(process.env.OUTLINE_DB ?? "outline.db");
const port = Number(process.env.PORT ?? 8791);
const host = process.env.HOST ?? "0.0.0.0";
const origins = (process.env.OUTLINE_ORIGINS ?? "*").split(",").map((origin) => origin.trim());

const server = createSyncServer({ store, token, origins, appDir: process.env.OUTLINE_APP_DIR || undefined });
server.listen(port, host, () => {
  const { port: listeningPort } = server.address() as AddressInfo;
  console.log(`outline sync server on ${host}:${listeningPort}, seq ${store.latestSeq()}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => store.close());
    server.closeAllConnections();
  });
}
