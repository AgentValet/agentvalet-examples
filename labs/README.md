# AgentValet labs

Hands-on, in a browser, in about ten minutes each. Every lab runs in **your own free AgentValet org**; the only thing you set up outside the Codespace is that free account.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/AgentValet/agentvalet-examples?quickstart=1)

| Lab | What you will see | Status |
|---|---|---|
| [01 — the governed loop](01-governed-loop/) | register → connect a mock MCP upstream → governed read → a call held for your approval → deny-by-default → revoke → verify the signed receipt | ready |
| 02 — Claude Code | the same loop from inside Claude Code, with the session id on the audit row | see [`../claude-code/`](../claude-code/) for the config today |
| 03 — Agent SDK child identities | an orchestrator issues each worker a narrower identity | see [`../node-sdk/`](../node-sdk/) |
| 04 — CrewAI / LangGraph | governed tools in a crew and a graph | see [`../crewai/`](../crewai/), [`../python-langgraph/`](../python-langgraph/) |

What makes this different from a gateway lab: there is nothing to deploy. The broker is hosted; the upstream for lab 01 is a mock MCP server the broker itself serves at `https://api.agentvalet.ai/lab/mcp`, connected with no secrets. The thing being demonstrated is a human approving what an agent does to a system, and then revoking it.

## Safety

There is no shared lab org. A hostile Codespace user holds an agent in their own free org and can reach, at most, a public echo server at 5 calls a minute. Nothing in this repository contains an agent identity, a key or a token; CI fails if one is committed (`labs/validate.mjs`).
