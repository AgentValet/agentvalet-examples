// CI runs this against the PUBLISHED @agentvalet/client, using a dedicated
// AgentValet org whose agent is granted exactly `github:repo.read`.
//
// Beat 3 (approval) is deliberately not covered: it needs a human by
// construction. What CI can assert is that the other three beats still work
// against the live proxy, so a broken example is caught before a reader hits it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentValet } from "@agentvalet/client";
import { runReadBeat, runDenyBeat, approvalGatedScopes } from "./demo.js";

test("beat 2 — a granted read returns the broker envelope", async () => {
  const av = AgentValet.fromEnv();
  const result = (await runReadBeat(av)) as { data?: unknown; _meta?: unknown };

  // The split is the thing readers get wrong first: `data` is the upstream
  // body byte-for-byte, `_meta` is everything the broker adds about the call.
  assert.ok(result.data !== undefined, "upstream body should be under .data");
  assert.ok(result._meta !== undefined, "call metadata should be under ._meta");
  assert.ok(Array.isArray(result.data), "GET /user/repos returns an array");
});

test("beat 4 — an ungranted scope is denied without being attempted", async () => {
  const av = AgentValet.fromEnv();
  const decision = (await runDenyBeat(av)) as { decision?: boolean; reason?: string };

  assert.equal(decision.decision, false, "an ungranted scope must not be allowed");
  assert.equal(decision.reason, "scope_not_granted");
});

test("the approval-gate lookup actually reads the platform listing", async () => {
  // Regression: listPlatforms() resolves to the broker envelope, so reading
  // `res.platforms` (instead of `res.data.platforms`) yields undefined — which
  // silently looks like "nothing is gated" and makes beat 3 a permanent no-op.
  // A null return means "platform not granted", which is a real answer; the
  // failure mode we are pinning is the lookup not working at all.
  const av = AgentValet.fromEnv();
  const gated = await approvalGatedScopes(av, "github");

  assert.notEqual(gated, null, "github should be granted to the CI agent");
  assert.ok(Array.isArray(gated), "a granted platform yields a scope array");
});
