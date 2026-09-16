# Lab 01 — the governed loop

Register an agent, watch a governed call held for your approval, verify the signed receipt, then revoke the agent and see the next call refuse. About ten minutes. Nothing installed on your machine, no third-party OAuth, and nothing to deploy: the broker is `api.agentvalet.ai`, and the upstream is a mock MCP server it serves for exactly this lab.

**Honest about the one thing that needs a browser tab:** you sign up for a free AgentValet account at [app.agentvalet.ai](https://app.agentvalet.ai). The lab runs in *your own* free org. Nothing here shares an org with anyone else.

## 0. Open in a Codespace

Click the badge in [`labs/README.md`](../README.md). The container comes with Node 22, Python 3.12, the `agentvalet-register` CLI and this lab's dependencies already installed.

## 1. Register the agent (dashboard + one command)

Dashboard: **Agents → New agent** → name it `lab-01` → copy the install line. In the Codespace terminal:

```
npx @agentvalet/register install atok_…
```

An RSA keypair is generated inside the container. The private half never leaves it; only the public key is sent to AgentValet. The install token is single-use.

## 2. Connect the upstream and grant the tools (dashboard)

**Platforms → Add MCP server** → URL `https://api.agentvalet.ai/lab/mcp` → **Test** (auth: none, three tools previewed: `echo`, `whoami`, `write_note`) → **Connect**.

**Agents → lab-01 → Grant** → tick `echo`, `whoami`, `write_note` → mark **`write_note` requires approval**.

> The trap everyone hits once: approving an agent grants it nothing. A grant is a separate decision, per platform, per scope.

## 3. A governed read

```
npm run read
```

Lists the agent's grants (the scope ids are minted by AgentValet, so the script reads them rather than hardcoding them), calls `echo`, then `whoami`. Open **Audit** in the dashboard: two rows, `allowed`, for this agent. `whoami` answers `verified: false` — that is the honest state today: AgentValet decided the call, the upstream cannot tell who made it.

## 4. The approval moment

```
npm run write
```

`write_note("ship it")` pauses at the broker. Approve it from the dashboard, the push notification or Slack; the call then runs and the result prints here. If nobody approves within ~50 s the script prints the approval id and how to resume — never re-run the call, the action is still queued.

## 5. Deny by default

```
npm run deny
```

A dry run: the broker says what it *would* decide for `stripe:charge`, a scope this agent was never granted. No call is made, no failed row in your log.

## 6. Revoke

Dashboard: **Agents → lab-01 → Revoke**. Then:

```
npm run read
```

The same read now refuses with `agent_revoked` and a self-explaining halt envelope. The private key in this container is worthless from this moment; nothing had to be rotated anywhere else.

## 7. Verify the receipt

```
npm run receipt -- <audit id printed by step 3 or 4>
```

Fetches the signed receipt for that decision and verifies it in this container against AgentValet's published key set (`/.well-known/agentvalet-receipt-keys.json`) — no database involved. It prints which agent, which scope, which policy version and rule, who approved (for step 4), and the trace id. Proof of control, not a log line.

## Pacing

The Free plan allows 5 governed calls a minute. The scripts pause two seconds between calls; a `429` carries `Retry-After` and is not retried blindly.

## What this lab does not show (yet)

- A verified caller at the upstream (`whoami.verified: true`): needs the child-attestation header, in design.
- Metrics and traces: the audit page is the observability surface today.
- Claude Code, the Agent SDK, CrewAI and LangGraph: see the sibling examples in this repo.
