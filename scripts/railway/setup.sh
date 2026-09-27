#!/usr/bin/env bash
# First installation of the online demonstration on Railway (phase 16b, D-097, D-106).
#   RAILWAY_API_TOKEN=… bash scripts/railway/setup.sh <project-id> <github-owner/repo>
# Creates, in the EU West region (Amsterdam): postgres, redis, a documents bucket, mailpit, api,
# web and the nightly backup job. Secrets are drawn here and stored only in Railway's variables:
# nothing is written to the repository. Run once; later changes are deployed by pushing to main.
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT_ID=${1:?project id}
REPO=${2:?github owner/repo}
REGION='europe-west4-drams3a'
railway() { npx -y @railway/cli@5.62.1 "$@"; }
secret() { openssl rand -hex 24; }
config() { railway environment edit --service-config "$@" >/dev/null; }
in_europe() { config "$1" deploy.multiRegionConfig "{\"${REGION}\":{\"numReplicas\":1}}"; }

railway link --project "$PROJECT_ID" --environment production >/dev/null

POSTGRES_PASSWORD=$(secret)
DB_MIGRATOR_PASSWORD=$(secret)
DB_APP_PASSWORD=$(secret)
DB_AUTH_PASSWORD=$(secret)
DB_JOBS_PASSWORD=$(secret)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
DEMO_ACCOUNTS_PASSWORD=$(secret)
MAILPIT_UI_PASSWORD=$(secret)

echo '1/7 PostgreSQL 18'
railway add --service postgres --image postgres:18.6-alpine \
  --variables POSTGRES_USER=va_admin \
  --variables "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" \
  --variables POSTGRES_DB=veris_assets >/dev/null
railway volume --service postgres add --mount-path /var/lib/postgresql >/dev/null
in_europe postgres

echo '2/7 Redis'
railway add --service redis --image redis:8.10.2-alpine >/dev/null
in_europe redis

echo '3/7 Documents bucket'
railway bucket create veris-documents --region ams --json > /tmp/veris-bucket.json
BUCKET_CREDENTIALS=$(railway bucket credentials --bucket veris-documents --json)
field() { node -e "const c=JSON.parse(process.argv[1]);console.log(c[process.argv[2]] ?? '')" "$BUCKET_CREDENTIALS" "$1"; }

echo '4/7 Test mail box'
railway add --service mailpit --repo "$REPO" \
  --variables RAILWAY_DOCKERFILE_PATH=infra/mailpit/Dockerfile \
  --variables "MAILPIT_UI_PASSWORD=${MAILPIT_UI_PASSWORD}" \
  --variables PORT=8025 >/dev/null
in_europe mailpit
MAILPIT_DOMAIN=$(railway domain --service mailpit --port 8025 --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).domain))")

echo '5/7 Web app (public address first: the API needs it)'
railway add --service web --repo "$REPO" \
  --variables RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile \
  --variables API_INTERNAL_URL=http://api.railway.internal:4000 \
  --variables PORT=3000 >/dev/null
in_europe web
WEB_DOMAIN=$(railway domain --service web --port 3000 --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).domain))")
railway variable set --service web --skip-deploys "WEB_ORIGIN=https://${WEB_DOMAIN}" >/dev/null

API_VARIABLES=(
  NODE_ENV=production DEMO_MODE=true JOBS_ENABLED=true
  API_HOST=:: API_PORT=4000 "WEB_ORIGIN=https://${WEB_DOMAIN}" 'TRUST_PROXY=loopback,uniquelocal'
  POSTGRES_HOST=postgres.railway.internal POSTGRES_PORT=5432 POSTGRES_USER=va_admin
  "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" POSTGRES_DB=veris_assets
  "DB_MIGRATOR_PASSWORD=${DB_MIGRATOR_PASSWORD}" "DB_APP_PASSWORD=${DB_APP_PASSWORD}"
  "DB_AUTH_PASSWORD=${DB_AUTH_PASSWORD}" "DB_JOBS_PASSWORD=${DB_JOBS_PASSWORD}"
  "BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}" "DEMO_ACCOUNTS_PASSWORD=${DEMO_ACCOUNTS_PASSWORD}"
  REDIS_HOST=redis.railway.internal REDIS_PORT=6379 REDIS_KEY_PREFIX=va:
  SMTP_HOST=mailpit.railway.internal SMTP_PORT=1025
  'MAIL_FROM=Veris Assets <no-reply@veris-assets.example>' CONTACT_EMAIL=contact@veris-assets.example
  "S3_ENDPOINT=$(field endpoint)" "S3_REGION=$(field region)" "S3_BUCKET=$(field bucket)"
  "S3_ACCESS_KEY_ID=$(field accessKeyId)" "S3_SECRET_ACCESS_KEY=$(field secretAccessKey)"
  S3_FORCE_PATH_STYLE=false
  PROVIDER_KYC_MODE=success PROVIDER_FILE_SCANNER_MODE=success PROVIDER_PAYMENT_MODE=success
)
flags() { for variable in "${API_VARIABLES[@]}"; do printf -- '--variables\n%s\n' "$variable"; done; }

echo '6/7 API (private: reached only by the web app)'
mapfile -t API_FLAGS < <(flags)
railway add --service api --repo "$REPO" \
  --variables RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile "${API_FLAGS[@]}" >/dev/null
in_europe api
config api deploy.preDeployCommand 'pnpm db:setup'
config api deploy.healthcheckPath '/health/ready'

echo '7/7 Nightly backup (02:30 UTC), kept in the bucket'
railway add --service backup --repo "$REPO" \
  --variables RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile "${API_FLAGS[@]}" >/dev/null
in_europe backup
config backup deploy.startCommand 'pnpm db:backup --database-only --upload'
config backup deploy.cronSchedule '30 2 * * *'
config backup deploy.restartPolicyType 'NEVER'

cat <<INFO

  Online demonstration — Veris Assets
  Web app ........ https://${WEB_DOMAIN}
  Test emails .... https://${MAILPIT_DOMAIN}   (user "demo", password below)
  Mailbox password and demo accounts password: see the Railway variables
  MAILPIT_UI_PASSWORD (service mailpit) and DEMO_ACCOUNTS_PASSWORD (service api).

INFO
