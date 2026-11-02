# agent-audit-otel

**[Full guide on AgentValet.ai](https://agentvalet.ai/blog/what-did-the-agent-do-last-tuesday)**

What did the agent do last Tuesday? Somebody will ask: an auditor, a customer or whoever is running the incident.

This kit answers it from logs alone. It puts an MCP gateway in front of an agent's tools, so every tool call is authenticated and written to an access log with six fields: **agent, user, tool (with arguments), decision, approver and result**. A trace ID joins each record to the full trace in Jaeger, and the log sits on a volume only the collector can write.

It runs without AgentValet. It needs Docker with Compose v2 and Node 18 or later.

## Quick start

```bash
git clone https://github.com/AgentValet/agentvalet-examples
cd agentvalet-examples/agent-audit-otel
./selftest/run.sh
```

The self-test brings up the lab, makes real tool calls as two agents, and checks that each call can be reconstructed. It takes about two minutes the first time while images download.

```text
  ok      gateway refuses a call with no token (401)
  ok      support-bot for alice@example.com called echo (approval apr-7731)
  ok      support-bot for nobody called get-sum
  ok      report-bot refused by agent-tools-v1
  ok      access log: six fields on every call, the refusal logged as denied, and a trace ID
  ok      Jaeger: trace … carries jwt.sub, gen_ai.tool.name and mcp.session.id
  info    Jaeger services=agentgateway operations=tools/call,tools/call everything_echo
  ok      Jaeger: service agentgateway, operation tools/call everything_echo
  ok      the audit log is read-only to everything but the collector

selftest passed
```

It runs in CI on every change and weekly, so the configs here match the pinned versions.

## Explore it yourself

```bash
node issuer/mint.mjs init                  # a throwaway signing key for the lab
cd oss && docker compose up -d
TOKEN=$(node ../issuer/mint.mjs token --agent support-bot --user alice@example.com)
node ../client/call-tool.mjs --token "$TOKEN" --tool echo --args '{"message":"refund order 1042"}' --approval apr-7731

# The five-minute question, answered from the access log
docker compose exec -T audit-reader cat /audit/access-log.jsonl | node ../queries/answer.mjs
```

```text
2026-11-02T23:02:33.641Z  trace 362c145ba5147ee705bfea585389de46
  agent     support-bot
  user      alice@example.com
  tool      echo
  arguments {"message":"refund order 1042"}
  decision  allowed by agent-tools-v1
  approver  apr-7731
  result    {"content":[{"type":"text","text":"Echo: refund order 1042"}]}
  score     6/6
```

Then open Jaeger at <http://localhost:16686> and follow [queries/jaeger.md](queries/jaeger.md). `docker compose down -v` removes everything.

## What's in the kit

| Path | What it does |
| --- | --- |
| `oss/compose.yaml` | agentgateway, OpenTelemetry Collector, Jaeger and a sample MCP server, all pinned |
| `oss/agentgateway.yaml` | JWT authentication, a tool policy (`agent-tools-v1`), tracing, and an access log carrying the six fields |
| `oss/otel-collector.yaml` | Traces to Jaeger; access logs to a file on a volume only the collector writes |
| `issuer/mint.mjs` | A throwaway token issuer for the lab (no dependencies) |
| `client/call-tool.mjs` | Makes one MCP tool call, as an agent would (no dependencies) |
| `queries/answer.mjs` | Reads the access log and prints the six fields per call, flagging any that are missing |
| `queries/jaeger.md` | Finding one call in Jaeger, and joining it to the access log |
| `queries/entra.kql` | Microsoft Entra Agent ID queries for Log Analytics (**not yet run against a live tenant**; see the file) |
| `five-minute-test.md`, `scoring-sheet.csv` | The test, the metric and the 20-call scoring sheet |
| `agentvalet/README.md` | The same six fields when agents call SaaS APIs through AgentValet (optional) |
| `verified-against.md` | Versions and pages this kit was checked against |

## Where each field comes from

| Field | In the lab | In your deployment |
| --- | --- | --- |
| Agent | `act.sub` in a delegated token, else `sub` | The claim your identity provider uses for the client: often `azp` or `client_id`; Entra uses `appid` (v1 tokens) or `azp` (v2) |
| User | `sub` in a delegated token, else `none` | The subject of a delegated token (Entra: `oid` or `sub`). An app-only token has no user: log `none`, not a blank |
| Tool | `mcp.tool.name`, `mcp.tool.target`, `mcp.tool.arguments` | Same; arguments can hold personal data, so set retention first |
| Decision | `policy` (the policy's name and version) plus the gateway's refusal (`reason: Authorization`) | Same, or the decision your external policy service returns |
| Approver | The `x-approval-id` header your approval system stamps on the call it approved | Same, or join on the approval system's own record |
| Result | `mcp.tool.result`, or `mcp.tool.error` | Same |

The lab's tokens use the RFC 8693 delegation shape: when the agent acts for a person, `sub` is the person and `act.sub` is the agent. Change the `agent` and `user` expressions in `oss/agentgateway.yaml` to match your provider. Check the claim names in one of your own tokens before you trust them.

## Limits

- The self-test covers the open-source route only. The Entra queries are written from Microsoft's documentation and have not been run against a live tenant.
- The lab's issuer and its keys are for the lab. Use your real identity provider in production.
- The audit volume protects the record from the agent and the gateway on one machine. In production, ship the log to a store whose write and delete rights the agent's credentials don't have.
- OpenTelemetry GenAI attributes such as `gen_ai.tool.name` have Development status and can be renamed. Versions are pinned in `verified-against.md`.

## Licence

MIT, like the rest of this repository.
