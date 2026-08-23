# CrewAI — every crew member holds its own attenuated identity

Most tool governance is a client-side allow-list: the filter lives in your code,
and an agent that isn't offered a tool can still be talked into calling
something adjacent.

Here the tool list comes from the **server**, already filtered by your grants
and your policy, and it's built from a **child identity that holds strictly
less than the crew's own agent**. A researcher cannot form a call it was never
delegated — not because the prompt discourages it, but because the credential it
holds cannot make it.

```bash
python -m venv .venv && ./.venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python demo.py
```

**Python 3.10–3.13.** CrewAI caps at `<3.14` on every release, so 3.14 can't
resolve `crewai>=1.0`. The `pyproject.toml` declares that ceiling rather than
letting you install and fail confusingly.

## What you'll see

```
The crew's own agent holds 9 GitHub scopes:
  github:contents.read … github:repo.create, github:repo.read, github:user.read

The researcher it delegates to holds 1:
  github:repo.read

Trying 'github:contents.read' as the child — a scope its parent DOES hold:
  Access denied … "reason":"scope_not_granted"
```

The governed part needs **no LLM key**. Only running the crew itself does; the
example says so and stops cleanly rather than emitting provider errors.

## Beat 5 — per-subagent identity

```python
av    = AgentValet.from_env()
child = av.issue_child(
    grants=[{"platform": "github", "scopes": ["github:repo.read"]}],
    name="researcher",
    ttl_seconds=900,
)

agent = Agent(role="Repository Researcher", ...,
              tools=governed_tools(child.client(), platforms=["github"]))
```

That's the whole integration. `governed_tools()` asks AgentValet what *this*
identity is granted and builds one tool per platform. Nothing else appears.

- A platform you haven't granted produces **no tool at all**.
- A scope your policy denies isn't in the tool's scope enum, so pydantic rejects
  it before a request is ever signed.
- And if the model hand-writes a call anyway, the broker refuses it. The schema
  is a convenience; **the broker is the boundary**.

The crew holds no platform credential at any point. It holds one identity key,
and AgentValet decrypts the real credential in memory at call time.

## Refusals come back as text, not exceptions

CrewAI treats a raised exception as task failure. A denial is not a failure —
it's information — so every refusal returns as a string the agent can reason
about:

| What happened | What the agent gets back |
| --- | --- |
| Policy denied it | `Denied by policy: … do not retry the same call` |
| Owner must approve, nobody answered in 50s | `Waiting on owner approval (approval id …). Do NOT issue this call again.` |
| Owner declined | `The owner declined this action. Do not retry it.` |
| Approved, but the SaaS 4xx'd | `Slack returned an error: …` |

The approval wording is deliberate: the action stays queued server-side and
still runs if the owner approves later, so a retry would queue a **second** copy.

## The caveats, stated plainly

Per-subagent identity is real here, and these bound it:

- **Delegation depth is capped at 1.** A child cannot mint children. The client
  raises `ConfigError` locally, before any network call.
- **This story holds where the orchestrator holds the child bearer** — CrewAI,
  LangGraph, the Agent SDK. Claude Code stdio Task-tool subagents share the
  parent's MCP server, so their attribution is the `session_id` marker, not a
  distinct identity.
- **Approval replay does not re-check mid-approval scope narrowing.** If a scope
  is narrowed while an action sits queued, the replay won't notice.
- **`evaluate()` is broken on bearer-mode clients** in `agentvalet` 0.2.0:
  `from_bearer` sets no `agent_id`, so the AuthZEN body carries an empty
  `subject.id` and the proxy returns 400 — despite the docstring saying it
  behaves identically. Use a real call to test a child's limits, as the smoke
  tests here do. It's the stronger proof anyway.

## What the tests pin

`pytest` asserts the things that make this example worth existing:

- the child holds **only** the delegated platform and scope
- the child **cannot** use a parent scope it wasn't delegated (a real call, denied)
- the child **can** still use what it was delegated
- the child **cannot** mint grandchildren
