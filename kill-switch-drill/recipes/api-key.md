# Recipe: an API key

The simplest path, and often the slowest to die. A key usually has no expiry, so it works until someone deletes it.

**The check** calls something cheap with the key. Example with a GitHub token:

```bash
./drill.sh \
  --check 'github-key=curl -sf -o /dev/null -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user' \
  --revoke manual --label support-bot
```

```powershell
./drill.ps1 -Check 'github-key=Invoke-RestMethod https://api.github.com/user -Headers @{ Authorization = "Bearer $env:GITHUB_TOKEN" }' -Revoke manual -Label support-bot
```

**The lever** is deleting or rotating the key in the provider's settings. Do it when the drill prompts you, then press Enter.

**What to expect.** Most providers check the key on every call, so refusal should come fast. Two things slow it down: a cache in front of the provider, and copies of the key you forgot about. Search the agent's environment files, CI secrets and container images before the drill, and add a check for each copy you find.
