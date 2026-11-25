#!/usr/bin/env bash
# Exercise the packaged agent on a signed-in Mac, using an independent test
# identity and a temporary Application Support directory. Does not log out.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/package.sh
cargo build --release --locked --example check_display
target=$(cargo metadata --format-version 1 --no-deps | python3 -c 'import json,sys; print(json.load(sys.stdin)["target_directory"])')
version=$(plutil -extract CFBundleShortVersionString raw macos/Info.plist)
out=$(mktemp -d "${TMPDIR:-/tmp}/wyang-login.XXXXXX")
out=$(cd "$out" && pwd -P)
label="org.wyang.LoginTest.$(uuidgen)"
ditto -x -k "dist/Wyang-$version-macOS-$(uname -m).zip" "$out"
app="$out/Wyang.app/Contents"
codesign --verify --deep --strict "$out/Wyang.app"
export CFFIXED_USER_HOME="$out/test-user"
mkdir -p "$CFFIXED_USER_HOME"
plutil -replace CFBundleIdentifier -string "$label" "$app/Info.plist"
agent="$app/Library/LaunchAgents/$label.restore.plist"
mv "$app/Library/LaunchAgents/org.wyang.Editor.restore.plist" "$agent"
plutil -replace Label -string "$label.restore" "$agent"
plutil -insert EnvironmentVariables -dictionary "$agent"
plutil -insert EnvironmentVariables.CFFIXED_USER_HOME -string "$CFFIXED_USER_HOME" "$agent"
check="$app/MacOS/check_display"
cp "$target/release/examples/check_display" "$check"
codesign --force --deep --sign - "$out/Wyang.app"
clang -fobjc-arc -framework AppKit -framework CoreGraphics -framework ApplicationServices tests/macos/display.m -o "$out/display"
root=$("$check" playback-root)
[[ "$root" == "$CFFIXED_USER_HOME/Library/Application Support/wyang/scenes" ]]
state="${root%/scenes}/players/playback.json"
sys="$CFFIXED_USER_HOME/Library/Application Support/com.apple.wallpaper/Store/Index.plist"
mkdir -p "$(dirname "$sys")"
set_wallpaper() {
    python3 - "$sys" "$1" <<'PY'
import plistlib,sys
from pathlib import Path
p=Path(sys.argv[1])
tmp=p.with_suffix('.tmp')
tmp.write_bytes(plistlib.dumps({'AllSpacesAndDisplays':{'Desktop':{'Content':{'Choices':[{'Provider':sys.argv[2]}]}}}}))
tmp.replace(p)
PY
}
set_wallpaper initial
read -r display _ < <("$out/display")
uuid=$("$out/display" uuid)
token() { plutil -extract "displays.$uuid.token" raw "$state"; }
wait_active() {
    for ((i=0;i<100;i++)); do
        if "$check" active "$display" 2>/dev/null; then return 0; fi
        sleep .15
    done
    return 1
}
# Terminate only the player identified by the fixture's private lease.
end_session() {
    local t pid
    t=$(token)
    pid=$(pgrep -f "wyang-player .* $t$")
    kill "$pid"
    for ((i=0;i<50;i++)); do
        if ! kill -0 "$pid" 2>/dev/null && "$check" idle "$display" 2>/dev/null; then return 0; fi
        sleep .1
    done
    echo "Test player $pid ended but display $display still reports active (lease $t, current $(token))" >&2
    return 1
}
job="gui/$(id -u)/$label.restore"
wait_job_idle() {
    for ((i=0;i<120;i++)); do
        if launchctl print "$job" | awk '/^[[:space:]]*state = / { if (!seen++) idle=($0 ~ /not running/) } END {exit !idle}'; then
            return 0
        fi
        sleep .15
    done
    launchctl print "$job" | head -20 >&2
    return 1
}

editor_pid=
cleanup() {
    if [[ -n "$editor_pid" ]]; then kill "$editor_pid" 2>/dev/null || true; fi
    "$check" stop "$display" >/dev/null 2>&1 || true
    "$check" login-disable >/dev/null 2>&1 || true
}
trap cleanup EXIT
echo "Isolated login test files: $out"
echo "Fresh bundle registration: $("$check" login-status)"
[[ "$("$check" login-status)" == Off ]]
"$check" motion "$display" -
first=$(token)
echo "Registering test launch agent"
if "$out/display" accessibility-access; then
    "$app/MacOS/wyang" >"$out/editor.log" 2>&1 &
    editor_pid=$!
    "$out/display" enable-login "$editor_pid"
    for ((i=0;i<50;i++)); do
        [[ "$("$check" login-status)" == Enabled ]] && break
        sleep .2
    done
    "$out/display" quit "$editor_pid"
    wait "$editor_pid"
    editor_pid=
    echo "Enabled through the packaged editor checkbox and closed the editor"
