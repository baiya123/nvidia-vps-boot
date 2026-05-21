#!/usr/bin/env bash
set -euo pipefail

NVIDIA_AIR_API_BASE="https://api.air-ngc.nvidia.com/api/v3"
NVIDIA_AIR_API_KEY=""
SIMULATION_ID=""

target_sleep_at="$(
python3 - <<'PY'
from datetime import datetime, timedelta, timezone

target = datetime.now(timezone.utc) + timedelta(hours=71)
print(target.replace(microsecond=0).isoformat().replace("+00:00", "Z"))
PY
)"

payload="$(mktemp)"
before_body="$(mktemp)"
after_body="$(mktemp)"
trap 'rm -f "$payload" "$before_body" "$after_body"' EXIT

printf '{"sleep_at":"%s"}' "$target_sleep_at" > "$payload"

simulation_url="${NVIDIA_AIR_API_BASE%/}/simulations/${SIMULATION_ID}/"

echo "target_sleep_at=$target_sleep_at"

curl --ipv4 -sS \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: air-sdk/1.3.1' \
  -H 'X-Air-Sdk-Version: 1.3.1' \
  -H "Authorization: Bearer $NVIDIA_AIR_API_KEY" \
  "$simulation_url" > "$before_body"

echo "before_sleep_at=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("sleep_at"))' "$before_body")"

curl --ipv4 -sS -X PATCH \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: air-sdk/1.3.1' \
  -H 'X-Air-Sdk-Version: 1.3.1' \
  -H "Authorization: Bearer $NVIDIA_AIR_API_KEY" \
  --data @"$payload" \
  "$simulation_url" > "$after_body"

after_sleep_at="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("sleep_at"))' "$after_body")"
echo "after_sleep_at=$after_sleep_at"

if [ "$after_sleep_at" != "$target_sleep_at" ]; then
  echo "verify failed: expected=$target_sleep_at actual=$after_sleep_at" >&2
  exit 1
fi

echo "ok"
