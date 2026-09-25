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

pnpm --filter @virtus/shared build
pnpm db:setup
pnpm --filter @virtus/api build
# Next.js builds and serves a production bundle only with NODE_ENV=production (.env says
# development for the API).
NODE_ENV=production pnpm --filter @virtus/web build
pnpm --filter @virtus/api run start &
NODE_ENV=production exec pnpm --filter @virtus/web run start
