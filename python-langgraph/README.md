# Python + LangGraph — a governed call inside a graph node

**There is no LangGraph-specific AgentValet package, and none is needed.**
That is the point this example exists to make. A brokered call is an ordinary
function call inside an ordinary node.

```bash
python -m venv .venv && ./.venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python demo.py
```

Python 3.10+ (LangGraph's floor; the `agentvalet` client itself supports 3.9).

## 1 — Register

```bash
npx @agentvalet/register
```

Generates an RSA keypair **on your machine** and sends only the public half.
The private key lands in `~/.agentvalet/agent.key` and nothing uploads it.

Then in the dashboard: **approve the agent**, and **grant it GitHub with the
`github:repo.read` scope**. Those are two separate steps — see
[the traps](../README.md#three-things-that-trip-people-up) if your read comes
back denied.

```bash
export AGENT_ID=agt_...          # printed by register
export OWNER_ID=...              # printed by register
# the key is found at ~/.agentvalet/agent.key automatically
```

## 2 — A governed read, from a node

```python
def fetch_repos(state: State) -> State:
    av = AgentValet.from_env()
    result = av.call(
        platform="github",
        endpoint="/user/repos",
        scope="github:repo.read",
        method="GET",
    )
    return {"repos": result["data"]}
```

Wire that node into a graph like any other. Nothing about LangGraph needs to
know AgentValet exists.

**`result["data"]`, not `result`.** You get the broker's envelope:

```python
{
  "data":  [...],   # exactly what GitHub returned, byte for byte
  "_meta": {...},   # what the broker did: capability, timestamp, connection
}
```

`data` is untouched upstream payload, so anything the broker adds about the call
stays outside it and can never collide with a field the platform owns.

The call is now in your audit log, tagged with the scope it used. Your process
never held a GitHub token.

## 3 — The approval moment

```python
av.call(
    platform="github", endpoint="/user/repos", scope="github:repo.create",
    method="POST", data={"name": "demo", "private": True},
    reason="Shown to whoever approves this",   # always set one
)
```

When the owner has marked a scope as approval-required, `call()` simply takes
longer: it blocks, the owner decides, the result comes back.

**It only prompts if you asked it to.** A granted scope executes immediately
unless the owner marks it approval-required. This example checks first and tells
you when the beat would be a no-op, rather than succeeding and leaving you
wondering what you missed.

**A timeout is not a failure.** After ~50 seconds you get an
`ApprovalTimeoutError`, but the action stays queued and still runs if the owner
approves later:

```python
except ApprovalTimeoutError as err:
    save_for_later(err.approval_id)      # resume with av.wait_for_approval(...)
```

**Do not retry it.** A second `call()` queues a *second* action.

## 4 — Deny-by-default

```python
av.evaluate("stripe", "charge")
# → {'decision': False, 'reason': 'scope_not_granted'}
```

`evaluate()` dry-runs the authorization decision without performing the action,
so you can check before anything destructive and your first day doesn't fill the
audit log with deliberate failures.

To ask for access you don't have:

```python
av.request_access(platform="slack", scope="chat:write", reason="...")
```

## Errors you can branch on

| Error | Means | Do |
|---|---|---|
| `ConfigError` | Bad or missing identity | Fix config — raised before any network call |
| `AccessDeniedError` | No grant, or policy blocked it | `request_access()` |
| `ApprovalDeniedError` | The owner said no | Terminal. Don't retry |
| `ApprovalTimeoutError` | You stopped waiting | `wait_for_approval(approval_id)` |
| `UpstreamError` | The SaaS itself returned non-2xx | `.status` / `.data` hold the reply |

## Want per-subagent identities?

The Python client can mint them — `av.issue_child(...)` returns a time-boxed,
scope-attenuated bearer identity for a subagent. See [`../crewai`](../crewai)
for a worked example where each crew member holds its own.
