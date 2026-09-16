// Shared helpers for lab 01. Nothing here talks to a platform directly: every
// call goes through @agentvalet/client, which signs a 60-second assertion
// with the key `npx @agentvalet/register install` wrote in this container.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AgentValet } from "@agentvalet/client";

export const PROXY_URL = (process.env.AGENTVALET_PROXY_URL ?? process.env.PROXY_URL ?? "https://api.agentvalet.ai").replace(/\/$/, "");
export const DASHBOARD_URL = "https://app.agentvalet.ai";
export const LAB_UPSTREAM = `${PROXY_URL}/lab/mcp`;

/**
 * Build the client. In CI the identity comes from AGENT_ID / OWNER_ID /
 * AGENT_PRIVATE_KEY_B64. In a Codespace it comes from ~/.agentvalet/config.json,
 * which `npx @agentvalet/register install <token>` wrote at step 1 — the ids
 * are read from there so you never have to export anything.
 */
export function loadClient() {
  if (process.env.AGENT_ID || process.env.AGENTVALET_AGENT_ID) return AgentValet.fromEnv();
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(join(homedir(), ".agentvalet", "config.json"), "utf8"));
  } catch {
    fail("No agent identity found. Run step 1 first:\n  npx @agentvalet/register install <token from the dashboard>");
  }
  const privateKey = readFileSync(cfg.keyPath ?? join(homedir(), ".agentvalet", "agent.key"), "utf8");
  return new AgentValet({ agentId: cfg.agentId, ownerId: cfg.ownerId, privateKey, proxyUrl: cfg.proxyUrl ?? PROXY_URL });
}

/**
 * Find the lab upstream in this agent's grants. The platform id is minted by
 * AgentValet when the server is connected (mcp-<host-slug>-<8 chars>) and the
 * scope ids are `<platformId>:<toolName>`, so they cannot be hardcoded: read
 * them from list_platforms, which is also what a real agent must do.
 */
export async function findLabPlatform(av) {
  const res = await av.listPlatforms();
  const list = res?.data?.platforms ?? res?.platforms ?? [];
  const entry = list.find((p) => (p.scopes ?? []).some((s) => s.endsWith(":echo")) && (p.scopes ?? []).some((s) => s.endsWith(":whoami")));
  if (!entry) {
    fail(
      "The lab upstream is not granted to this agent yet. In the dashboard:\n" +
        `  Platforms → Add MCP server → ${LAB_UPSTREAM} → Test → Connect\n` +
        "  Agents → your lab agent → Grant → tick echo, whoami, write_note; mark write_note \"requires approval\".",
    );
  }
  const scope = (tool) => entry.scopes.find((s) => s.endsWith(`:${tool}`));
  return {
    platformId: entry.platformId,
    scopes: { echo: scope("echo"), whoami: scope("whoami"), write_note: scope("write_note") },
    approvalScopes: entry.approvalScopes ?? [],
    requireApproval: entry.requireApproval === true,
    raw: entry,
  };
}

/** Call one tool on the lab upstream. endpoint = /<tool>, method POST, data = args. */
export function callTool(av, lab, tool, args, reason) {
  return av.call({ platform: lab.platformId, endpoint: `/${tool}`, method: "POST", scope: lab.scopes[tool], data: args, reason });
}

/** The Free plan allows 5 governed calls a minute. Pace, don't hammer. */
export const pace = (ms = 2000) => new Promise((r) => setTimeout(r, ms));

export function auditIdOf(result) {
  return result?._meta?.audit_id ?? null;
}

export function printAudit(result) {
  const id = auditIdOf(result);
  const corr = result?._meta?.correlation_id;
  if (id) console.log(`   audit row ${id}  →  ${DASHBOARD_URL}/audit   (receipt: npm run receipt -- ${id})`);
  else if (corr) console.log(`   correlation ${corr}  →  ${DASHBOARD_URL}/audit`);
}

export function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}
