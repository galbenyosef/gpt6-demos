#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
uuid=$(python3 -c 'import json; print(json.load(open("gnome/metadata.json"))["uuid"])')
gnome-extensions disable "$uuid" || true
gnome-extensions uninstall "$uuid"
echo 'Extension removed. User packs and preferences were preserved.'
