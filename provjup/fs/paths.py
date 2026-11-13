"""Confines every client-supplied path to the Jupyter server's root directory.

The frontend sends paths relative to the server root, with forward slashes, the way the
Jupyter Contents API does. Anything absolute, containing `..`, or resolving (through a
symlink) to somewhere outside the root is rejected.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Rejected:
    """Why a path was refused. Returned as a value; handlers turn it into HTTP 400."""

    reason: str


def resolve_inside(root: Path, relative: str) -> Path | Rejected:
    """Resolve `relative` against `root`, or say why it is not allowed.

    An empty string means the root itself.
    """
    if "\\" in relative or "\x00" in relative:
        return Rejected("path must use forward slashes and contain no NUL")
    if relative.startswith("/") or (len(relative) > 1 and relative[1] == ":"):
        return Rejected("path must be relative to the server root")
    parts = [part for part in relative.split("/") if part not in ("", ".")]
    if ".." in parts:
        return Rejected("path must not contain '..'")

    real_root = Path(os.path.realpath(root))
    candidate = Path(os.path.realpath(real_root.joinpath(*parts)))
    if os.path.commonpath([real_root, candidate]) != str(real_root):
        return Rejected("path resolves outside the server root")
    return candidate
