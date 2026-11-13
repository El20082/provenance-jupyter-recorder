"""Tests for provjup/fs/slog_append.py."""

from __future__ import annotations

from pathlib import Path

import pytest

from provjup.fs.paths import Rejected
from provjup.fs.slog_append import Appended, OffsetMismatch, append_to_slog

SLOG = "session-0b3f2c6e-1d2a-4f5b-9c7d-8e9f0a1b2c3d.slog"


@pytest.fixture
def assignment(tmp_path: Path) -> Path:
    folder = tmp_path / "hw1"
    folder.mkdir()
    (folder / ".provenance-manifest").write_text("{}", encoding="utf-8")
    return tmp_path


def test_appends_in_order_and_reports_the_new_size(assignment: Path) -> None:
    assert append_to_slog(assignment, "hw1", SLOG, 0, b"a\n") == Appended(2)
    assert append_to_slog(assignment, "hw1", SLOG, 2, b"bc\n") == Appended(5)
    assert (assignment / "hw1" / ".provenance" / SLOG).read_bytes() == b"a\nbc\n"


def test_refuses_a_retry_at_a_stale_offset_without_writing(assignment: Path) -> None:
    append_to_slog(assignment, "hw1", SLOG, 0, b"a\n")
    assert append_to_slog(assignment, "hw1", SLOG, 0, b"a\n") == OffsetMismatch(2)
    assert (assignment / "hw1" / ".provenance" / SLOG).read_bytes() == b"a\n"


def test_refuses_an_offset_past_the_end(assignment: Path) -> None:
    assert append_to_slog(assignment, "hw1", SLOG, 10, b"x") == OffsetMismatch(0)


@pytest.mark.parametrize(
    "name",
    ["../escape.slog", "session-x.slog.meta", "manifest.json", "session-0b3f.slog/x", "other.slog"],
)
def test_refuses_any_file_that_is_not_a_session_log(assignment: Path, name: str) -> None:
    assert isinstance(append_to_slog(assignment, "hw1", name, 0, b"x"), Rejected)


def test_refuses_a_folder_without_a_manifest(tmp_path: Path) -> None:
    (tmp_path / "scratch").mkdir()
    result = append_to_slog(tmp_path, "scratch", SLOG, 0, b"x")
    assert isinstance(result, Rejected)
    assert not (tmp_path / "scratch" / ".provenance").exists()


def test_refuses_a_folder_outside_the_root(assignment: Path) -> None:
    assert isinstance(append_to_slog(assignment, "../hw1", SLOG, 0, b"x"), Rejected)


def test_refuses_a_negative_offset(assignment: Path) -> None:
    assert isinstance(append_to_slog(assignment, "hw1", SLOG, -1, b"x"), Rejected)
