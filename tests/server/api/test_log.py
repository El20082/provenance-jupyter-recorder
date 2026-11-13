"""Tests for provjup/api/log.py: request parsing, which the handler relies on."""

from __future__ import annotations

import json

import pytest

from provjup.api.log import parse_append
from provjup.fs.paths import Rejected


def test_parses_a_valid_request() -> None:
    body = json.dumps({"dir": "hw1", "file": "f.slog", "offset": 3, "data": "é\n"}).encode()
    assert parse_append(body) == ("hw1", "f.slog", 3, "é\n".encode())


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b"[]",
        json.dumps({"dir": "hw1", "file": "f.slog", "offset": "3", "data": "x"}).encode(),
        json.dumps({"dir": "hw1", "file": "f.slog", "offset": True, "data": "x"}).encode(),
        json.dumps({"dir": "hw1", "file": "f.slog", "offset": 0}).encode(),
    ],
)
def test_rejects_malformed_requests(body: bytes) -> None:
    assert isinstance(parse_append(body), Rejected)
