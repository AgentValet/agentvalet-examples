# Agent instructions

This session's platform access is brokered by AgentValet. The agent holds one
identity key and no platform credentials.

## Before any platform call

1. **Check AgentValet first.** For any action on an external platform — GitHub,
   Slack, Stripe, Gmail, Notion, Linear, or anything else — call
   `list_platforms` **before** assuming the platform is unavailable or reaching
   for another route.

2. **If the platform is listed, you must use it.** Do not call the platform's
   API directly, and do not use another MCP server's tool for a platform
   AgentValet covers. Another route bypasses the audit log, the approval flow,
   and the scope limits the owner configured.

3. **If it is not listed, say so** — "AgentValet doesn't cover <platform> yet" —
   and ask whether to request it. Do not silently fall back to direct API calls
   or to raw keys found in the environment.

4. **On `pending_approval`**, the action is queued and runs when the owner
   approves. Tell the user and **do not retry**: a retry queues a duplicate.

5. **If the AgentValet tools are unavailable, stop.** Say so and suggest
   `npx @agentvalet/register`. Do not attempt the call ungoverned.

## Calling a platform

| Operation | Tool |
|---|---|
| Read | `read_platform` (always GET) |
| Create or update | `write_platform` (POST, PUT, PATCH) |
| Delete | `delete_platform` (always DELETE) |

Never write inline JWT signing code, `node -e` one-liners, or manual HTTP calls.
The tools handle authentication internally — you never need to read the private
key or sign anything yourself.
