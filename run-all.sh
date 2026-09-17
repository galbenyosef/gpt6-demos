#!/usr/bin/env bash
# Run every demo and both portals with labelled logs and shared Ctrl+C cleanup.
set -euo pipefail
# Give each background job its own process group, including Bun's children.
set -m

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v bun >/dev/null 2>&1 || { echo 'Bun is required: https://bun.sh' >&2; exit 1; }
DEMOS=(edificio-europa infinicave tonada tarot-spead orbital-mechanics-laboratory digital-logic-laboratory flip-slop codexcanvas assemblavatar one-more-match)
# Europa imports shared Crosstalk source, whose dependencies live in cross-talk/.
INSTALL_PROJECTS=(cross-talk "${DEMOS[@]}")
PORTS=(3001 3002 3003 3004 3005 3006 3007 3008 3009 3010)
PORTAL_PORT=3000
# Plain original portal: http://localhost:3000/
# New preview gallery:   http://localhost:3090/portal/
PREVIEW_PORT=3090
SERVICES=("${DEMOS[@]}" portal portal-preview)
SERVICE_PORTS=("${PORTS[@]}" "$PORTAL_PORT" "$PREVIEW_PORT")
for project in "${INSTALL_PROJECTS[@]}"; do
  if [[ ! -f "$ROOT_DIR/$project/package.json" ]]; then
    echo "Missing project: $ROOT_DIR/$project" >&2
    exit 1
  fi
done

for asset in index.html portal-server.ts portal/index.html portal/portal.css portal/portal.js; do
  if [[ ! -f "$ROOT_DIR/$asset" ]]; then
    echo "Missing portal file: $ROOT_DIR/$asset" >&2
    exit 1
  fi
done

# Let Bun check the dependency tree, including partially installed node_modules.
# Complete every install before starting any servers; keep checked-in versions.
for project in "${INSTALL_PROJECTS[@]}"; do
  printf '[%s] Checking/installing dependencies…\n' "$project"
  if ! (cd -- "$ROOT_DIR/$project" && bun install --frozen-lockfile); then
    printf '[%s] Dependency installation failed; no servers started.\n' "$project" >&2
    exit 1
  fi
done

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gpt6-demos.XXXXXX")"
SERVER_PIDS=()
LOGGER_PIDS=()
cleanup() {
  trap '' INT TERM
  echo
  echo 'Stopping all demos and both portals…'
  for pid in "${SERVER_PIDS[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
  for pid in "${LOGGER_PIDS[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  rm -rf -- "$LOG_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for i in "${!SERVICES[@]}"; do
  demo="${SERVICES[$i]}"
  port="${SERVICE_PORTS[$i]}"
  fifo="$LOG_DIR/$demo"
  mkfifo "$fifo"
  (
    while IFS= read -r line || [[ -n "$line" ]]; do
      printf '[%s] %s\n' "$demo" "$line"
    done < "$fifo"
  ) &
  LOGGER_PIDS+=("$!")
  (
    export PORT="$port"
    if [[ "$demo" == portal || "$demo" == portal-preview ]]; then
      cd -- "$ROOT_DIR"
      exec bun run portal-server.ts
    else
      cd -- "$ROOT_DIR/$demo"
      if [[ "$demo" == assemblavatar ]]; then
        export ASSEMBLAVATAR_PORT="$port"
      fi
      if [[ "$demo" == one-more-match ]]; then
        exec bun run dev:web
      fi
      exec bun run dev
    fi
  ) > "$fifo" 2>&1 &
  SERVER_PIDS+=("$!")
  if [[ "$demo" == portal ]]; then
    printf '%-28s http://localhost:%s/\n' 'Plain portal (original)' "$port"
  elif [[ "$demo" == portal-preview ]]; then
    printf '%-28s http://localhost:%s/portal/\n' 'Preview portal (new)' "$port"
  else
    printf '%-28s http://localhost:%s\n' "$demo" "$port"
  fi
done
printf '\nPortal summary:\n'
printf '  Plain, original portal: http://localhost:%s/\n' "$PORTAL_PORT"
printf '    Simple gallery; cards link directly to the demo apps.\n'
printf '  New preview portal:    http://localhost:%s/portal/\n' "$PREVIEW_PORT"
printf '    Cards open descriptions and in-page YouTube previews.\n'
printf '    Demo titles and Open demo links launch apps in a new tab.\n'
printf '\nPress Ctrl+C to stop all %s demos and both portals.\n\n' "${#DEMOS[@]}"

# Bash 3.2 (included with macOS) has no wait -n.
while true; do
  for i in "${!SERVER_PIDS[@]}"; do
    if ! kill -0 "${SERVER_PIDS[$i]}" 2>/dev/null; then
      status=0
      wait "${SERVER_PIDS[$i]}" || status=$?
      echo "${SERVICES[$i]} exited (status $status); stopping all services." >&2
      exit "$status"
    fi
  done
  sleep 1 &
  wait "$!" || true
done

# Portal quick reference:
# http://localhost:3000/        — plain, original gallery with direct app links.
# http://localhost:3090/portal/ — new gallery with descriptions and YouTube previews.
# In the new gallery, demo titles and Open demo links open apps in a new tab.
# Both portals start with this script; Ctrl+C stops them and all ten demos.
