# Recipe: AgentValet

If the agent calls SaaS through AgentValet, the upstream credential stays with the broker. The agent holds only its own signed identity. Revoking the agent in AgentValet should refuse every brokered call on the next request, and the drill tests whether that holds.

| Path | Check | What refuses it |
| --- | --- | --- |
| `av-call` | a governed read call through AgentValet | revoking the agent or its grant |
| `av-evaluate` | AgentValet's decision for the same scope | the same; the reason becomes `agent_suspended` |

## Setup

Use a test agent, not one you need tomorrow. Register one with `npx @agentvalet/register` and grant it one read scope. If this machine already has an AgentValet agent, keep its key safe: bind the test agent from the dashboard with `npx @agentvalet/register claim <bind_secret> --label drill`, which saves it under `~/.agentvalet/drill/`. Then:

```bash
(cd agentvalet && npm install)
export AGENTVALET_AGENT_ID=agt_... AGENTVALET_OWNER_ID=... AGENT_PRIVATE_KEY_PATH=<path to the test agent's agent.key>

./drill.sh \
  --check 'av-call=node agentvalet/av-check.mjs call <platform> <endpoint> <scope>' \
  --check 'av-evaluate=node agentvalet/av-check.mjs evaluate <platform> <scope>' \
  --revoke manual --label av-test-agent
```

Pick a GET endpoint that the scope allows, for example `cloudflare "/zones?per_page=1" cloudflare:zones.read`. On Git Bash for Windows, set `MSYS_NO_PATHCONV=1` first, or Git Bash rewrites endpoint paths as file paths.

## The lever

In the AgentValet dashboard, go to **Agents** > the agent > **Revoke**. Press Enter in the drill as you confirm it. Revoke suspends the agent, and an owner can reinstate it.

## What to expect

Each check starts Node and makes one round trip through AgentValet, which takes 2 to 3 seconds, so with both checks the drill resolves to about 4 seconds. For a finer figure, read the agent's entries in the AgentValet audit log: the last allowed call and the first refused one. In our own run they were 1.5 seconds apart, and every call after was refused.

AgentValet covers only the calls that go through it. If the agent also holds a key directly, that key is another path. Time it with the API key recipe.
