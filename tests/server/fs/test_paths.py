"""Tests for provjup/fs/paths.py."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from provjup.fs.paths import Rejected, resolve_inside


def test_resolves_a_relative_path_inside_the_root(tmp_path: Path) -> None:
    result = resolve_inside(tmp_path, "hw1/.provenance")
    assert result == Path(os.path.realpath(tmp_path)) / "hw1" / ".provenance"


def test_empty_path_is_the_root(tmp_path: Path) -> None:
    assert resolve_inside(tmp_path, "") == Path(os.path.realpath(tmp_path))


@pytest.mark.parametrize(
    "path",
    ["../outside", "hw1/../../outside", "/etc/passwd", "C:/Windows", "hw1\\x", "a\x00b"],
)
def test_rejects_paths_that_could_leave_the_root(tmp_path: Path, path: str) -> None:
    assert isinstance(resolve_inside(tmp_path, path), Rejected)


def test_rejects_a_symlink_that_points_outside(tmp_path: Path) -> None:
    root = tmp_path / "root"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    try:
        (root / "link").symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("creating symlinks needs extra privileges on this system")
    assert isinstance(resolve_inside(root, "link/file"), Rejected)
