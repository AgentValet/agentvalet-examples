# Recipe: AgentValet

If the agent calls SaaS through AgentValet, the upstream credential stays with the broker. The agent holds only its own signed identity. Revoking the agent in AgentValet should refuse every brokered call on the next request, and the drill tests whether that holds.

| Path | Check | What refuses it |
| --- | --- | --- |
| `av-call` | a governed read call through AgentValet | revoking the agent or its grant |
| `av-evaluate` | AgentValet's decision for the same scope | the same; the reason becomes `revoked` |

## Setup

Use a test agent, not one you need tomorrow, because a revoked agent stays revoked. Register one with `npx @agentvalet/register --label drill` and grant it one read scope. Then:

```bash
(cd agentvalet && npm install)
export AGENTVALET_AGENT_ID=agt_... AGENTVALET_OWNER_ID=... AGENT_PRIVATE_KEY_PATH=~/.agentvalet/drill/agent.key

./drill.sh \
  --check 'av-call=node agentvalet/av-check.mjs call <platform> <endpoint> <scope>' \
  --check 'av-evaluate=node agentvalet/av-check.mjs evaluate <platform> <scope>' \
  --revoke manual --label av-test-agent
```

Pick a GET endpoint that the scope allows, for example `cloudflare "/zones?per_page=1" cloudflare:zones.read`. On Git Bash for Windows, set `MSYS_NO_PATHCONV=1` first, or Git Bash rewrites endpoint paths as file paths.

## The lever

In the AgentValet dashboard, go to **Agents** > the agent > **Revoke**. Press Enter in the drill as you confirm it.

## What to expect

Each check starts Node and makes one network round trip, so a poll takes about a second. The result is accurate to roughly the poll interval plus that second.

AgentValet covers only the calls that go through it. If the agent also holds a key directly, that key is another path. Time it with the API key recipe.
