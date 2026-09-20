#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
uuid=$(python3 -c 'import json; print(json.load(open("gnome/metadata.json"))["uuid"])')
version=$(python3 -c 'import json; print(json.load(open("gnome/metadata.json"))["version-name"])')
archive="${1:-dist/notavirus-${version}-gnome50-$(uname -m).zip}"
if [[ ! -f "$archive" ]]; then
    if [[ $# -gt 0 ]]; then echo "Archive not found: $archive" >&2; exit 1; fi
    ./scripts/build-gnome.sh
fi
[[ $(gnome-shell --version) == 'GNOME Shell 50.'* ]] || { echo 'This extension requires GNOME Shell 50.' >&2; exit 1; }
gnome-extensions install --force "$archive"
if gnome-extensions info "$uuid" >/dev/null 2>&1; then
    gnome-extensions enable "$uuid"
    echo 'Installed. After updating, log out and back in to load the new JavaScript.'
else
    echo "Installed. Log out and back in, then run: gnome-extensions enable $uuid"
fi
