"""Jupyter entry points for provjup.

`_jupyter_labextension_paths` tells JupyterLab where the prebuilt frontend lives, and
`_jupyter_server_extension_points` registers the server extension. The server extension
moves bytes only; its routes land in Task 4.
"""

from __future__ import annotations

from typing import Any

__all__ = ["__version__"]

__version__ = "0.0.0"


def _jupyter_labextension_paths() -> list[dict[str, str]]:
    return [{"src": "labextension", "dest": "provjup"}]


def _jupyter_server_extension_points() -> list[dict[str, str]]:
    return [{"module": "provjup"}]


def _load_jupyter_server_extension(server_app: Any) -> None:
    server_app.log.info("provjup: server extension loaded (no routes yet)")
