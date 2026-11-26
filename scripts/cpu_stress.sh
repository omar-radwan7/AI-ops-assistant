#!/usr/bin/env bash
# Keeps every CPU core busy for N seconds (default 150) to trigger the HighCPU alert.
# Runs at the lowest priority, so the laptop stays usable.
set -euo pipefail
SECONDS_TO_RUN="${1:-150}"
CORES="$(nproc)"
echo "Loading ${CORES} cores for ${SECONDS_TO_RUN}s ..."
for _ in $(seq "$CORES"); do
  nice -n 19 timeout "$SECONDS_TO_RUN" sh -c 'while :; do :; done' &
done
wait
echo "Done."
