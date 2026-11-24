#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
install -Dm755 wyang "$HOME/.local/bin/wyang"
gnome-extensions install --force ./wyang@local.shell-extension.zip
mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/applications"
cat > "${XDG_DATA_HOME:-$HOME/.local/share}/applications/org.wyang.Editor.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Wyang
Comment=Animated wallpaper studio
Exec="$HOME/.local/bin/wyang"
Icon=preferences-desktop-wallpaper
Terminal=false
Categories=Graphics;Photography;
DESKTOP
if ! gnome-extensions enable wyang@local; then
    echo 'Log out and back in, then run gnome-extensions enable wyang@local.'
fi
