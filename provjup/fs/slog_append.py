"""Appends bytes to a session log in `<assignment>/.provenance/`, in order, never twice.

The frontend builds and chains every entry; this module only writes the bytes it is given.
Each append carries the byte offset the frontend expects the file to be at. A mismatch is
refused and the real size returned, so a retried request can never duplicate or reorder
lines, and the frontend learns exactly what landed.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from .paths import Rejected, resolve_inside

# Matches log-core's `session-<uuid>.slog` (analysis-core loader/unzip.ts SLOG_RE).
SLOG_NAME = re.compile(r"^session-[0-9a-f-]+\.slog$")

MANIFEST_NAMES = (".provenance-manifest", "provenance-manifest")

PROVENANCE_DIR = ".provenance"


@dataclass(frozen=True)
class Appended:
    size: int


@dataclass(frozen=True)
class OffsetMismatch:
    """The file is not at the offset the client expected. Nothing was written."""

    size: int


def append_to_slog(
    root: Path, assignment_dir: str, file_name: str, offset: int, data: bytes
) -> Appended | OffsetMismatch | Rejected:
    """Append `data` to `<assignment_dir>/.provenance/<file_name>` if it is at `offset`."""
    if not SLOG_NAME.fullmatch(file_name):
        return Rejected("file must be named session-<uuid>.slog")
    if offset < 0:
        return Rejected("offset must not be negative")

    assignment = resolve_inside(root, assignment_dir)
    if isinstance(assignment, Rejected):
        return assignment
    # Only an assignment folder may hold a log, so a request cannot create
    # `.provenance/` anywhere else under the server root.
    if not any((assignment / name).is_file() for name in MANIFEST_NAMES):
        return Rejected("folder has no .provenance-manifest")

    provenance = assignment / PROVENANCE_DIR
    if provenance.is_symlink():
        return Rejected(".provenance must not be a symlink")
    provenance.mkdir(exist_ok=True)
    target = resolve_inside(root, f"{assignment_dir}/{PROVENANCE_DIR}/{file_name}".lstrip("/"))
    if isinstance(target, Rejected):
        return target

    with open(target, "ab") as log:
        size = log.seek(0, os.SEEK_END)
        if size != offset:
            return OffsetMismatch(size)
        log.write(data)
        log.flush()
        return Appended(size + len(data))
