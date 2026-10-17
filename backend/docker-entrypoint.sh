#!/bin/sh
# Starts the Patchlane API under plain Docker or Pterodactyl (Wings).
#
# Wings runs the image as its own uid, mounts the server's storage at /home/container,
# and passes the allocated port in SERVER_PORT. Plain Docker uses the defaults.
set -e

PORT="${SERVER_PORT:-${PORT:-8000}}"

if [ -d /home/container ] && [ -w /home/container ]; then
    export HOME=/home/container
    export PATCHLANE_RUNS_DIR="${PATCHLANE_RUNS_DIR_OVERRIDE:-/home/container/runs}"
elif [ ! -w "${HOME:-/nonexistent}" ]; then
    export HOME=/tmp  # droid needs a writable home for its own state
fi

mkdir -p "$PATCHLANE_RUNS_DIR"
cd /app/backend

# One-off commands (e.g. `docker run image droid --version`, CI's pytest) run as given.
if [ "$#" -gt 0 ]; then
    exec "$@"
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 1 --timeout-graceful-shutdown 5
