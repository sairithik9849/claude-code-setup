#!/bin/bash
# Rings the terminal bell only if the turn ran long, so Ghostty's audible
# bell-features=system beep pings you for real agent runs, not quick replies.
THRESHOLD_SECONDS=20

INPUT=$(cat)

if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
START_FILE="/tmp/claude-turn-start-${SESSION_ID}"

if [ -f "$START_FILE" ]; then
  START=$(cat "$START_FILE")
  NOW=$(date +%s)
  ELAPSED=$((NOW - START))
  rm -f "$START_FILE"
  if [ "$ELAPSED" -ge "$THRESHOLD_SECONDS" ]; then
    printf '\a' > /dev/tty 2>/dev/null
  fi
fi

exit 0
