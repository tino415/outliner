#!/bin/sh
# Starts the bundled sync server on a scratch database and drives it with the
# bundled CLI. Run inside the app container after `npm run build`.
set -eu

export OUTLINE_TOKEN=smoke-test-token-0123
export OUTLINE_SERVER=http://127.0.0.1:8799
database=$(mktemp -d)/smoke.db

PORT=8799 OUTLINE_DB="$database" node dist-node/server.mjs &
server=$!
trap 'kill $server; rm -f "$database"' EXIT
sleep 1

node dist-node/outline.mjs add "Hello from the CLI"
printf '%s\n' "- Week" "  - Monday" | node dist-node/outline.mjs add -
node dist-node/outline.mjs show --ids
if node dist-node/outline.mjs bogus; then exit 1; fi
echo "smoke test passed"
