#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/package.sh
cargo build --release --locked --example stage_harbor
export WYANG_PROFILE_DIR=$(mktemp -d)
export WYANG_STAGE_BINARY="$PWD/target/release/examples/stage_harbor"
dbus-run-session -- gnome-shell-test-tool --headless --wrap "$PWD/tests/gnome/1080p.sh" \
    --extra-filter org.wyang.Player --extra-filter wyang-player \
    --extension "$PWD/dist/wyang@local.shell-extension.zip" "$PWD/tests/gnome/benchmark.js"
cat "$WYANG_PROFILE_DIR"/player-*.json
