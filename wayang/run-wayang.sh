#!/usr/bin/env bash
set -e

# The editor reads .env from its working directory. Keep input paths relative
# to the directory the user launched from before switching to the project.
args=()
for arg in "$@"; do
    case "$arg" in
        /*|-*) args+=("$arg") ;;
        *)     args+=("$PWD/$arg") ;;
    esac
done

cd -- "$(dirname -- "$0")"
cargo build --release --locked --bin wyang-player
exec cargo run --release --locked --bin wyang -- "${args[@]}"
