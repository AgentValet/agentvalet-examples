# AgentValet examples

Your agent calls approved SaaS platforms — and never holds the credential.

AgentValet sits between your agent and the platform. It checks the call against
what the owner actually granted, injects the credential at call time, and writes
an audit record. The agent holds one identity key; it never sees a GitHub token,
a Slack token, or a Stripe key.

These are runnable examples. Pick the one that matches how you build, and you
should be looking at your own audit log inside ten minutes.

## Pick your surface

| Example | Use this if… |
|---|---|
| [`claude-code/`](./claude-code) | You use Claude Code, Cursor, or another MCP host. **No code at all** — drop in a config and your session is governed. |
| [`node-sdk/`](./node-sdk) | You want to see the API. A plain TypeScript script, no harness, one dependency. |
| [`python-langgraph/`](./python-langgraph) | You build in Python. Shows a governed call inside a LangGraph node — no LangGraph-specific package needed. |
| [`crewai/`](./crewai) | You run a crew. Each member gets **its own attenuated identity**, so a researcher literally cannot form a call it wasn't delegated. |

Every example tells the same four-beat story, so you can switch surfaces and
still recognise where you are.

## What happens, in four beats

**1 — Register.** `npx @agentvalet/register` generates an RSA keypair *on your
machine*. Only the public half is ever sent. You can check that claim the moment
you run it: the private key is written to `~/.agentvalet/`, and nothing uploads
it.

**2 — A governed read.** The example lists your GitHub repositories through the
proxy. Your agent never held a GitHub token — and the call is now on your audit
log, with the scope it used.

**3 — The approval moment.** The example attempts something that needs your
say-so. The call blocks, you approve in the dashboard, and the result comes back.
This is the beat no unbrokered SDK can do, and it's worth the two minutes.

**4 — Deny-by-default.** The example asks about a scope it was never granted.
Nothing is attempted; the decision comes back `scope_not_granted`. Access it
wasn't given is access it cannot use, even if the model decides to try.

## What you need

- A free AgentValet org — sign up at [app.agentvalet.ai](https://app.agentvalet.ai)
- A GitHub account to connect as the demo platform
- Node 18+ (for `claude-code/` and `node-sdk/`) or Python 3.10+ (for the others)

Nothing is charged. The free plan covers everything these examples do.

## Three things that trip people up

**Approving an agent doesn't grant it anything.** They're separate steps.
Deny-by-default means a freshly approved agent with no grants can do exactly
nothing — which is correct, and surprising the first time. Approve the agent,
*then* grant it a platform and scope.

**Grant the scope that starts with `github:`.** The scope picker shows two
different vocabularies in one list. The plain OAuth scopes (`repo`, `read:user`)
come first and are *unenforced* — the name doesn't restrict which endpoints the
agent may call. The governance scopes (`github:repo.read`, `github:contents.read`)
are appended after, and those are the ones tied to specific endpoints. Pick
`github:repo.read`. It's the one that makes your audit trail mean something.

**Beat 3 only prompts if you ask it to.** A granted scope executes immediately
unless the owner marks it as requiring approval. To see the approval beat, open
the agent's grant and flag the write scope as approval-required first —
otherwise the call simply succeeds and you'll wonder what you missed.

## Already have an AgentValet agent on this machine?

Your private key lives at `~/.agentvalet/agent.key` and **cannot be recovered or
rotated** if it's lost. Registering a second agent used to overwrite it silently;
CLI 1.4.0 and later refuse instead. Make sure you're on a current CLI, and keep
both identities apart:

```bash
npx @agentvalet/register@latest claim <bind_secret> --label examples
```

That stores the new agent under `~/.agentvalet/examples/` and leaves your
existing one alone.

## Licence

MIT. Use these as a starting point for your own agents.
