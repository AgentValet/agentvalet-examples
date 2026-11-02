#!/usr/bin/env node
// Answer the five-minute question from the gateway's access log.
// Node 18+, no dependencies.
//
//   docker compose exec -T audit-reader cat /audit/access-log.jsonl | node answer.mjs
//   ... | node answer.mjs --tool echo            only calls to one tool
//   ... | node answer.mjs --json                 one JSON object per call
//
// Reads the OpenTelemetry collector's file export (OTLP JSON, one batch per
// line) and prints, for every tool call: agent, user, tool and arguments,
// decision, approver, result, and the trace ID that joins it to Jaeger.
// A field the record does not carry prints as MISSING: that is the field to fix.
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const toolFilter = args.includes("--tool") ? args[args.indexOf("--tool") + 1] : undefined;
const asJson = args.includes("--json");

// OTLP AnyValue to a plain JS value.
function plain(v) {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("boolValue" in v) return v.boolValue;
  if ("intValue" in v) return Number(v.intValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(plain);
  if ("kvlistValue" in v) return Object.fromEntries((v.kvlistValue.values || []).map((kv) => [kv.key, plain(kv.value)]));
  if ("bytesValue" in v) return v.bytesValue;
  return undefined;
}

// Some gateways write structured fields as JSON strings; accept both.
function parsed(x) {
  if (typeof x !== "string") return x;
  try {
    return JSON.parse(x);
  } catch {
    return x;
  }
}

export function records(batch) {
  const out = [];
  for (const rl of batch.resourceLogs || [])
    for (const sl of rl.scopeLogs || [])
      for (const lr of sl.logRecords || []) {
        const a = Object.fromEntries((lr.attributes || []).map((kv) => [kv.key, plain(kv.value)]));
        out.push({ ...a, traceId: lr.traceId || a["trace.id"], time: lr.timeUnixNano || lr.observedTimeUnixNano });
      }
  return out;
}

// The six fields, from the attribute names set in oss/agentgateway.yaml.
export function sixFields(r) {
  const err = parsed(r.tool_error);
  const res = parsed(r.tool_result);
  // agentgateway marks a call its authorization policy refused with
  // reason "Authorization" and an "authorization denied" error.
  const denied = r.reason === "Authorization" || /authorization denied/i.test(String(r.error || ""));
  return {
    agent: r.agent,
    user: r.user,
    tool: r["mcp.tool.name"] || r["gen_ai.tool.name"] || r.tool,
    arguments: parsed(r.tool_args),
    decision: r.policy ? `${denied ? "denied" : "allowed"} by ${r.policy}` : undefined,
    approver: r.approval_id,
    result: err ?? res ?? (denied ? r.error : undefined),
    traceId: r.traceId,
    tokenId: r.token_id,
    when: r.time ? new Date(Number(BigInt(r.time) / 1000000n)).toISOString() : undefined,
  };
}

const SIX = ["agent", "user", "tool", "arguments", "decision", "approver", "result"];

async function main() {
  const rl = createInterface({ input: process.stdin });
  const calls = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    for (const r of records(JSON.parse(line))) {
      const f = sixFields(r);
      if (!f.tool) continue;
      if (toolFilter && f.tool !== toolFilter) continue;
      calls.push(f);
    }
  }
  if (asJson) {
    for (const c of calls) console.log(JSON.stringify(c));
    return;
  }
  if (!calls.length) {
    console.log("No tool calls in the log yet.");
    return;
  }
  for (const c of calls) {
    console.log(`${c.when || "?"}  trace ${c.traceId || "MISSING"}`);
    for (const k of SIX) {
      const v = c[k];
      const shown = v === undefined || v === null || v === "" ? "MISSING" : typeof v === "string" ? v : JSON.stringify(v);
      console.log(`  ${k.padEnd(9)} ${shown.length > 160 ? shown.slice(0, 157) + "..." : shown}`);
    }
    const missing = SIX.filter((k) => c[k] === undefined || c[k] === null || c[k] === "");
    console.log(`  score     ${SIX.length - missing.length === 7 ? "6/6" : "fail"}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("answer.mjs")) await main();
