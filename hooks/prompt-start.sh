#!/bin/bash
# Stamps turn-start time, read by notify-if-long.sh on Stop to gate the bell on duration.
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
date +%s > "/tmp/claude-turn-start-${SESSION_ID}"
