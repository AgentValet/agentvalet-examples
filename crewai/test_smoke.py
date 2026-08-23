"""CI runs this against the PUBLISHED crewai-agentvalet.

What matters here is not that a crew runs — that needs an LLM key. It is that
a child identity really is *narrower* than its parent, and that the narrowing
is enforced by the broker rather than by our own code being polite.
"""

import pytest
from agentvalet import AccessDeniedError, AgentValet, ConfigError

from demo import child_tools, mint_child


def test_child_holds_only_what_it_was_delegated():
    av = AgentValet.from_env()
    child = mint_child(av)

    granted = {g["platform"] for g in child.granted}
    assert granted == {"github"}, "child must hold only the delegated platform"

    scopes = {s for g in child.granted for s in g["scopes"]}
    assert scopes == {"github:repo.read"}, "child must hold only the delegated scope"


def test_child_cannot_use_a_parent_scope_it_was_not_delegated():
    """The heart of it: attenuation is enforced by the broker, not by politeness.

    This issues a REAL call rather than a dry run. `evaluate()` would be the
    tidier probe, but it is broken on bearer-mode clients in agentvalet 0.2.0 —
    `from_bearer` sets no agent_id, so the AuthZEN body carries an empty
    subject.id and the proxy 400s. A real call is stronger proof anyway: it
    exercises the path an actual crew member would take.

    Skipped when the parent holds nothing extra — then there is no narrowing to
    demonstrate and a pass would prove nothing.
    """
    av = AgentValet.from_env()
    extra = sorted(_github_scopes(av) - {"github:repo.read"})
    if not extra:
        pytest.skip("parent holds no scope beyond the delegated one; nothing to attenuate")

    child = mint_child(av).client()
    with pytest.raises(AccessDeniedError):
        child.call(
            platform="github",
            endpoint="/repos/EdwinEvalAgentValet/Test/issues",
            scope=extra[0],
            method="GET",
        )


def test_child_can_still_use_what_it_WAS_delegated():
    """The mirror of the test above — attenuation must not break the grant."""
    av = AgentValet.from_env()
    child = mint_child(av).client()
    result = child.call(
        platform="github", endpoint="/user/repos", scope="github:repo.read", method="GET"
    )
    assert isinstance(result["data"], list)


def test_child_cannot_mint_grandchildren():
    av = AgentValet.from_env()
    child = mint_child(av).client()
    # Depth is capped at 1, and the client refuses locally — before any network
    # call — so this cannot even be attempted.
    with pytest.raises(ConfigError):
        child.issue_child(grants=[{"platform": "github", "scopes": ["github:repo.read"]}])


def test_child_tools_are_built_from_the_childs_own_grants():
    av = AgentValet.from_env()
    tools = child_tools(mint_child(av))
    assert tools, "a granted child should get at least one governed tool"


def _github_scopes(av: AgentValet) -> set[str]:
    listed = av.list_platforms()
    entries = (listed.get("data") or {}).get("platforms") or listed.get("platforms") or []
    for entry in entries:
        if entry.get("platformId") == "github":
            return set(entry.get("scopes") or [])
    return set()
