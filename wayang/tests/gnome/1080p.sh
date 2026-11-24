#!/usr/bin/env bash
# gnome-shell-test-tool defaults to a 1280x720 virtual monitor.
args=()
for argument do
  if [[ "$argument" = 1280x720 ]]; then argument=1920x1080; fi
  args+=("$argument")
done
exec "${args[@]}"
