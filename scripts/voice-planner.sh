#!/usr/bin/env bash
set -euo pipefail

PORT="${VOICE_PLANNER_PORT:-8090}"
HOST="${VOICE_PLANNER_HOST:-127.0.0.1}"

export VOICE_PLANNER_ENABLE_CODEX="${VOICE_PLANNER_ENABLE_CODEX:-1}"
export VOICE_PLANNER_PORT="$PORT"
export VOICE_PLANNER_HOST="$HOST"

echo "Starting voice planner on http://${HOST}:${PORT}"
echo "Codex enabled: ${VOICE_PLANNER_ENABLE_CODEX}"
node scripts/voice-planner-server.mjs

