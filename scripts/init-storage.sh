#!/usr/bin/env bash
# Idempotent Garage initialisation (decision D-005):
#   1. gives the single node a storage role (cluster layout),
#   2. imports the access key defined in .env,
#   3. creates the documents bucket and grants the key access to it.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
source .env
set +a

garage() {
  local output
  if ! output=$(docker compose exec -T garage /garage "$@" 2>&1); then
    echo "$output" >&2
    return 1
  fi
  printf '%s\n' "$output"
}

if garage status | grep -q 'NO ROLE ASSIGNED'; then
  node_id=$(garage node id -q | grep -oE '^[0-9a-f]{64}')
  current_version=$(garage layout show | grep -oE 'Current cluster layout version: [0-9]+' | grep -oE '[0-9]+$')
  garage layout assign -z dc1 -c 1G "$node_id" >/dev/null
  garage layout apply --version "$((current_version + 1))" >/dev/null
  echo 'Storage: node layout applied.'
fi

if ! garage key info "$S3_ACCESS_KEY_ID" >/dev/null 2>&1; then
  garage key import --yes -n va-dev "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
  echo 'Storage: access key imported.'
fi

if ! garage bucket info "$S3_BUCKET" >/dev/null 2>&1; then
  garage bucket create "$S3_BUCKET" >/dev/null
  echo "Storage: bucket $S3_BUCKET created."
fi

garage bucket allow --read --write --owner "$S3_BUCKET" --key "$S3_ACCESS_KEY_ID" >/dev/null
echo "Storage ready: bucket $S3_BUCKET."
