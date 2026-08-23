"""Governed platform access from inside a LangGraph node.

The point this example makes: there is no LangGraph-specific AgentValet
package, and none is needed. A brokered call is an ordinary function call
inside an ordinary node.

Run it with `python demo.py` after `npx @agentvalet/register`.
"""

from __future__ import annotations

from typing import Any, TypedDict

from agentvalet import AccessDeniedError, AgentValet, ApprovalTimeoutError
from langgraph.graph import END, START, StateGraph


# ── The beats ────────────────────────────────────────────────────────────────


def read_beat(av: AgentValet) -> Any:
    """Beat 2 — a governed read. This process never holds a GitHub token."""
    return av.call(
        platform="github",
        endpoint="/user/repos",
        scope="github:repo.read",
        method="GET",
        reason="AgentValet examples: listing repositories to show a governed read",
    )


def deny_beat(av: AgentValet) -> Any:
    """Beat 4 — deny-by-default, dry-run so nothing is attempted."""
    return av.evaluate("stripe", "charge")


def _is_approval_gated(av: AgentValet, platform: str, scope: str) -> bool:
    """True when the owner has marked this scope as needing approval."""
    listed = av.list_platforms()
    for entry in listed.get("platforms", []):
        if entry.get("platformId") == platform:
            return bool(entry.get("requireApproval")) or scope in (
                entry.get("approvalScopes") or []
            )
    return False


def approval_beat(av: AgentValet) -> None:
    """Beat 3 — blocks until the owner decides, or the budget expires."""
    scope = "github:repo.create"

    if not _is_approval_gated(av, "github", scope):
        # Say so rather than silently succeeding: a reader expecting a prompt
        # would otherwise conclude the feature is broken.
        print(f"\nBeat 3 - SKIPPED. '{scope}' is granted without approval,")
        print("so this call would just execute and you would see no prompt.")
        print("To see the approval beat: open the agent's GitHub grant in the")
        print(f"dashboard, mark '{scope}' as requiring approval, and re-run.")
        return

    print("\nBeat 3 - approval.")
    print("Open https://app.agentvalet.ai now - you have about 50 seconds.")
    input("Press Enter when you are ready to trigger the request...")

    try:
        result = av.call(
            platform="github",
            endpoint="/user/repos",
            scope=scope,
            method="POST",
            data={"name": "agentvalet-demo-langgraph", "private": True},
            reason="AgentValet examples: demonstrating the approval beat",
        )
        print("Approved and executed -", result["data"].get("full_name"))
        print("You can delete that repo; it exists only to prove the beat.")
    except ApprovalTimeoutError as err:
        print("\nNobody approved in time. This is NOT a failure.")
        print(f"The action is still queued server-side as {err.approval_id}.")
        print("Do NOT re-run this - a second call queues a SECOND repo.")
        print(f'Resume it whenever you like:  av.wait_for_approval("{err.approval_id}")')


# ── The graph ────────────────────────────────────────────────────────────────


class State(TypedDict):
    repos: Any
    decision: Any


def fetch_repos(state: State) -> State:
    av = AgentValet.from_env()
    return {"repos": read_beat(av)["data"], "decision": state.get("decision")}


def check_ungranted(state: State) -> State:
    av = AgentValet.from_env()
    return {"repos": state.get("repos"), "decision": deny_beat(av)}


def build_graph():
    graph = StateGraph(State)
    graph.add_node("fetch_repos", fetch_repos)
    graph.add_node("check_ungranted", check_ungranted)
    graph.add_edge(START, "fetch_repos")
    graph.add_edge("fetch_repos", "check_ungranted")
    graph.add_edge("check_ungranted", END)
    return graph.compile()


def main() -> None:
    av = AgentValet.from_env()

    print("Beat 2 - a governed read of /user/repos, from inside a graph node.\n")
    try:
        final = build_graph().invoke({"repos": None, "decision": None})
    except AccessDeniedError:
        print("Denied. Two things to check, in this order:")
        print("  1. Has the agent been GRANTED github:repo.read? Approving an")
        print("     agent grants it nothing - they are separate steps.")
        print("  2. Did you grant 'github:repo.read' and not plain 'repo'?")
        print("     The picker lists unenforced OAuth scopes first.")
        raise SystemExit(1)

    repos = final["repos"]
    print(f"  {len(repos)} repositories:")
    for r in repos[:10]:
        print("   ", r["full_name"])
    print("\n  That call is now in your audit log, tagged github:repo.read.")
    print("  This process never held a GitHub token.")

    approval_beat(av)

    print("\nBeat 4 - deny-by-default. Asking about a scope you never granted:")
    print("  ", final["decision"])
    print("  Nothing was attempted. To ask for access, use:")
    print("    av.request_access(platform=..., scope=..., reason=...)")


if __name__ == "__main__":
    main()
