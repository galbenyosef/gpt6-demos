#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
icons=target/Paco.iconset
mkdir -p "$icons"
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" resources/packs/paco/preview.png --out "$icons/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" resources/packs/paco/preview.png --out "$icons/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$icons" -o resources/AppIcon.icns
