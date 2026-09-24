#!/usr/bin/env bash
# Starts the Docker services (PostgreSQL, Redis, Garage, Mailpit), waits until they are
# healthy, then initialises the document storage. Safe to run several times.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/ensure-env.mjs
docker compose up -d --wait
bash scripts/init-storage.sh
