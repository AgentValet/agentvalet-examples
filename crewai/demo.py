"""A crew where every member holds its own attenuated identity.

Most tool governance is a client-side allow-list: the filter lives in your
code, and an agent that is not offered a tool can still be talked into calling
something adjacent. Here the tool list comes from the *server*, already
filtered by your grants and your policy, and it is built from a child identity
that holds strictly less than the crew's own agent.

So a researcher cannot form a call it was never delegated. Not because the
prompt discourages it - because the credential it holds cannot make it.

Run it with `python demo.py` after `npx @agentvalet/register`.
"""

from __future__ import annotations

import os

from typing import Any

from agentvalet import AccessDeniedError, AgentValet
from agentvalet.child import ChildIdentity
from crewai import Agent, Crew, Task
from crewai_agentvalet import governed_tools


# The researcher needs to read repositories and nothing else. Everything else
# the parent agent holds - issues, pull requests, contents, repo creation - is
# simply not delegated, so it cannot be reached from inside the crew.
RESEARCHER_GRANTS = [{"platform": "github", "scopes": ["github:repo.read"]}]


def mint_child(av: AgentValet) -> ChildIdentity:
    """Beat 5 - a time-boxed identity holding strictly less than its parent.

    The server attenuates against the parent's *current* grants, so you cannot
    hand out more than you hold, and revoking the parent contains the child on
    its next call.
    """
    return av.issue_child(grants=RESEARCHER_GRANTS, name="researcher", ttl_seconds=900)


def child_tools(child: ChildIdentity) -> list[Any]:
    """The child's whole tool surface is its own grant matrix, server-filtered."""
    return governed_tools(child.client(), platforms=["github"])


def build_crew(child: ChildIdentity) -> Crew:
    researcher = Agent(
        role="Repository Researcher",
        goal="Summarise what repositories this account can see",
        backstory=(
            "You inspect repositories and report plainly. You have read access "
            "and nothing more, by design."
        ),
        tools=child_tools(child),
    )

    task = Task(
        description="List the repositories available to you and summarise them in three lines.",
        expected_output="A three-line summary.",
        agent=researcher,
    )

    return Crew(agents=[researcher], tasks=[task])


def _github_scopes(av: AgentValet) -> list[str]:
    listed = av.list_platforms()
    entries = (listed.get("data") or {}).get("platforms") or listed.get("platforms") or []
    for entry in entries:
        if entry.get("platformId") == "github":
            return sorted(entry.get("scopes") or [])
    return []


LLM_KEY_VARS = (
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
)


def _llm_key_present() -> bool:
    return any(os.environ.get(v) for v in LLM_KEY_VARS)


def main() -> None:
    parent = AgentValet.from_env()

    print("Beat 5 - per-subagent identity.\n")
    parent_scopes = _github_scopes(parent)
    print(f"  The crew's own agent holds {len(parent_scopes)} GitHub scopes:")
    for s in parent_scopes:
        print("   ", s)

    child = mint_child(parent)
    child_scopes = sorted(s for g in child.granted for s in g["scopes"])
    print(f"\n  The researcher it delegates to holds {len(child_scopes)}:")
    for s in child_scopes:
        print("   ", s)
    print(f"\n  child agent: {child.child_agent_id}")
    print(f"  expires at:  {child.expires_at}")

    withheld = [s for s in parent_scopes if s not in child_scopes]
    if withheld:
        probe = withheld[0]
        print()
        print(f"  Trying '{probe}' as the child - a scope its parent DOES hold:")
        try:
            child.client().call(
                platform="github",
                endpoint="/repos/EdwinEvalAgentValet/Test/issues",
                scope=probe,
                method="GET",
            )
            print("    UNEXPECTED: the call succeeded.")
        except AccessDeniedError as err:
            print("   ", str(err).splitlines()[0][:110])
            print("  Refused at the broker, not by the prompt. The crew")
            print("  cannot reach it even if the model decides to try.")

    print("\n  Depth is capped at 1, so the researcher cannot delegate further,")
    print("  and revoking the parent contains it on its next call.")

    # Everything above needed no LLM at all - the governance story is
    # complete without one. Only running the crew needs a provider, so say
    # that plainly rather than letting CrewAI emit a wall of provider errors
    # a reader would fairly read as this example being broken.
    if not _llm_key_present():
        print()
        print('Crew execution SKIPPED - no LLM key found.')
        print('Everything above IS the governed part, and it needs no LLM.')
        print('To run the crew itself, set one of:')
        print('  ' + ', '.join(LLM_KEY_VARS))
        return

    print()
    print('Running the crew...')
    print(build_crew(child).kickoff())


if __name__ == "__main__":
    main()
