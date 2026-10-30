# Recipe: Microsoft Entra agent identity

Two paths to time, plus a second run if you want to answer the Continuous Access Evaluation question.

| Path | Check | What refuses it |
| --- | --- | --- |
| `new-token` | request a fresh token the way your agent does | disabling the agent identity, disabling its blueprint, or a Conditional Access block |
| `existing-token` | call Microsoft Graph with the token issued before the drill | its expiry, unless CAE cuts it |

Entra's default access token lifetime is a random 60 to 90 minutes ([configurable token lifetimes](https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes)), so keep the default `-Timeout` of 7200 seconds.

## Example

For the `new-token` check, use whatever your agent uses to get its token, such as its own token helper. Get a token before the drill and use it for `existing-token`:

```powershell
$env:TOKEN = '<the token your agent uses for Graph>'
./drill.ps1 `
  -Check 'new-token=./get-agent-token.ps1',
         'existing-token=Invoke-RestMethod "https://graph.microsoft.com/v1.0/<a resource the agent can read>" -Headers @{ Authorization = "Bearer $env:TOKEN" }' `
  -Revoke manual -Label support-bot
```

## Levers

- **Disable the agent identity** from the agent identity list in the Entra admin center, or through Graph beta:

  ```powershell
  Connect-MgGraph -Scopes "AgentIdentity.EnableDisable.All"
  Invoke-MgGraphRequest -Method PATCH `
    -Uri "https://graph.microsoft.com/beta/servicePrincipals/$AgentId/microsoft.graph.agentIdentity" `
    -Body '{"accountEnabled": false}' -ContentType "application/json"
  ```

  The example on the [update page](https://learn.microsoft.com/en-us/graph/api/agentidentity-update?view=graph-rest-beta) changes only `displayName`, so confirm you get a 204 in your tenant before relying on this call. To start the clock on it, pass it as `-Revoke '<command>'`.
- **Disable the blueprint.** This blocks every identity under it.
- **Conditional Access Block** for the agent identity. Entra evaluates it when it issues or refreshes a token, so it stops `new-token` only.

## The CAE run

[CAE for workload identities](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-continuous-access-evaluation-workload) is documented for single-tenant service principals calling Microsoft Graph, when the client declares the `cp1` capability. The page doesn't say whether agent identities are covered. Run the drill twice, once with a token requested with `cp1` and once without, and compare `existing-token`.
