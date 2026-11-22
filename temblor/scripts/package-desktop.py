#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Package a release built for this host and verify the downloadable archive."""
import argparse
import json
import platform
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def output(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True)


def include_notices(destination, packages, target):
    tree = output("cargo", "tree", "--locked", "-p", "temblor-desktop", "--target",
                  target, "-e", "normal", "--prefix", "none", "--format", "{p}")
    linked = {tuple(line.split()[:2]) for line in tree.splitlines()}
    inventory = []
    for package in packages:
        name, version = package["name"], package["version"]
        if not package["source"] or (name, "v" + version) not in linked:
            continue
        source = Path(package["manifest_path"]).parent
        dest = destination / "crates" / f"{name}-{version}"
        notices = [p for p in source.iterdir()
                   if p.name.lower().startswith(("license", "licence", "copying", "copyright", "notice"))]
        if package["license_file"]:
            notices.append(source / package["license_file"])
        if name == "epaint_default_fonts":
            notices.extend((source / "fonts").glob("*.txt"))
        for path in notices:
            to = dest / path.relative_to(source)
            to.parent.mkdir(parents=True, exist_ok=True)
            if path.is_dir():
                shutil.copytree(path, to, dirs_exist_ok=True)
            else:
                shutil.copyfile(path, to)
        inventory.append({"name": name, "version": version, "license": package["license"],
                          "source": f"https://static.crates.io/crates/{name}/{name}-{version}.crate"})
    (destination / "dependencies.json").write_text(json.dumps(inventory, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", help="release tag, for example v1.0.0")
    args = parser.parse_args()
    if not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+", args.tag):
        parser.error("expected a vMAJOR.MINOR.PATCH tag")
    target = re.search(r"^host: (.+)$", output("rustc", "-vV"), re.M)[1]
    os_name = {"Darwin": "macos", "Linux": "linux"}[platform.system()]
    arch = {"aarch64": "arm64"}.get(platform.machine(), platform.machine())
    name = f"temblor-{args.tag}-{os_name}-{arch}"
    metadata = json.loads(output("cargo", "metadata", "--locked", "--filter-platform", target,
                                 "--format-version", "1"))
    build = Path(metadata["target_directory"])
    archive = build / "dist" / (name + ".tar.gz")
    archive.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        bundle = Path(tmp) / name
        shutil.copytree(ROOT / "release/licenses", bundle / "licenses")
        include_notices(bundle / "licenses", metadata["packages"], target)
        shutil.copy2(build / "release/temblor-desktop", bundle / "temblor-desktop")
        shutil.copyfile(ROOT / "README.md", bundle / "README.md")
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(bundle, arcname=name)
    with tarfile.open(archive) as tar:
        executable = tar.getmember(f"{name}/temblor-desktop")
        if not executable.mode & 0o111:
            raise ValueError("packaged binary has no execute permission")
        data = tar.extractfile(executable).read()
        for pack in ("arena.pk3", "actors.pk3"):
            if (ROOT / "assets" / pack).read_bytes() not in data:
                raise ValueError(f"packaged binary is missing {pack}")
        for path in ("COPYING", "manifest.json", "dependencies.json", "openarena-players.copyright"):
            tar.getmember(f"{name}/licenses/{path}")
    print(archive)


if __name__ == "__main__":
    main()
