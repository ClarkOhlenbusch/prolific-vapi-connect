#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
PORT="${NOTIFY_PORT:-8085}"
HOST="${NOTIFY_HOST:-127.0.0.1}"

if [[ -z "$MODE" ]]; then
  echo "Usage: $0 done|question" >&2
  exit 2
fi

case "$MODE" in
  done|question) ;;
  *) echo "Unknown mode: $MODE (expected: done|question)" >&2; exit 2 ;;
esac

curl -fsS -X POST "http://${HOST}:${PORT}/notify?mode=${MODE}" >/dev/null

