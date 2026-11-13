"""POST /provjup/log/append: append already-built log lines to a session's `.slog`.

Request body: {"dir": str, "file": str, "offset": int, "data": str}
Responses: 200 {"size": n}; 409 {"size": n} when the file is not at `offset`;
400 {"error": reason} for a refused path or a malformed request.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import tornado.web
from jupyter_server.base.handlers import APIHandler

from ..fs.paths import Rejected
from ..fs.slog_append import Appended, OffsetMismatch, append_to_slog


def parse_append(body: bytes) -> tuple[str, str, int, bytes] | Rejected:
    """Validate the request body. Pure, so it is tested without a server."""
    try:
        raw: Any = json.loads(body)
    except ValueError:
        return Rejected("body must be JSON")
    if not isinstance(raw, dict):
        return Rejected("body must be a JSON object")
    folder, name, offset, data = raw.get("dir"), raw.get("file"), raw.get("offset"), raw.get("data")
    if not (isinstance(folder, str) and isinstance(name, str) and isinstance(data, str)):
        return Rejected("dir, file and data must be strings")
    if not isinstance(offset, int) or isinstance(offset, bool):
        return Rejected("offset must be an integer")
    return folder, name, offset, data.encode("utf-8")


class LogAppendHandler(APIHandler):
    def initialize(self, root: Path) -> None:
        self.root = root

    @tornado.web.authenticated
    def post(self) -> None:
        request = parse_append(self.request.body)
        if isinstance(request, Rejected):
            self.set_status(400)
            self.finish(json.dumps({"error": request.reason}))
            return
        result = append_to_slog(self.root, *request)
        if isinstance(result, Rejected):
            self.set_status(400)
            self.finish(json.dumps({"error": result.reason}))
        elif isinstance(result, OffsetMismatch):
            self.set_status(409)
            self.finish(json.dumps({"size": result.size}))
        else:
            assert isinstance(result, Appended)
            self.finish(json.dumps({"size": result.size}))
