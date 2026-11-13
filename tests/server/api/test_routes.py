"""Tests for provjup/api/routes.py."""

from __future__ import annotations

from provjup.api.routes import host_facts


def test_host_facts_are_non_empty_strings() -> None:
    facts = host_facts()
    assert set(facts) == {"hostname", "username", "platform"}
    assert all(isinstance(value, str) and value for value in facts.values())
