# kill-switch-drill

**[Full guide on AgentValet.ai](https://agentvalet.ai/blog/your-agents-have-no-off-switch)**

You switched off your AI agent. How long did it keep working?

This drill measures it. You describe each way the agent reaches something (a token, a key, a gateway) as a check command. The drill confirms every check works, waits for you to revoke the agent, then polls each check until it is refused. The slowest path is your **time-to-revocation**.

It works with any identity stack, because the checks are yours. It needs bash or PowerShell and nothing else. You don't need AgentValet.

## Quick start

```bash
./drill.sh \
  --check 'existing-token=curl -sf -o /dev/null -H "Authorization: Bearer $TOKEN" https://api.example.com/me' \
  --check 'new-token=./get-token.sh' \
  --revoke manual --label support-bot
```

```powershell
./drill.ps1 `
  -Check 'existing-token=Invoke-RestMethod https://api.example.com/me -Headers @{ Authorization = "Bearer $env:TOKEN" }',
         'new-token=./get-token.ps1' `
  -Revoke manual -Label support-bot
```

```text
Checking 2 path(s) before revoking...
  ok      existing-token
  ok      new-token
Revoke the agent's access now, then press Enter to start the clock...
  lever   manual (clock started)
Polling every 1s (timeout 7200s)...
  refused new-token after 1.2 s
  refused existing-token after 4415.0 s

time-to-revocation: 4415.0 s (slowest path: existing-token)
```

That output is illustrative. Your numbers are the point.

A check passes when the command exits 0 (bash), or runs without an error (PowerShell). `curl -sf` and `Invoke-RestMethod` both fail on an HTTP error, so a refused call fails the check.

## Recipes

| Stack | Recipe |
| --- | --- |
| An API key | [recipes/api-key.md](recipes/api-key.md) |
| An OAuth client: Keycloak, Okta, Auth0 and others | [recipes/oauth.md](recipes/oauth.md) |
| Microsoft Entra agent identity | [recipes/entra.md](recipes/entra.md) |
| AgentValet | [recipes/agentvalet.md](recipes/agentvalet.md) |

[RUNBOOK.md](RUNBOOK.md) covers the drill end to end: list the paths, name the levers, run, record, fix.

## Options

| bash | PowerShell | Default | |
| --- | --- | --- | --- |
| `--check NAME=COMMAND` | `-Check 'NAME=COMMAND',...` | required | A path to time. Repeat for each path. |
| `--revoke COMMAND` | `-Revoke 'COMMAND',...` | required | A lever, in order. `manual` waits for you; the clock starts on Enter. |
| `--interval` | `-Interval` | 1 | Seconds between polls |
| `--timeout` | `-Timeout` | 7200 | Give up after this many seconds |
| `--confirm` | `-Confirm` | 2 | Consecutive failures that count as refused |
| `--check-timeout` | | 10 | Kill a check that hangs (needs `timeout`) |
| `--label` | `-Label` | agent | Names the run in the results file |
| `--out` | `-Out` | results.csv | Results file, one row per path |

Exit codes: 0 every path refused, 1 a path still worked at the timeout, 2 bad arguments or a check that failed before you revoked anything.

**Precision.** A path's time is stamped when the first failing check starts. It is accurate to about the interval plus the time one round of checks takes.

## Results

`results.csv`: `run_date, label, path, seconds_to_first_refusal, status`. Strip tenant IDs, client IDs and secrets before you share a result.

## Test the drill itself

`selftest/` starts a local mock identity provider and resource (Python 3, standard library) and runs the drill against it. A gateway, a new token and an introspected token are refused at once. A token validated locally keeps working until it expires.

```bash
selftest/run.sh
```

```powershell
selftest/run.ps1
```

## Licence

MIT. See [LICENSE](../LICENSE).
