#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export MACOSX_DEPLOYMENT_TARGET=13.0
cargo build --release --locked -p notavirus-app
mkdir -p dist
staging=$(mktemp -d "$PWD/dist/.bundle.XXXXXX")
# Only this script's generated staging directory is removed, including the old
# generated bundle after its verified replacement is in place.
trap 'rm -rf "$staging"' EXIT HUP INT TERM
bundle="$staging/NotAVirus.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
cp target/release/notavirus "$bundle/Contents/MacOS/notavirus"
cp resources/Info.plist "$bundle/Contents/Info.plist"
cp -R resources/packs "$bundle/Contents/Resources/"
cp resources/AppIcon.icns "$bundle/Contents/Resources/"
cp ../LICENSE.md "$bundle/Contents/Resources/LICENSE.md"
printf APPL???? > "$bundle/Contents/PkgInfo"
codesign --sign - --force --deep "$bundle"
codesign --verify --deep --strict "$bundle"
if [ -e dist/NotAVirus.app ]; then
    mv dist/NotAVirus.app "$staging/previous.app"
fi
mv "$bundle" dist/NotAVirus.app
printf 'Built %s/dist/NotAVirus.app\n' "$PWD"
