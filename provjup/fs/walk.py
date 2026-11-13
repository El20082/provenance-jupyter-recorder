"""Finds `.provenance-manifest` files under the server root.

Returns their raw text only. Verifying a manifest is the frontend's job, through log-core.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .slog_append import MANIFEST_NAMES

# VS Code excludes node_modules, .git and .provenance. Hidden folders and caches are also
# skipped here, because on DataHub the server root is the student's home directory.
SKIP_DIRS = frozenset({"node_modules", "__pycache__"})

MAX_DEPTH = 8
MAX_MANIFEST_BYTES = 1024 * 1024


@dataclass(frozen=True)
class ManifestFile:
    dir: str
    """Folder holding the manifest, relative to the server root, with forward slashes."""
    name: str
    text: str


def find_manifests(root: Path, max_depth: int = MAX_DEPTH) -> list[ManifestFile]:
    """Every manifest under `root`, at most one per folder, in sorted folder order.

    When a folder has both names, `.provenance-manifest` wins, as in VS Code.
    """
    real_root = Path(os.path.realpath(root))
    found: list[ManifestFile] = []
    for current, dirs, files in os.walk(real_root, followlinks=False):
        rel = Path(current).relative_to(real_root)
        depth = 0 if rel == Path(".") else len(rel.parts)
        dirs[:] = sorted(
            d for d in dirs if d not in SKIP_DIRS and not d.startswith(".") and depth < max_depth
        )
        for name in MANIFEST_NAMES:
            if name not in files:
                continue
            path = Path(current) / name
            if path.is_symlink() or path.stat().st_size > MAX_MANIFEST_BYTES:
                break
            text = path.read_text(encoding="utf-8", errors="replace")
            found.append(ManifestFile(dir=rel.as_posix() if depth else "", name=name, text=text))
            break
    found.sort(key=lambda manifest: manifest.dir)
    return found
