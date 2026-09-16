// CI runs this against the PUBLISHED @agentvalet/client with a dedicated lab
// agent (LAB_AGENT_ID / LAB_OWNER_ID / LAB_AGENT_PRIVATE_KEY_B64) granted the
// three lab tools. Step 4 (approval) needs a human and is not asserted;
// steps 3, 5 and 7 are, so a broken lab is caught before a learner hits it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { loadClient, findLabPlatform, callTool, auditIdOf, PROXY_URL, pace } from "./lib.mjs";

const av = loadClient();
const lab = await findLabPlatform(av);
let readAuditId = null;

test("step 3 — echo is a governed read that returns the broker envelope and an audit id", async () => {
  const r = await callTool(av, lab, "echo", { text: "ci" }, "lab smoke");
  assert.equal(r.data?.text, "ci");
  assert.ok(r._meta, "call metadata under _meta");
  readAuditId = auditIdOf(r);
  assert.match(readAuditId ?? "", /^[0-9a-f-]{36}$/);
});

test("step 3 — whoami honestly reports verified:false", async () => {
  await pace();
  const r = await callTool(av, lab, "whoami", {}, "lab smoke");
  assert.equal(r.data?.verified, false);
  assert.ok(Array.isArray(r.data?.seen_headers));
});

test("step 5 — an ungranted scope is denied without being attempted", async () => {
  const d = await av.evaluate("stripe", "charge");
  assert.equal(d.decision, false);
  assert.ok(["scope_not_granted", "no_permission_record", "denied"].includes(d.reason), `reason was ${d.reason}`);
});

test("step 7 — the read's receipt verifies offline against the published key set", async () => {
  assert.ok(readAuditId, "needs the audit id from step 3");
  const res = await fetch(`${PROXY_URL}/v1/audit/${readAuditId}/receipt`, { headers: { authorization: `Bearer ${await av.signJWT()}` } });
  assert.equal(res.status, 200, await res.text());
  const body = await res.json();
  const { payload } = await jwtVerify(body.receipt, createRemoteJWKSet(new URL(body.jwks_url)), { issuer: PROXY_URL, typ: "agentvalet-receipt+jwt", algorithms: ["ES256"] });
  assert.equal(payload.jti, readAuditId);
  assert.equal(payload.av.result, "allowed");
  assert.equal(payload.av.platform, lab.platformId);
});
