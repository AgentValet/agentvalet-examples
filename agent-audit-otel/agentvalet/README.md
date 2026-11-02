# The six fields with AgentValet (optional)

If your agents call SaaS APIs through AgentValet, the broker records each call on its side, because it holds the upstream credential and the agent doesn't. Nothing else in this kit needs AgentValet.

This page is not covered by the kit's self-test. It describes AgentValet's tool surface as of the date in `../verified-against.md`.

| Field | Where it comes from |
| --- | --- |
| **Agent** | Every call runs under the agent's own AgentValet identity |
| **User** | `use_platform` takes an optional `caller` for the person the call is for: a verified assertion from an identity provider your organisation trusts, or an asserted `{source, id}` |
| **Tool** | `use_platform` names the platform, endpoint, method and scope |
| **Decision** | `authzen_evaluate` returns the decision and its reason (`approved`, `denied`, `revoked`, `scope_not_granted`) |
| **Approver** | Gated calls wait for an owner's approval; pass a `reason`, which the approver sees |
| **Result** | The upstream response, or the error |

## Pass `caller` and `reason` on every call

```json
{
  "platform": "github",
  "endpoint": "/repos/acme/api/issues",
  "method": "POST",
  "scope": "<the scope list_platforms returned>",
  "caller": { "source": "okta", "id": "alice@example.com" },
  "reason": "Open the follow-up issue from ticket 1042"
}
```

## Run the five-minute test

- **The last 24 hours, from the agent's side:** `list_my_pending_actions` returns pending approvals and those completed in the last 24 hours, with status, `executed_at`, a result summary and any execution error.
- **Anything older:** in the AgentValet dashboard, open **Agents** > the agent > **Activity**. It covers 90 days.
- **The agent's own account of a call:** `report_self_diagnostic` takes a `correlation_id` that ties the report to the broker's audit row.

Score each call on `../scoring-sheet.csv` the same way as the open-source route.

AgentValet only sees calls that go through it. Calls an agent makes directly, such as Microsoft Graph calls with Entra tokens, still need the gateway log or the Entra queries in this kit.