else
    "$check" login-enable
fi
status=$("$check" login-status)
if [[ "$status" != Enabled ]]; then
    echo "macOS reported $status for the isolated login item" >&2
    exit 1
fi
[[ "$(token)" == "$first" ]]
[[ "$(plutil -extract "displays.$uuid.resume" raw "$state")" == true ]]
# Simulate the loss of the player process at logout. launchd starts the same
# packaged executable, in the same GUI domain, that a fresh login would use.
wait_job_idle
end_session
# Simulate the numeric ID changing across startup, retaining identical artwork
# and settings and the fixture display's stable UUID.
absent=$(uuidgen)
python3 - "$root" "$state" "$uuid" "$absent" <<'PYTEST'
from pathlib import Path
import hashlib, json, shutil, sys
root, path = map(Path, sys.argv[1:3])
registry = json.loads(path.read_bytes())
choice = registry["displays"][sys.argv[3]]
source = root / choice["scene"]
scene = json.loads((source / "scene.json").read_bytes())
scene["display"] = "424242"
data = json.dumps(scene, separators=(",", ":")).encode()
new_id = hashlib.sha256(data).hexdigest()
shutil.copytree(source, root / new_id)
(root / new_id / "scene.json").write_bytes(data)
choice["scene"] = new_id
registry["displays"][sys.argv[4]] = choice.copy()
path.write_text(json.dumps(registry))
PYTEST
expected_scene=$(plutil -extract "displays.$uuid.scene" raw "$state")
echo "Starting the registered job through launchd"
launchctl kickstart "$job"
wait_active
wait_job_idle
restored=$(token)
[[ "$(plutil -extract "displays.$absent.token" raw "$state")" == "$first" ]]
# This fixture was absent throughout startup. The present display alone was restored.
plutil -remove "displays.$absent" "$state" -o "$out/present.plist"
plutil -convert json -o "$out/present.json" "$out/present.plist"
mv "$out/present.json" "$state"
[[ "$restored" != "$first" ]]
[[ "$(plutil -extract "displays.$uuid.scene" raw "$state")" == "$expected_scene" ]]
restored_pid=$(pgrep -f "wyang-player .* $restored$")
for ((i=0;i<30;i++)); do
    "$out/display" player "$restored_pid" >/dev/null 2>&1 && break
    sleep .1
done
"$out/display" player "$restored_pid" >/dev/null
"$app/MacOS/wyang" --restore-wallpapers
[[ "$(token)" == "$restored" ]]
"$check" invalid "$display"
[[ "$(token)" == "$restored" ]]
end_session
echo "Checking a corrupt snapshot"
manifest="$root/$expected_scene/scene.json"
mv "$manifest" "$out/original.json"
echo '{}' > "$manifest"
"$app/MacOS/wyang" --restore-wallpapers
"$check" idle "$display"
mv "$out/original.json" "$manifest"
"$app/MacOS/wyang" --restore-wallpapers
wait_active
end_session
echo "Checking the native wallpaper override"
set_wallpaper replacement
"$app/MacOS/wyang" --restore-wallpapers
"$check" idle "$display"
if token >/dev/null 2>&1; then exit 1; fi
"$check" motion "$display" -
if "$out/display" accessibility-access; then
    "$out/display" menu "$(pgrep -f "wyang-player .* $(token)$")" Stop
    for ((i=0;i<30;i++)); do
        "$check" idle "$display" 2>/dev/null && break
        sleep .1
    done
else
    "$check" stop "$display"
fi
"$app/MacOS/wyang" --restore-wallpapers
"$check" idle "$display"
"$check" motion "$display" -
echo "Disabling login restoration while playback is running"
"$check" login-disable
"$check" active "$display"
end_session
"$app/MacOS/wyang" --restore-wallpapers
"$check" idle "$display"
[[ "$("$check" login-status)" == Off ]]
if launchctl print "$job" >/dev/null 2>&1; then
    echo 'The test agent is still registered' >&2
    exit 1
fi
echo 'Verified registration, display ID change, launchd restore, duplicate start, corrupt snapshot, failed replacement, system choice, Stop and disable.'
