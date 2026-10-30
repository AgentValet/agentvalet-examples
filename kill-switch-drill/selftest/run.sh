#!/usr/bin/env bash
# Self-test: runs drill.sh against the mock server and checks the order of refusals.
# Expected: gateway, new-token and introspection paths refuse at once; the token
# validated locally keeps working until it expires (LIFETIME seconds).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-8765}"; LIFETIME="${LIFETIME:-6}"; B="http://127.0.0.1:$PORT"
PY=""; for c in python3 python py; do if command -v "$c" >/dev/null 2>&1 && "$c" -c "import sys" >/dev/null 2>&1; then PY="$c"; break; fi; done
[ -n "$PY" ] || { echo "selftest needs Python 3" >&2; exit 2; }

"$PY" "$here/mock_server.py" "$PORT" "$LIFETIME" & server=$!
trap 'kill $server 2>/dev/null' EXIT
for _ in $(seq 1 50); do curl -s -o /dev/null "$B/gateway" && break; sleep 0.1; done

TOKEN=$(curl -sf -X POST "$B/token" | sed -E 's/.*"access_token": *"([^"]+)".*/\1/')
export TOKEN B
out="$(mktemp)"; rm -f "$out"

"$here/../drill.sh" \
  --check 'gateway=curl -sf "$B/gateway"' \
  --check 'new-token=curl -sf -X POST "$B/token"' \
  --check 'introspection=curl -sf "$B/introspect?token=$TOKEN"' \
  --check 'local-validation=curl -sf -H "Authorization: Bearer $TOKEN" "$B/api"' \
  --revoke 'curl -sf -X POST "$B/admin/gateway-off"' \
  --revoke 'curl -sf -X POST "$B/admin/revoke?token=$TOKEN"' \
  --revoke 'curl -sf -X POST "$B/admin/disable-client"' \
  --interval 0.5 --timeout 30 --label selftest --out "$out" | tee "$out.log"

# The locally validated token must be the slowest path, and refused near its expiry.
grep -q 'slowest path: local-validation' "$out.log"
awk -F, -v life="$LIFETIME" '$3=="local-validation" { if ($4 < life - 1.5 || $4 > life + 2.5) { print "local-validation at " $4 "s, expected about " life "s"; exit 1 } }' "$out"
awk -F, '$3=="gateway" || $3=="new-token" || $3=="introspection" { if ($4 > 3) { print $3 " took " $4 "s, expected under 3s"; exit 1 } }' "$out"
echo "selftest passed"
