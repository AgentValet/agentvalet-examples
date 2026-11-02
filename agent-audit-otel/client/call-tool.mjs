#!/usr/bin/env node
// Make one MCP tool call through the gateway, the way an agent would.
// Node 18+, no dependencies. Speaks MCP streamable HTTP.
//
//   node call-tool.mjs --token "$TOKEN" --tool echo --args '{"message":"hello"}'
//   node call-tool.mjs --token "$TOKEN" --tool echo --args '{"message":"hi"}' --approval apr-123
//
// --approval sets the x-approval-id header. In a real deployment your approval
// system stamps it on the call it approved; the gateway logs it, so the access
// log record carries the approval's own ID as a join key.
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const url = opt("url", process.env.GATEWAY_URL || "http://localhost:3000/mcp");
const token = opt("token", process.env.TOKEN);
const tool = opt("tool");
const toolArgs = JSON.parse(opt("args", "{}"));
const approval = opt("approval");
if (!tool) {
  console.error("usage: call-tool.mjs --token JWT --tool NAME [--args JSON] [--approval ID] [--url URL]");
  process.exit(2);
}

let session;
let id = 0;

async function rpc(method, params, { notify = false } = {}) {
  const body = notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++id, method, params };
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-06-18",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (session) headers["mcp-session-id"] = session;
  if (approval) headers["x-approval-id"] = approval;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  session = res.headers.get("mcp-session-id") || session;
  const text = await res.text();
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${text.slice(0, 300)}`);
  if (notify || !text) return undefined;
  // A streamable HTTP response is either JSON or an SSE stream of JSON messages.
  const messages = (res.headers.get("content-type") || "").includes("text/event-stream")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => JSON.parse(l.slice(5)))
    : [JSON.parse(text)];
  const reply = messages.find((m) => m.id === id);
  if (!reply) throw new Error(`${method}: no reply in ${text.slice(0, 300)}`);
  if (reply.error) throw new Error(`${method}: ${JSON.stringify(reply.error)}`);
  return reply.result;
}

try {
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "agent-audit-otel-client", version: "1.0.0" },
  });
  await rpc("notifications/initialized", {}, { notify: true });
  const result = await rpc("tools/call", { name: tool, arguments: toolArgs });
  console.log(JSON.stringify({ session, tool, result }));
} catch (err) {
  console.error(String(err.message || err));
  process.exit(1);
}
