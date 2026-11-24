#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
WYANG_BUILD_PROFILE=dev bash scripts/package.sh
cargo build --locked --example stage_harbor
export WYANG_TEST_OUTPUT=${WYANG_TEST_OUTPUT:-$(mktemp -d)}
export WYANG_STAGE_BINARY="$(pwd)/target/debug/examples/stage_harbor"
echo "Screenshots: $WYANG_TEST_OUTPUT"
# The private bus, compositor, settings, and data home belong to the test tool.
dbus-run-session -- gnome-shell-test-tool --headless --extra-filter org.wyang.Player \
    --extra-filter wyang-player --extension "$(pwd)/dist/wyang@local.shell-extension.zip" "$(pwd)/tests/gnome/desktop.js"
python3 tests/gnome/check-images.py "$WYANG_TEST_OUTPUT"
