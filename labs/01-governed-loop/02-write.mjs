// Step 4 — the approval moment. write_note is the tool you marked "requires
// approval". The call pauses at the broker; you approve it from the dashboard,
// a push notification or Slack; the call then runs and returns here.
//
//   node 02-write.mjs                 make the call, wait up to ~50 s
//   node 02-write.mjs --resume apr_…  resume waiting on a call that timed out
//
// Never re-run the call after a timeout: the action is still queued and
// re-running would queue a second approval for the same note.
import { ApprovalTimeoutError, ApprovalDeniedError } from "@agentvalet/client";
import { loadClient, findLabPlatform, callTool, printAudit, DASHBOARD_URL } from "./lib.mjs";

const av = loadClient();
const resumeIdx = process.argv.indexOf("--resume");
const resumeId = resumeIdx > -1 ? process.argv[resumeIdx + 1] : null;

try {
  let result;
  if (resumeId) {
    console.log(`resuming approval ${resumeId} …`);
    result = await av.waitForApproval(resumeId);
  } else {
    const lab = await findLabPlatform(av);
    const gated = lab.requireApproval || lab.approvalScopes.includes(lab.scopes.write_note);
    if (!gated) {
      console.log("write_note is granted WITHOUT approval, so this call would just run and you would see no prompt.");
      console.log(`Open ${DASHBOARD_URL}/agents → your lab agent → the lab grant → mark write_note as requiring approval, then re-run.`);
      process.exit(0);
    }
    console.log("write_note(\"ship it\")  → waiting for the owner to approve (up to ~50 s) …");
    result = await callTool(av, lab, "write_note", { text: "ship it" }, "Lab 01 step 4: the approval moment");
  }
  console.log("→ approved and executed:", JSON.stringify(result?.data ?? result));
  printAudit(result);
} catch (err) {
  if (err instanceof ApprovalTimeoutError) {
    console.log(`\nNobody approved in time. The call is still queued as ${err.approvalId}.`);
    console.log(`Approve it in ${DASHBOARD_URL}, then:  node 02-write.mjs --resume ${err.approvalId}`);
    process.exit(0);
  }
  if (err instanceof ApprovalDeniedError) {
    console.log(`\nThe owner denied it (${err.approvalId}). That is the loop working too: a denial is a decision, and it is in your audit log.`);
    process.exit(0);
  }
  throw err;
}
