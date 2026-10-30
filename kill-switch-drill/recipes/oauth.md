# Recipe: an OAuth client (client credentials)

Any OAuth 2.0 identity provider: Keycloak, Okta, Auth0, Ping, Cognito, Authentik and others. Time two or three paths, because an OAuth client usually has more than one lever.

| Path | Check | What refuses it |
| --- | --- | --- |
| `new-token` | ask the token endpoint for a fresh token | disabling the client, or deleting its secret |
| `existing-token` | call the resource with the token issued before the drill | revoking the token, but only if the resource asks the provider; otherwise the token's expiry |
| `introspection` (optional) | ask the provider whether the token is still active ([RFC 7662](https://www.rfc-editor.org/rfc/rfc7662)) | revoking the token or disabling the client |

The gap between `existing-token` and `introspection` is the point of the drill. A resource that validates the JWT signature locally never asks the provider, so it keeps accepting the token until `exp`.

## Example

Set `TOKEN_URL`, `CLIENT_ID`, `CLIENT_SECRET` and `API` (a URL your agent calls with the token). Get a token before the drill:

```bash
export TOKEN=$(curl -sf -X POST "$TOKEN_URL" -d grant_type=client_credentials \
  -d client_id="$CLIENT_ID" -d client_secret="$CLIENT_SECRET" | jq -r .access_token)

./drill.sh \
  --check 'new-token=curl -sf -o /dev/null -X POST "$TOKEN_URL" -d grant_type=client_credentials -d client_id="$CLIENT_ID" -d client_secret="$CLIENT_SECRET"' \
  --check 'existing-token=curl -sf -o /dev/null -H "Authorization: Bearer $TOKEN" "$API"' \
  --revoke manual --label support-bot
```

## Levers

- **Disable the client** in the provider's admin console or API. Stops new tokens.
- **Revoke the token** at the provider's [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009) revocation endpoint, if it has one. Reaches only resources that introspect.
- **Shorten the access token lifetime** before the drill if you want to see the tail shrink. The lifetime is your worst case for any resource that validates locally.

To pull levers from the script instead of by hand, pass each as `--revoke 'COMMAND'`. The clock starts at the first one.

## Keycloak specifics

From the [Keycloak server administration guide](https://www.keycloak.org/docs/latest/server_admin/index.html): signing out sessions "does not revoke outstanding access tokens. Outstanding tokens must expire naturally." The not-before push reaches only clients that use the Keycloak adapter, and offline tokens outlive logout, so revoke them explicitly. The token lifetime is the realm's **Access Token Lifespan**.

```bash
# token endpoint:      $KC/realms/<realm>/protocol/openid-connect/token
# revocation endpoint: $KC/realms/<realm>/protocol/openid-connect/revoke
# disable the client:
curl -sf -X PUT "$KC/admin/realms/<realm>/clients/$CLIENT_UUID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"enabled": false}'
```

## Workload identity (SPIFFE/SPIRE)

The same shape applies. `new-token` fetches a fresh SVID; `existing-token` presents one minted before the drill. The [SPIRE server docs](https://spiffe.io/docs/latest/deploying/spire_server/) describe no per-SVID revocation and default to a 1 hour X.509 SVID and a 5 minute JWT-SVID, so the TTL is the lever.
