#!/usr/bin/env bash
set -euo pipefail

# Plays a short attention sound via a generated audio file.
# macOS: uses `say` to generate an AIFF file and `afplay` to play it.
# Fallback: terminal bell + printed message.

MODE="${1:-}"

if [[ -z "$MODE" ]]; then
  echo "Usage: $0 done|question" >&2
  exit 2
fi

PHRASE=""
case "$MODE" in
  done)
    PHRASE="I'm done."
    ;;
  question)
    PHRASE="I have a question."
    ;;
  *)
    echo "Unknown mode: $MODE (expected: done|question)" >&2
    exit 2
    ;;
esac

play_system_sound() {
  if command -v afplay >/dev/null 2>&1 && [[ -f /System/Library/Sounds/Ping.aiff ]]; then
    afplay /System/Library/Sounds/Ping.aiff >/dev/null 2>&1 || true
  fi
  if command -v osascript >/dev/null 2>&1; then
    # Best-effort system beep fallback.
    osascript -e 'beep 1' >/dev/null 2>&1 || true
  fi
}

if command -v say >/dev/null 2>&1 && command -v afplay >/dev/null 2>&1; then
  TMP_AUDIO="$(mktemp -t codex_notify.XXXXXX.aiff)"
  cleanup() { rm -f "$TMP_AUDIO"; }
  trap cleanup EXIT

  # `say` writes an audio file. We intentionally keep it short and simple.
  if say -o "$TMP_AUDIO" "$PHRASE" >/dev/null 2>&1; then
    afplay "$TMP_AUDIO" >/dev/null 2>&1 || play_system_sound
  else
    play_system_sound
  fi
  exit 0
fi

# Fallbacks for environments without macOS audio tooling.
printf '\a' || true
echo "$PHRASE"
