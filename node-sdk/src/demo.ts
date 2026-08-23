// Governed platform access from a plain Node agent.
//
// No harness, no framework, one dependency. Run it with `npm run demo` after
// `npx @agentvalet/register`.
//
// The four beats are separate exported functions so the smoke test can drive
// the three that don't need a human.

import { basename } from "node:path";
import { AgentValet, ApprovalTimeoutError, AccessDeniedError } from "@agentvalet/client";

/** Beat 2 — a governed read. This process never holds a GitHub token. */
export async function runReadBeat(av: AgentValet): Promise<unknown> {
  return av.call({
    platform: "github",
    endpoint: "/user/repos",
    method: "GET",
    scope: "github:repo.read",
    reason: "AgentValet examples: listing repositories to show a governed read",
  });
}

/**
 * Beat 4 — deny-by-default, dry-run.
 *
 * `evaluate()` asks the broker what it *would* decide, without performing the
 * action. Better than provoking a real denial: no failed call clutters your
 * audit log on your first day.
 */
export async function runDenyBeat(av: AgentValet): Promise<unknown> {
  return av.evaluate("stripe", "charge");
}

/**
 * The scopes on `platform` that require the owner's approval.
 *
 * Returns null when the platform is not granted to this agent at all — that is
 * a different situation from "granted but nothing is gated", and collapsing the
 * two is exactly how a silent no-op hides. Throws if the listing cannot be read.
 */
export async function approvalGatedScopes(
  av: AgentValet,
  platform: string,
): Promise<string[] | null> {
  type Entry = { platformId: string; requireApproval?: boolean; approvalScopes?: string[] };
  const res = (await av.listPlatforms()) as {
    data?: { platforms?: Entry[] };
    platforms?: Entry[];
  };

  // listPlatforms() resolves to the broker envelope — the listing is under
  // `data`, exactly like every other call. Reading `res.platforms` yields
  // undefined, which silently looks like "nothing is gated".
  const list = res.data?.platforms ?? res.platforms;
  if (!list) throw new Error("Could not read the platform listing from listPlatforms()");

  const entry = list.find((x) => x.platformId === platform);
  if (!entry) return null;
  return entry.requireApproval === true ? ["*"] : entry.approvalScopes ?? [];
}

/** Beat 3 — the approval moment. Blocks until the owner decides, or ~50s. */
export async function runApprovalBeat(av: AgentValet): Promise<void> {
  const scope = "github:repo.create";
  const gatedScopes = await approvalGatedScopes(av, "github");

  if (gatedScopes === null) {
    console.log();
    console.log("Beat 3 - SKIPPED. This agent has no GitHub grant at all,");
    console.log("so there is nothing to approve. Grant it GitHub first.");
    return;
  }

  if (!(gatedScopes.includes("*") || gatedScopes.includes(scope))) {
    // Worth saying out loud rather than silently succeeding: a reader who
    // expected a prompt would otherwise assume the feature is broken.
    console.log(`\nBeat 3 — SKIPPED. '${scope}' is granted without approval,`);
    console.log("so this call would just execute and you would see no prompt.");
    console.log("To see the approval beat: open the agent's GitHub grant in the");
    console.log(`dashboard, mark '${scope}' as requiring approval, and re-run.`);
    return;
  }

  console.log("\nBeat 3 — approval.");
  console.log("Open https://app.agentvalet.ai now — you have about 50 seconds.");
  console.log("Press Enter when you are ready to trigger the request...");
  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));

  const name = `agentvalet-demo-${Date.now()}`;
  try {
    const result = (await av.call({
      platform: "github",
      endpoint: "/user/repos",
      method: "POST",
      scope,
      data: { name, private: true },
      reason: "AgentValet examples: demonstrating the approval beat",
    })) as { data?: { full_name?: string } };
    console.log(`Approved and executed — created ${result.data?.full_name ?? name}.`);
    console.log("You can delete that repo; it exists only to prove the beat.");
  } catch (err) {
    if (err instanceof ApprovalTimeoutError) {
      console.log("\nNobody approved in time. This is NOT a failure.");
      console.log(`The action is still queued server-side as ${err.approvalId}.`);
      console.log("Do NOT re-run this — a second call queues a SECOND repo.");
      console.log(`Resume it whenever you like:  av.waitForApproval("${err.approvalId}")`);
      return;
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const av = AgentValet.fromEnv();

  console.log("Beat 2 — a governed read of /user/repos.\n");
  let repos: Array<{ full_name: string }> = [];
  try {
    const res = (await runReadBeat(av)) as { data: Array<{ full_name: string }> };
    repos = res.data;
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      console.error("Denied. Two things to check, in this order:");
      console.error("  1. Has the agent been GRANTED github:repo.read? Approving");
      console.error("     an agent grants it nothing — they are separate steps.");
      console.error("  2. Did you grant 'github:repo.read' and not plain 'repo'?");
      console.error("     The picker lists unenforced OAuth scopes first.");
      process.exit(1);
    }
    throw err;
  }

  console.log(`  ${repos.length} repositories:`);
  for (const r of repos.slice(0, 10)) console.log(`    ${r.full_name}`);
  console.log("\n  That call is now in your audit log, tagged github:repo.read.");
  console.log("  This process never held a GitHub token.");

  await runApprovalBeat(av);

  console.log("\nBeat 4 — deny-by-default. Asking about a scope you never granted:");
  console.log(" ", JSON.stringify(await runDenyBeat(av)));
  console.log("  Nothing was attempted. To ask for access, use:");
  console.log("    av.requestAccess({ platform, scope, reason })");

  process.exit(0);
}

// Only run the walkthrough when executed directly — importing this module
// (as the smoke test does) must not start prompting for input.
if (process.argv[1] && basename(process.argv[1]) === "demo.js") {
  await main();
}
