// Step 7 — the signed receipt. Every decision the broker made about your
// calls (allowed, held, denied) was written with a compact JWS signed at that
// moment. Fetch it with the agent's own identity, then verify it against the
// published key set only — no AgentValet database involved.
//
//   node 04-receipt.mjs <audit_id>      (printed by 01-read / 02-write)
import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader } from "jose";
import { loadClient, PROXY_URL, fail } from "./lib.mjs";

const auditId = process.argv[2];
if (!auditId) fail("usage: node 04-receipt.mjs <audit_id>");

const av = loadClient();
// signJWT() is the SDK's own 60-second RS256 assertion — the same thing it
// sends on every call. No signing code lives in this lab.
const res = await fetch(`${PROXY_URL}/v1/audit/${encodeURIComponent(auditId)}/receipt`, {
  headers: { authorization: `Bearer ${await av.signJWT()}`, accept: "application/json" },
});
if (!res.ok) fail(`receipt fetch failed: HTTP ${res.status} ${await res.text()}`);
const body = await res.json();

console.log(`receipt for ${body.audit_id} (kid ${body.kid})`);
console.log(`verifying against ${body.jwks_url} …`);
const JWKS = createRemoteJWKSet(new URL(body.jwks_url));
const { payload, protectedHeader } = await jwtVerify(body.receipt, JWKS, {
  issuer: PROXY_URL,
  typ: "agentvalet-receipt+jwt",
  algorithms: ["ES256"],
});
const av_ = payload.av;
console.log("\n✓ VERIFIED", JSON.stringify(protectedHeader));
console.log(`  agent        ${payload.sub}`);
console.log(`  decided at   ${new Date(payload.iat * 1000).toISOString()}`);
console.log(`  platform     ${av_.platform}  scope ${av_.scope}  ${av_.method ?? ""} ${av_.endpoint ?? ""}`);
console.log(`  result       ${av_.result}${av_.decision?.reason ? `  (${av_.decision.reason})` : ""}`);
console.log(`  policy       ${av_.decision?.policy_id ?? "-"} v${av_.decision?.policy_version ?? "-"}  matched rules: ${av_.decision?.matched?.length ?? 0}`);
if (av_.approval) console.log(`  approved by  ${av_.approval.approver_id} via ${av_.approval.decided_via}`);
console.log(`  trace        ${av_.trace_id}`);
console.log(`  did          ${body.did}`);
console.log("\nThis is proof of control: what AgentValet decided, signed when it decided it, checkable by anyone holding the receipt.");
