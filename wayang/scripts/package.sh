#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
profile=${WYANG_BUILD_PROFILE:-release}
cargo build --locked --profile "$profile" --bins
target_dir=$(cargo metadata --format-version 1 --no-deps | python3 -c 'import json,sys;print(json.load(sys.stdin)["target_directory"])')
bin="$target_dir/$profile"
if [[ "$profile" = dev ]]; then bin="$target_dir/debug"; fi
mkdir -p dist
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
version=0.1.0
copy_docs() {
    mkdir -p "$1/specs" "$1/tests"
    cp example.env README.md "$1/"
    cp specs/001-spec-animated-wallpaper-gen.md "$1/specs/"
    cp tests/ACCEPTANCE.md "$1/tests/"
}
if [[ $(uname -s) = Darwin ]]; then
    app="$out/Wyang.app/Contents"
    mkdir -p "$app/MacOS" "$app/Resources"
    install -m755 "$bin/wyang" "$bin/wyang-player" "$app/MacOS/"
    cp macos/Info.plist "$app/Info.plist"
    copy_docs "$app/Resources"
    codesign --force --deep --sign - "$out/Wyang.app"
    ditto -c -k --norsrc --noextattr --keepParent "$out/Wyang.app" "dist/Wyang-$version-macOS-$(uname -m).zip"
else
    ext="$out/extension"
    mkdir -p "$ext/bin" "$ext/schemas" "$out/wyang"
    install -m755 "$bin/wyang-player" "$ext/bin/"
    cp gnome/extension.js gnome/metadata.json "$ext/"
    cp gnome/schemas/*.xml "$ext/schemas/"
    glib-compile-schemas --strict "$ext/schemas"
    (cd "$ext" && zip -qr "$out/wyang/wyang@local.shell-extension.zip" .)
    install -m755 "$bin/wyang" scripts/install-linux.sh "$out/wyang/"
    copy_docs "$out/wyang"
    tar -C "$out" -czf "dist/wyang-$version-linux-$(uname -m).tar.gz" wyang
    cp "$out/wyang/wyang@local.shell-extension.zip" dist/
fi
