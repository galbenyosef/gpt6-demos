#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $(uname -s) != Linux ]]; then echo 'Build the GNOME helper on Linux.' >&2; exit 1; fi
cargo build --release --locked -p notavirus-gnome
glib-compile-schemas --strict --dry-run gnome/schemas
python3 - <<'PY'
import json, pathlib, shutil, subprocess, zipfile
root = pathlib.Path.cwd()
meta = json.loads((root / 'gnome/metadata.json').read_text())
arch = subprocess.check_output(['uname', '-m'], text=True).strip()
name = f"notavirus-{meta['version-name']}-gnome50-{arch}"
stage = root / 'dist' / name
if stage.exists(): shutil.rmtree(stage)
shutil.copytree(root / 'gnome', stage)
shutil.copy2(root / 'target/release/notavirus-gnome', stage / 'notavirus-gnome')
shutil.copytree(root / 'resources/packs', stage / 'packs')
shutil.copy2(root.parent / 'LICENSE.md', stage / 'LICENSE.md')
subprocess.run(['glib-compile-schemas', '--strict', str(stage / 'schemas')], check=True)
archive = root / 'dist' / f'{name}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for path in sorted(stage.rglob('*')):
        if path.is_file(): z.write(path, path.relative_to(stage))
print(archive)
PY
