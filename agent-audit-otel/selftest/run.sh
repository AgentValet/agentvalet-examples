#!/usr/bin/env bash
# Self-test: brings up the lab, makes real MCP tool calls through the gateway,
# and checks that each one can be reconstructed from the logs alone.
#
# Needs Docker with Compose v2, Node 18+ and curl. Takes about two minutes on a
# first run while images download. Leaves nothing running unless KEEP=1.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
kit="$(cd "$here/.." && pwd)"
cd "$kit/oss"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-agent-audit-otel-selftest}"
GW="http://127.0.0.1:3000/mcp"
JAEGER="http://127.0.0.1:16686"
fail() { echo "FAIL: $*" >&2; docker compose logs --no-color --tail 60 agentgateway otel-collector >&2 || true; exit 1; }
cleanup() { [ "${KEEP:-0}" = 1 ] || docker compose down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

[ -f "$kit/issuer/keys/jwks.json" ] || node "$kit/issuer/mint.mjs" init
docker compose up -d --quiet-pull

echo "Waiting for the gateway..."
for _ in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$GW" || true)
  [ "$code" = 401 ] && break
  sleep 2
done
[ "$code" = 401 ] || fail "gateway did not come up (last status $code)"
echo "  ok      gateway refuses a call with no token (401)"

DELEGATED=$(node "$kit/issuer/mint.mjs" token --agent support-bot --user alice@example.com)
AUTONOMOUS=$(node "$kit/issuer/mint.mjs" token --agent support-bot)
OTHER=$(node "$kit/issuer/mint.mjs" token --agent report-bot)
call() { node "$kit/client/call-tool.mjs" --url "$GW" "$@"; }

# Wait for the gateway to reach the MCP server, then make the calls under test.
for _ in $(seq 1 30); do call --token "$AUTONOMOUS" --tool echo --args '{"message":"warm-up"}' >/dev/null 2>&1 && break; sleep 2; done
call --token "$DELEGATED" --tool echo --args '{"message":"refund order 1042"}' --approval apr-7731 >/dev/null \
  || fail "delegated echo call failed"
echo "  ok      support-bot for alice@example.com called echo (approval apr-7731)"
call --token "$AUTONOMOUS" --tool get-sum --args '{"a":2,"b":3}' >/dev/null || fail "autonomous get-sum call failed"
echo "  ok      support-bot for nobody called get-sum"
if call --token "$OTHER" --tool echo --args '{"message":"not allowed"}' >/dev/null 2>&1; then
  fail "report-bot was allowed to call echo; agent-tools-v1 should refuse it"
fi
echo "  ok      report-bot refused by agent-tools-v1"

echo "Waiting for the access log and traces..."
log=""
for _ in $(seq 1 30); do
  log=$(docker compose exec -T audit-reader cat /audit/access-log.jsonl 2>/dev/null || true)
  echo "$log" | grep -q 'refund order 1042' && echo "$log" | grep -q '"get-sum"' && break
  sleep 2
done
echo "$log" | grep -q 'refund order 1042' || fail "the delegated call is not in the access log"

# The five-minute question, answered from the access log alone.
echo
echo "$log" | node "$kit/queries/answer.mjs" --tool echo
answers=$(echo "$log" | node "$kit/queries/answer.mjs" --json)
trace_id="$(node --input-type=module -e '
  const calls = process.argv[1].trim().split("\n").map((l) => JSON.parse(l));
  const find = (pred, what) => { const c = calls.find(pred); if (!c) throw new Error("no record for " + what); return c; };
  const d = find((c) => JSON.stringify(c.arguments || "").includes("refund order 1042"), "the delegated call");
  const a = find((c) => c.tool === "get-sum", "the autonomous call");
  const r = find((c) => c.agent === "report-bot", "the refused call");
  const expect = (cond, msg) => { if (!cond) { console.error("FAIL: " + msg); console.error(JSON.stringify({ d, a }, null, 2)); process.exit(1); } };
  expect(d.agent === "support-bot", "delegated call: agent should be support-bot, got " + d.agent);
  expect(d.user === "alice@example.com", "delegated call: user should be alice@example.com, got " + d.user);
  expect(d.tool === "echo", "delegated call: tool should be echo, got " + d.tool);
  expect(d.decision === "allowed by agent-tools-v1", "delegated call: decision missing");
  expect(d.approver === "apr-7731", "delegated call: approver should be apr-7731, got " + d.approver);
  expect(JSON.stringify(d.result || "").includes("refund order 1042"), "delegated call: result missing");
  expect(/^[0-9a-f]{32}$/.test(d.traceId || ""), "delegated call: no trace ID to join on");
  expect(a.agent === "support-bot" && a.user === "none", "autonomous call: agent/user should be support-bot/none, got " + a.agent + "/" + a.user);
  expect(a.approver === "none", "autonomous call: approver should be none");
  expect(r.decision === "denied by agent-tools-v1", "refused call: decision should be denied by agent-tools-v1, got " + r.decision);
  expect(/authorization denied/.test(String(r.result)), "refused call: result should carry the refusal, got " + JSON.stringify(r.result));
  process.stdout.write(d.traceId);
' "$answers")" || fail "access log check"
echo "  ok      access log: six fields on every call, the refusal logged as denied, and a trace ID"

# The same call, found in Jaeger by its trace ID.
trace=""
for _ in $(seq 1 30); do
  trace=$(curl -sf "$JAEGER/api/traces/$trace_id" || true)
  echo "$trace" | grep -q '"jwt.sub"' && break
  sleep 2
done
for attr in jwt.sub gen_ai.tool.name mcp.session.id; do
  echo "$trace" | grep -q "\"$attr\"" || fail "trace $trace_id has no $attr attribute"
done
echo "  ok      Jaeger: trace $trace_id carries jwt.sub, gen_ai.tool.name and mcp.session.id"

# queries/jaeger.md tells people which service and operation to search.
names=$(echo "$trace" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const t = JSON.parse(s).data[0];
    const svc = [...new Set(Object.values(t.processes).map((p) => p.serviceName))];
    const ops = [...new Set(t.spans.map((x) => x.operationName))];
    console.log("services=" + svc.join(",") + " operations=" + ops.join(","));
  });')
echo "  info    Jaeger $names"
echo "$names" | grep -q 'services=agentgateway' || fail "trace service is not agentgateway ($names)"
echo "$names" | grep -q 'tools/call everything_echo' || fail "no 'tools/call everything_echo' operation in the trace ($names)"
echo "  ok      Jaeger: service agentgateway, operation tools/call everything_echo"

# The agent's side of the system cannot rewrite the record.
if docker compose exec -T audit-reader sh -c 'echo x >> /audit/access-log.jsonl' 2>/dev/null; then
  fail "the audit volume is writable from outside the collector"
fi
echo "  ok      the audit log is read-only to everything but the collector"
echo
echo "selftest passed"
