# Runbook: the kill-switch drill

Run it on a test agent first. Then run it once a quarter on a production agent, with its sponsor present.

## 1. List every path

Write down every way the agent reaches something:

- tokens it already holds (access tokens, refresh tokens, SVIDs)
- its ability to get new tokens (an OAuth client, a workload identity, a service principal)
- API keys, including copies in environment files, CI secrets and images
- MCP servers or gateways it calls

Each one becomes a `--check`.

## 2. Name the lever for each path

The lever is what you would do in an incident: disable the client, revoke the agent, delete the key, remove the server from the gateway. Write down the token lifetime next to each path. For any resource that validates tokens locally, that lifetime is your worst case.

## 3. Write the checks and test them

A check succeeds while access works and fails once it is refused. Run each one on its own first. The drill refuses to start if any check fails before you revoke, because a check that already fails tells you nothing.

Use read-only calls. The drill runs each check once a second, possibly for over an hour.

## 4. Run the drill

```bash
./drill.sh --check '...' --check '...' --revoke manual --label <agent>
```

Pull every lever when the drill prompts you, then press Enter. If your levers are scriptable, pass them as `--revoke 'COMMAND'` and the clock starts on the first. Leave it running until every path is refused or the timeout passes.

## 5. Record

The drill appends one row per path to `results.csv`. Add the levers you pulled and each path's token lifetime to your own notes.

## 6. Fix the longest path, then rerun

- Shorten the token lifetime.
- Move the resource to a check that asks the identity provider on each call (introspection or continuous access evaluation).
- Put the path behind something you can switch off at once, such as a gateway or broker.
- Remove the path.

## 7. Retire properly

A finished drill agent still holds an identity. Delete it and remove its permission grants. Stopping its process is not enough.
