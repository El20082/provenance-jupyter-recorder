"""GET /provjup/manifests: the raw text of every manifest under the server root."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

import tornado.web
from jupyter_server.base.handlers import APIHandler

from ..fs.walk import find_manifests


class ManifestsHandler(APIHandler):
    def initialize(self, root: Path) -> None:
        self.root = root

    @tornado.web.authenticated
    def get(self) -> None:
        manifests = [asdict(manifest) for manifest in find_manifests(self.root)]
        self.finish(json.dumps({"manifests": manifests}))
