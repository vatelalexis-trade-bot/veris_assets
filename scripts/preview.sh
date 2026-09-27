#!/usr/bin/env bash
# `pnpm preview`: the demonstration as it will run online — the API and the web app are built
# once (a few minutes), then every page opens at once, unlike `pnpm dev` which compiles each page
# the first time it is opened. No automatic reload: run it again after a change.
# Stop with Ctrl+C (the Docker services keep running; `pnpm services:down` stops them).
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/services-up.sh
pnpm db:setup

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -n "${CODESPACE_NAME:-}" && -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]]; then
  base="https://${CODESPACE_NAME}"
  domain="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  web_url="${base}-3000.${domain}"
  mail_url="${base}-${MAILPIT_UI_PORT}.${domain}"
else
  web_url="http://localhost:3000"
  mail_url="http://localhost:${MAILPIT_UI_PORT}"
fi
export WEB_ORIGIN="${web_url}"

echo "Building the application (a few minutes)…"
pnpm --filter @veris/shared build
pnpm --filter @veris/api build
# Next.js builds and serves a production bundle only with NODE_ENV=production.
NODE_ENV=production pnpm --filter @veris/web build

cat <<INFO

  Veris Assets — preview (built version)
  Web app ........ ${web_url}
  Test emails .... ${mail_url}

INFO

# Both processes stop together on Ctrl+C. The web app starts once the API answers.
trap 'kill 0' EXIT
pnpm --filter @veris/api run start &
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://${API_HOST}:${API_PORT}/health" && break
  sleep 1
done
NODE_ENV=production pnpm --filter @veris/web run start
