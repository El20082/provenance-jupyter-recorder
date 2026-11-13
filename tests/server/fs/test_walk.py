"""Tests for provjup/fs/walk.py."""

from __future__ import annotations

from pathlib import Path

from provjup.fs.walk import ManifestFile, find_manifests


def write(path: Path, text: str = "{}") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_finds_manifests_at_any_depth_in_sorted_order(tmp_path: Path) -> None:
    write(tmp_path / "data100" / "hw2" / ".provenance-manifest", "two")
    write(tmp_path / "data100" / "hw1" / "provenance-manifest", "one")
    assert find_manifests(tmp_path) == [
        ManifestFile(dir="data100/hw1", name="provenance-manifest", text="one"),
        ManifestFile(dir="data100/hw2", name=".provenance-manifest", text="two"),
    ]


def test_finds_a_manifest_at_the_root(tmp_path: Path) -> None:
    write(tmp_path / ".provenance-manifest", "root")
    assert find_manifests(tmp_path) == [
        ManifestFile(dir="", name=".provenance-manifest", text="root")
    ]


def test_prefers_the_dotfile_when_a_folder_has_both(tmp_path: Path) -> None:
    write(tmp_path / "hw" / ".provenance-manifest", "dot")
    write(tmp_path / "hw" / "provenance-manifest", "plain")
    assert [m.text for m in find_manifests(tmp_path)] == ["dot"]


def test_skips_hidden_folders_dependencies_and_provenance_logs(tmp_path: Path) -> None:
    for skipped in [".local", "node_modules", ".provenance", ".git", "__pycache__"]:
        write(tmp_path / skipped / "hw" / ".provenance-manifest")
    assert find_manifests(tmp_path) == []


def test_stops_at_the_depth_limit(tmp_path: Path) -> None:
    write(tmp_path / "a" / "b" / "c" / ".provenance-manifest")
    assert find_manifests(tmp_path, max_depth=2) == []
    assert len(find_manifests(tmp_path, max_depth=3)) == 1
