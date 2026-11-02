# Verified against

Guide sources checked 27 Oct 2026. Kit built and its open-source route self-tested on GitHub's hosted Ubuntu runner, 3 Nov 2026.

| Item | Version or page date | Source | How checked |
| --- | --- | --- | --- |
| agentgateway | v1.7.0 (27 Oct 2026), image `ghcr.io/agentgateway/agentgateway:v1.7.0` | https://github.com/agentgateway/agentgateway/releases/tag/v1.7.0 | Self-test; config fields from `schema/config.md` and `schema/cel.md` at v1.7.0 |
| OpenTelemetry Collector Contrib | 0.146.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib | Self-test |
| Jaeger | 2.22.0 (`jaegertracing/jaeger`) | https://github.com/jaegertracing/jaeger | Self-test |
| MCP sample server | `@modelcontextprotocol/server-everything` 2.1.0 on Node 22.23.4 | https://www.npmjs.com/package/@modelcontextprotocol/server-everything | Self-test |
| OpenTelemetry GenAI semantic conventions | `main` at 9d1e748280e64cf5688d7f348bf86be24c3fce12 (2 Nov 2026); Development status, no tagged release | https://github.com/open-telemetry/semantic-conventions-genai | Attribute names seen in the self-test traces |
| MCP protocol | 2026-07-28 (current); the lab client sends protocol version 2025-06-18 | https://modelcontextprotocol.io/docs/learn/versioning | Self-test |
| RFC 8693 (token exchange, `act` claim) | RFC 8693 | https://www.rfc-editor.org/rfc/rfc8693 | Lab token shape |
| ID-JAG | draft-04, 21 May 2026, expires 22 Nov 2026 | https://datatracker.ietf.org/doc/html/draft-ietf-oauth-identity-assertion-authz-grant-04 | Read |
| Entra: Agent ID logs | updated 17 Jun 2026 | https://learn.microsoft.com/en-us/entra/agent-id/sign-in-audit-logs-agents | Read; queries not yet run |
| Entra: Agent ID FAQ | updated 1 Oct 2026 | https://learn.microsoft.com/en-us/entra/agent-id/faq | Read |
| Entra: logs available for streaming | updated 12 May 2026 | https://learn.microsoft.com/en-us/entra/identity/monitoring-health/concept-diagnostic-settings-logs-options | Read |
| Azure Monitor: AADServicePrincipalSignInLogs | updated 28 Aug 2026 | https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/aadserviceprincipalsigninlogs | Read; queries not yet run |
| Microsoft Graph activity logs | updated 4 Jul 2026 | https://learn.microsoft.com/en-us/graph/microsoft-graph-activity-logs-overview | Read; queries not yet run |
| AgentValet tool surface | live MCP tool definitions, read 27 Oct 2026 | AgentValet MCP server | Read; not in the self-test |

## Found while building the kit

- agentgateway v1.7.0 names the tool-call span `tools/call <target>_<tool>` (for example `tools/call everything_echo`), under a `tools/call` request span. Its older docs call the operation `call_tool`.
- A call refused by `mcpAuthorization` still reaches the access log, with `reason: Authorization`, `error: mcp: authorization denied for tool: <name>` and HTTP 400. A log field holding only the policy name would wrongly record that call as allowed, so the kit derives the decision from the refusal.
