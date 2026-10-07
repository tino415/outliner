#!/bin/sh
# Writes .env.sync with a fresh random token unless it already exists. The
# sync server and the CLI read the token from there; the app asks for it once
# per device.
set -eu
cd "$(dirname "$0")/.."
if [ -e .env.sync ]; then
  echo ".env.sync already exists; delete it first to make a new token"
  exit 0
fi
umask 077
token=$(head -c 24 /dev/urandom | base64 | tr '+/' '-_')
printf 'OUTLINE_TOKEN=%s\n' "$token" > .env.sync
echo "wrote .env.sync"
