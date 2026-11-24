#!/usr/bin/env bash
set -euo pipefail
project=${1:--}
if [[ "$project" != "-" ]]; then project=$(cd "$project" && pwd); fi
cd "$(dirname "$0")/.."
bash scripts/package.sh
cargo build --release --locked --example check_display
target=$(cargo metadata --format-version 1 --no-deps | python3 -c 'import json,sys; print(json.load(sys.stdin)["target_directory"])')
out=$(mktemp -d "${TMPDIR:-/tmp}/wyang-mac.XXXXXX")
echo "Acceptance files in $out"
ditto -x -k "dist/Wyang-0.1.0-macOS-$(uname -m).zip" "$out"
macos="$out/Wyang.app/Contents/MacOS"
codesign --verify --deep --strict "$out/Wyang.app"
clang -fobjc-arc -framework AppKit -framework CoreGraphics -framework ApplicationServices tests/macos/display.m -o "$out/display"
cp "$target/release/examples/check_display" "$out/check"
ln -s "$macos/wyang-player" "$out/wyang-player"
cd "$out"
read -r display width height scale < <(./display)
echo "Main display $display, ${width}x${height} backing pixels, scale $scale"
./check idle "$display"
editor_pid=
owned_token=
record="$HOME/Library/Application Support/wyang/players/$display.active"
cleanup() {
    if [[ -n "$editor_pid" ]]; then kill "$editor_pid" 2>/dev/null || true; fi
    if [[ -n "$owned_token" && -f "$record" && "$(cat "$record")" == "$owned_token" ]]; then
        ./check stop "$display"
    fi
}
trap cleanup EXIT
wait_for_window() {
    local kind=$1 pid=$2
    for ((i=0; i<50; i++)); do
        if ./display "$kind" "$pid"; then return 0; fi
        sleep 0.1
    done
    ./display inspect "$pid" || true
    echo "WindowServer did not report the expected $kind window for PID $pid" >&2
    return 1
}
wait_for_exit() {
    for ((i=0; i<50; i++)); do
        if ! kill -0 "$1" 2>/dev/null; then return 0; fi
        sleep 0.1
    done
    echo "Player $1 still running" >&2
    return 1
}
OPENAI_API_KEY=fixture ./check still "$display" "$project" rest.png "$width" "$height"
owned_token=$(cat "$record")
pid=$(pgrep -f "wyang-player .* $owned_token$")
window=$(wait_for_window player "$pid")
if ./display capture-access; then
    screencapture -x -o -l "$window" player.png
    ./check compare rest.png player.png
else
    echo "Window capture unavailable with the current Screen Recording permission"
fi
./check invalid "$display"
if [[ "$project" != "-" ]]; then
    open -n -a "$out/Wyang.app" --env OPENAI_API_KEY= --args "$project"
else
    open -n -a "$out/Wyang.app" --env OPENAI_API_KEY=
fi
editor_pid=$(./display editor-pid "$out/Wyang.app")
editor_window=$(wait_for_window editor "$editor_pid")
if ./display capture-access; then
    for ((i=0; i<20; i++)); do
        screencapture -x -o -l "$editor_window" editor.png
        if ./check preview editor.png 2>/dev/null; then break; fi
        sleep 0.5
    done
    ./check preview editor.png
fi
./display quit "$editor_pid"
wait_for_exit "$editor_pid"
editor_pid=
./check active "$display"
export WYANG_PROFILE_DIR="$out"
./check motion "$display" "$project"
owned_token=$(cat "$record")
motion_pid=$(pgrep -f "wyang-player .* $owned_token$")
wait_for_exit "$pid"
wait_for_window player "$motion_pid"
if [[ "${WYANG_BENCHMARK:-0}" == 1 ]]; then
    for ((i=0; i<85; i++)); do
        [[ -f "player-$motion_pid.json" ]] && break
        sleep 1
    done
    cat "player-$motion_pid.json"
fi
if ./display accessibility-access; then
    ./display menu "$motion_pid" Pause
    ./display menu "$motion_pid" Resume
    ./display menu "$motion_pid" Stop
    echo "Exercised the status item's Pause, Resume and Stop"
else
    echo "Menu interaction unavailable with the current Accessibility permission"
    ./check stop "$display"
fi
wait_for_exit "$motion_pid"
./check idle "$display"
echo "Verified packaged editor and player, placement, failed and successful replacement, and Stop"
