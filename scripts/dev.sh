#!/usr/bin/env bash
# `pnpm dev`: starts the services, prepares the database, then runs the shared package watcher,
# the API and the web app.
# Stop everything with Ctrl+C (the Docker services keep running; `pnpm services:down` stops them).
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/services-up.sh
# Roles, database, migrations and demo data (idempotent: only what is missing is created).
pnpm db:setup

set -a
# shellcheck disable=SC1091
source .env
set +a

pnpm --filter @virtus/shared build

if [[ -n "${CODESPACE_NAME:-}" && -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]]; then
  base="https://${CODESPACE_NAME}"
  domain="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  web_url="${base}-3000.${domain}"
  mail_url="${base}-${MAILPIT_UI_PORT}.${domain}"
else
  web_url="http://localhost:3000"
  mail_url="http://localhost:${MAILPIT_UI_PORT}"
fi
# The browser reaches the app through this address: the API accepts requests from it (CSRF check)
# and marks session cookies Secure when it is https.
export WEB_ORIGIN="${web_url}"

cat <<EOF

  Virtus Assets — development environment
  Web app ........ ${web_url}
  API docs ....... ${web_url}/api/v1/docs
  Test emails .... ${mail_url}
  API health ..... http://${API_HOST}:${API_PORT}/health/ready (internal)

EOF

exec pnpm --parallel --filter @virtus/shared --filter @virtus/api --filter @virtus/web run dev
