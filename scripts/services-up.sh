#!/usr/bin/env bash
# Starts the Docker services (PostgreSQL, Redis, Garage, Mailpit), waits until they are
# healthy, then initialises the document storage. Safe to run several times.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/ensure-env.mjs
# After a Codespace restart, containers stopped abruptly may be unusable ("RWLayer … is nil").
# In that case they are recreated; data lives in named volumes and is kept.
if ! docker compose up -d --wait; then
  echo 'Services could not start: recreating the containers (data volumes are kept)…'
  docker compose down
  docker compose up -d --wait
fi
bash scripts/init-storage.sh
