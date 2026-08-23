# Claude Code / MCP — governed access, no code at all

Drop two files into a project and your Claude Code session can reach approved
platforms without ever holding a credential. You write nothing.

This is the shortest path in the repo. There's no SDK, no build step, and no
script — the four beats happen in conversation.

## 1 — Register

```bash
npx @agentvalet/register
```

An RSA keypair is generated **on your machine**; only the public half is sent.
The private key lands in `~/.agentvalet/agent.key` and nothing uploads it.

Copy this directory's `.mcp.json` and `CLAUDE.md` into your project, then paste
the `AGENT_ID`, `OWNER_ID` and key path that `register` printed into
`.mcp.json`. Restart Claude Code so it picks up the server.

Then in the dashboard: **approve the agent**, and **grant it GitHub with the
`github:repo.read` scope**. Those are two separate steps — see
[the traps](../README.md#three-things-that-trip-people-up) if a read is denied.

### Why `@latest` and not a pinned version

`.mcp.json` runs `npx -y @agentvalet/register@latest mcp-server`, and the
`@latest` is deliberate. An unversioned `@agentvalet/register` lets npx silently
reuse a **stale global install**, which shadows the current build and quietly
drops newer tool parameters. If the server behaves oddly, check for a global
install first — that's the usual cause.

## 2, 3, 4 — the beats, in conversation

No code. Type these at Claude Code:

**A governed read**
> List my GitHub repositories.

It calls `list_platforms`, sees GitHub is granted, and reads through the proxy.
The call lands in your audit log tagged `github:repo.read`. Your machine never
held a GitHub token.

**The approval moment**
> Create a private GitHub repo called `agentvalet-demo`.

If the owner has marked the write scope approval-required, the call blocks until
you approve in the dashboard, then completes.

**It only prompts if you asked it to.** A granted scope executes immediately
unless the owner marks it approval-required. To see this beat, open the agent's
GitHub grant and flag `github:repo.create` as requiring approval first —
otherwise the repo is simply created and you'll wonder what you missed.

**Deny-by-default**
> Charge $10 to a card with Stripe.

Stripe was never granted, so nothing is attempted. You get told it isn't
covered, not a failed API call. Access the owner didn't grant is access the
agent cannot use — regardless of what the model decides to try.

## What `CLAUDE.md` is doing

It's the routing rule. Without it, an agent that finds a `GITHUB_TOKEN` in your
environment will cheerfully use it and bypass governance entirely. The file says:
check AgentValet first, use it when the platform is covered, and stop rather
than falling back to raw keys.

That's the difference between *having* a broker and *using* one.

## Subagents: read this before you rely on it

Claude Code's Task-tool subagents **share the parent's MCP server**. They do not
get their own identity, and their calls are attributed to the parent agent with a
`session_id` marker distinguishing the run — not the subagent.

So on this surface you get governed access and a per-run marker, **not**
per-subagent identity. If you need each subagent to hold its own attenuated
credential — so it cannot form a call it was never delegated — that's
[`../crewai`](../crewai), where the orchestrator holds each child's bearer token.

## Already have an AgentValet agent on this machine?

Your key at `~/.agentvalet/agent.key` cannot be recovered or rotated if it's
lost. CLI 1.4.0 and later refuse to overwrite a different agent's key; older
versions did it silently. Check you're current, and keep identities apart:

```bash
npx @agentvalet/register@latest claim <bind_secret> --label examples
```
