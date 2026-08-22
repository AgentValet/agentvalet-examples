// CI runs this against the PUBLISHED @agentvalet/client, using a dedicated
// AgentValet org whose agent is granted exactly `github:repo.read`.
//
// Beat 3 (approval) is deliberately not covered: it needs a human by
// construction. What CI can assert is that the other three beats still work
// against the live proxy, so a broken example is caught before a reader hits it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentValet } from "@agentvalet/client";
import { runReadBeat, runDenyBeat } from "./demo.js";

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
