#!/usr/bin/env bash
# Starts the application as in production (built API and web app) for the Playwright scenarios
# (docs/ARCHITECTURE.md, tests/e2e). The database is prepared first; demo mode gives the tests
# the current two-factor codes of the demo accounts.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
export DEMO_MODE=true
export WEB_ORIGIN=http://localhost:3000
export LOG_LEVEL="${LOG_LEVEL:-warn}"

pnpm --filter @veris/shared build
pnpm db:setup
pnpm --filter @veris/api build
# Next.js builds and serves a production bundle only with NODE_ENV=production (.env says
# development for the API).
NODE_ENV=production pnpm --filter @veris/web build
pnpm --filter @veris/api run start &
# The web app starts once the API answers, so that its first pages never meet a closed port.
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://${API_HOST:-127.0.0.1}:${API_PORT:-4000}/health" && break
  sleep 1
done
NODE_ENV=production exec pnpm --filter @veris/web run start
