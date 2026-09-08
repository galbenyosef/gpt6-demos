#!/usr/bin/env bash
# Run every demo with labelled logs and shared Ctrl+C cleanup.
set -euo pipefail
# Give each background job its own process group, including Bun's children.
set -m

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v bun >/dev/null 2>&1 || { echo 'Bun is required: https://bun.sh' >&2; exit 1; }
DEMOS=(edificio-europa infinicave tonada tarot-spead orbital-mechanics-laboratory)
PORTS=(3000 3001 3002 3003 3004)
for demo in "${DEMOS[@]}"; do
  if [[ ! -f "$ROOT_DIR/$demo/package.json" ]]; then
    echo "Missing project: $ROOT_DIR/$demo" >&2
    exit 1
  fi
done

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gpt6-demos.XXXXXX")"
SERVER_PIDS=()
LOGGER_PIDS=()
cleanup() {
  trap '' INT TERM
  echo
  echo 'Stopping all demos…'
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

for i in "${!DEMOS[@]}"; do
  demo="${DEMOS[$i]}"
  port="${PORTS[$i]}"
  fifo="$LOG_DIR/$demo"
  mkfifo "$fifo"
  (
    while IFS= read -r line || [[ -n "$line" ]]; do
      printf '[%s] %s\n' "$demo" "$line"
    done < "$fifo"
  ) &
  LOGGER_PIDS+=("$!")
  (
    cd -- "$ROOT_DIR/$demo"
    export PORT="$port"
    exec bun run dev
  ) > "$fifo" 2>&1 &
  SERVER_PIDS+=("$!")
  printf '%-28s http://localhost:%s\n' "$demo" "$port"
done
printf '\nPress Ctrl+C to stop all %s demos.\n\n' "${#DEMOS[@]}"

# Bash 3.2 (included with macOS) has no wait -n.
while true; do
  for i in "${!SERVER_PIDS[@]}"; do
    if ! kill -0 "${SERVER_PIDS[$i]}" 2>/dev/null; then
      status=0
      wait "${SERVER_PIDS[$i]}" || status=$?
      echo "${DEMOS[$i]} exited (status $status); stopping the other demos." >&2
      exit "$status"
    fi
  done
  sleep 1 &
  wait "$!" || true
done
