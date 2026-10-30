// av-check.mjs: one check for the kill-switch drill, through AgentValet.
//
//   node av-check.mjs call     <platform> <endpoint> <scope>   exit 0 if the governed call succeeds
//   node av-check.mjs evaluate <platform> <scope>              exit 0 if AgentValet would allow it
//
// The agent identity comes from the environment, as AgentValet.fromEnv() reads it:
// AGENTVALET_AGENT_ID, AGENTVALET_OWNER_ID and AGENT_PRIVATE_KEY_PATH, or the files
// `npx @agentvalet/register` writes. Use a read-only scope: the drill calls it every second.
import { AgentValet } from "@agentvalet/client";

const [mode, platform, a, b] = process.argv.slice(2);
if (!["call", "evaluate"].includes(mode) || !platform || !a || (mode === "call" && !b)) {
  console.error("usage: node av-check.mjs call <platform> <endpoint> <scope>\n       node av-check.mjs evaluate <platform> <scope>");
  process.exit(2);
}

// approvalTimeoutMs 0: a scope that needs approval counts as refused, not as a 50 s wait.
const av = AgentValet.fromEnv({ approvalTimeoutMs: 0 });
try {
  if (mode === "call") {
    await av.call({ platform, endpoint: a, method: "GET", scope: b });
    process.exit(0);
  }
  const r = await av.evaluate(platform, a);
  if (r?.decision === true) process.exit(0);
  console.error(`refused: ${r?.reason ?? "denied"}`);
  process.exit(1);
} catch (err) {
  console.error(`refused: ${err?.name ?? "Error"}: ${err?.message ?? err}`);
  process.exit(1);
}
