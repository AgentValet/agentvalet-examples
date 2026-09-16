// Step 3 — a governed read. This process holds no credential for the upstream
// (there is none to hold: the lab server needs no auth), and yet every call
// is signed by the agent, checked against its grant and your policy, and
// written to your audit log before the upstream sees it.
import { AccessDeniedError } from "@agentvalet/client";
import { loadClient, findLabPlatform, callTool, pace, printAudit, DASHBOARD_URL } from "./lib.mjs";

const av = loadClient();
const lab = await findLabPlatform(av);
console.log(`lab upstream: ${lab.platformId}`);
console.log(`scopes:       ${Object.values(lab.scopes).filter(Boolean).join(", ")}`);

try {
  console.log("\necho(\"hello from a Codespace\")");
  const echoed = await callTool(av, lab, "echo", { text: "hello from a Codespace" }, "Lab 01 step 3: a governed read");
  console.log("→", JSON.stringify(echoed.data ?? echoed));
  printAudit(echoed);

  await pace();
  console.log("\nwhoami()");
  const who = await callTool(av, lab, "whoami", {}, "Lab 01 step 3: what does the upstream know about the caller?");
  console.log("→", JSON.stringify(who.data ?? who));
  printAudit(who);
  console.log("\nverified:false is the honest answer today: AgentValet decided the call, the upstream cannot tell who made it.");
  console.log(`Open ${DASHBOARD_URL}/audit — two rows, result=allowed, for this agent.`);
} catch (err) {
  if (err instanceof AccessDeniedError) {
    // Step 6 lands here: after you revoke the agent, the same read refuses
    // with a self-explaining halt envelope instead of a bare 403.
    console.log("\n→ 403 refused by AgentValet");
    console.log(err.message);
    console.log("\nIf you just revoked the agent: this is step 6 working. The private key in this container is now worthless.");
    process.exit(0);
  }
  throw err;
}
