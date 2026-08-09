#!/bin/bash
# Pulls the live, canonical config from ~/.claude back into this repo.
# ~/.claude is where you actually edit; this repo is a manual backup/mirror.
# Run by hand after editing anything under the tracked paths below.
set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TRACKED_PATHS=(
  "CLAUDE.md"
  "settings.json"
  "statusline-command.sh"
  "skills/grill-me"
  "skills/model-chat"
  "skills/fan-out-fan-in"
  "skills/stochastic-multi-agent-consensus"
)

for path in "${TRACKED_PATHS[@]}"; do
  src="$CLAUDE_DIR/$path"
  dest="$REPO_DIR/$path"

  if [ ! -e "$src" ]; then
    echo "skip: $src does not exist" >&2
    continue
  fi

  rm -rf "$dest"
  mkdir -p "$(dirname "$dest")"
  cp -RP "$src" "$dest"

  if [ ! -e "$dest" ]; then
    echo "FAILED: $dest missing after sync" >&2
    exit 1
  fi
  echo "synced: $path"
done

echo "done"
