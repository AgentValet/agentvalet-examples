# Node SDK — governed platform access, no harness

A plain TypeScript script. No agent framework, no MCP host, one dependency.
This is the example to read if you want to see what the API actually looks like.

```bash
npm install
npm run demo
```

## 1 — Register

```bash
npx @agentvalet/register
```

This generates an RSA keypair **on your machine** and sends only the public
half. You can verify that as it happens: the private key lands in
`~/.agentvalet/agent.key` and nothing uploads it. That key is what the SDK signs
a 60-second identity assertion with on every call.

Then, in the dashboard: **approve the agent**, and **grant it GitHub with the
`github:repo.read` scope**. Those really are two separate steps — see
[the traps](../README.md#three-things-that-trip-people-up) if the read comes
back denied.

Point the SDK at that identity:

```bash
export AGENT_ID=agt_...          # printed by register
export OWNER_ID=...              # printed by register
# the key is found at ~/.agentvalet/agent.key automatically
```

## 2 — A governed read

```typescript
const av = AgentValet.fromEnv();

const result = await av.call({
  platform: "github",
  endpoint: "/user/repos",
  method: "GET",
  scope: "github:repo.read",
});
```

**`result.data`, not `result`.** This is the one thing people get wrong in the
first five minutes. You get back the broker's envelope:

```jsonc
{
  "data":  [ /* exactly what GitHub returned, byte for byte */ ],
  "_meta": { /* what the broker did: capability, timestamp, connection used */ }
}
```

The split is deliberate. `data` is untouched upstream payload, so anything the
broker wants to tell you about the call stays outside it and can never collide
with a field the platform owns.

The call is now in your audit log, tagged with the scope it used. Your process
never held a GitHub token — the credential was decrypted in the proxy's memory
at call time and never travelled to you.

## 3 — The approval moment

```typescript
await av.call({
  platform: "github", endpoint: "/user/repos", method: "POST",
  scope: "github:repo.create",
  data: { name: "demo", private: true },
  reason: "Shown to whoever approves this",   // always set one
});
```

When the owner has marked a scope as requiring approval, `call()` simply takes
longer: it blocks, the owner decides, and the result comes back. From your code's
point of view an approved call is a slow call.

**It only prompts if you asked it to.** A granted scope executes immediately
unless the owner marks it approval-required. This example checks first and tells
you when the beat would be a no-op, rather than succeeding and leaving you
wondering what you missed.

**A timeout is not a failure.** After ~50 seconds you get an
`ApprovalTimeoutError`, but the action stays queued server-side and still runs
if the owner approves later:

```typescript
catch (err) {
  if (err instanceof ApprovalTimeoutError) {
    await saveForLater(err.approvalId);        // resume with av.waitForApproval()
  }
}
```

**Do not retry it.** A second `call()` queues a *second* action. For a repo
that means two repos; for an outbound message it means sending twice.

## 4 — Deny-by-default

```typescript
await av.evaluate("stripe", "charge");
// → { decision: false, reason: "scope_not_granted" }
```

`evaluate()` dry-runs the authorization decision without performing the action —
so you can check before doing something destructive, and so your first day
doesn't fill the audit log with deliberate failures.

Access the owner didn't grant is access the agent cannot use, no matter what the
model decides to try. To ask for more:

```typescript
await av.requestAccess({ platform: "slack", scope: "chat:write", reason: "..." });
```

## Errors you can branch on

Every throw is typed, so you never string-match an error envelope:

| Error | Means | Do |
|---|---|---|
| `ConfigError` | Bad or missing identity | Fix config — thrown before any network call |
| `AccessDeniedError` | No grant, or policy blocked it | `requestAccess()` |
| `ApprovalDeniedError` | The owner said no | Terminal. Don't retry |
| `ApprovalTimeoutError` | You stopped waiting | `waitForApproval(approvalId)` |
| `UpstreamError` | The SaaS itself returned non-2xx | `.status` / `.data` hold the reply |

## Per-subagent identities

Not here — the Node client can't mint child identities. If you want each
subagent to hold its own attenuated identity, so it cannot form a call it was
never delegated, see [`../crewai`](../crewai).
