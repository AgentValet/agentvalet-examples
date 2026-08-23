"""CI runs this against the PUBLISHED `agentvalet` package.

Beat 3 (approval) is deliberately not covered — it needs a human by
construction. What CI can assert is that the other beats still work against the
live proxy, so a broken example is caught before a reader hits it.
"""

from agentvalet import AgentValet

from demo import read_beat, deny_beat


def test_beat_2_granted_read_returns_the_broker_envelope():
    av = AgentValet.from_env()
    result = read_beat(av)

    # `data` is the upstream body byte-for-byte; `_meta` is what the broker
    # adds about the call. Same split as the Node client.
    assert result.get("data") is not None, "upstream body should be under .data"
    assert result.get("_meta") is not None, "call metadata should be under ._meta"
    assert isinstance(result["data"], list), "GET /user/repos returns an array"


def test_beat_4_ungranted_scope_is_denied_without_being_attempted():
    av = AgentValet.from_env()
    decision = deny_beat(av)

    assert decision["decision"] is False, "an ungranted scope must not be allowed"
    assert decision["reason"] == "scope_not_granted"
