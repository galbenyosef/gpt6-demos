#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Build only the audited allowlist. Never scan for installed game files."""
import filecmp
import hashlib
import json
from pathlib import Path
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1] / "assets"
# The desktop compiler may be embedding the last completed packs at the same time.
with tempfile.TemporaryDirectory(dir=root) as directory:
    temp = Path(directory)
    with zipfile.ZipFile(temp / "arena.pk3", "w") as arena, zipfile.ZipFile(temp / "actors.pk3", "w") as actors:
        for item in sorted(json.loads((root / "manifest.json").read_text()), key=lambda i: i["path"]):
            path = item["path"]
            data = (root / "source" / path).read_bytes()
            if hashlib.sha256(data).hexdigest() != item["sha256"]:
                raise ValueError(f"changed input {path}")
            if path.startswith(("editable/", "levelshots/")):
                continue
            package = actors if path.startswith("models/") else arena
            package.writestr(zipfile.ZipInfo(path), data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    for pack in temp.iterdir():
        dest = root / pack.name
        if not dest.exists() or not filecmp.cmp(pack, dest, shallow=False):
            pack.replace(dest)
