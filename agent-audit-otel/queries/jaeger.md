# Find one tool call in Jaeger

Open Jaeger at <http://localhost:16686>.

1. **Service:** `agentgateway`. **Operation:** `call_tool`.
2. **Tags:** `gen_ai.tool.name=echo` to narrow to one tool, or `jwt.sub=alice@example.com` to narrow to one token subject. Set the time range.
3. Open the trace. The gateway span carries:
   - `jwt.sub`: the token's subject. With a delegated token that is the user; see the README for where the agent is.
   - `gen_ai.tool.name` and `mcp.target`: the tool and the MCP server.
   - `mcp.session.id`: the MCP session, to find the agent's other calls.
4. Copy the trace ID. The access log record for the same call has the same `trace.id`, and it carries the fields the span does not: arguments, result, policy and approval ID.

The kit's self-test checks steps 3 and 4 on every run.

## From the command line

```bash
curl -s "http://localhost:16686/api/traces/<trace-id>" | grep -o '"jwt.sub"[^}]*}'
docker compose exec -T audit-reader cat /audit/access-log.jsonl | node ../queries/answer.mjs --json | grep <trace-id>
```
