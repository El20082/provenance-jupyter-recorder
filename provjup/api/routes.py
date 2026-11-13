"""Registers the server extension's routes under `<base_url>/provjup/`."""

from __future__ import annotations

import getpass
import json
import platform
import socket
from pathlib import Path
from typing import Any

import tornado.web
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join

from .files import ManifestsHandler
from .log import LogAppendHandler


def host_facts() -> dict[str, str]:
    """Raw facts the frontend needs for `session.start.machine_id` and `platform`."""
    try:
        user = getpass.getuser()
    except (KeyError, OSError):
        user = "unknown"
    return {"hostname": socket.gethostname(), "username": user, "platform": platform.system()}


class HostHandler(APIHandler):
    @tornado.web.authenticated
    def get(self) -> None:
        self.finish(json.dumps(host_facts()))


def setup_handlers(web_app: Any, root_dir: str) -> None:
    base = url_path_join(web_app.settings["base_url"], "provjup")
    root = {"root": Path(root_dir)}
    web_app.add_handlers(
        ".*$",
        [
            (url_path_join(base, "manifests"), ManifestsHandler, root),
            (url_path_join(base, "log", "append"), LogAppendHandler, root),
            (url_path_join(base, "host"), HostHandler),
        ],
    )
