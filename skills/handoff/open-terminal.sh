#!/bin/bash
# Opens a VS Code terminal attached to Claude background session $1, tab titled $2 (optional), via
# the local.claude-attach extension in ./vscode-extension. Prints one word for /handoff to relay:
#   opened       a tab in this window is attaching
#   requested    VS Code was asked to open one in its last-focused window (no confirmation comes back)
#   unavailable  nothing opened; the user runs `claude attach <id>` themselves
set -u

id=${1:-}
name=${2:-}
if [[ ! $id =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo unavailable
  exit 1
fi

# The extension only answers a caller descended from one of its own terminals, because a background
# session's env can carry the socket of whichever window started the Claude daemon.
pids=$$
p=$$
while p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ') && [[ -n $p && $p -gt 1 ]]; do
  pids+=",$p"
done

# Trying every window's socket is safe: a window answers 409 unless the pid chain runs through one of
# its own terminals, so only this one opens a tab. A terminal restored before the extension activated
# never gets $CLAUDE_ATTACH_SOCK, so the variable alone can miss this window.
dir=${TMPDIR:-/tmp}
for sock in "${CLAUDE_ATTACH_SOCK:-}" "${dir%/}"/claude-attach-*.sock; do
  [[ -S $sock ]] || continue
  if curl -sf --max-time 3 --unix-socket "$sock" -G http://localhost/attach \
    --data-urlencode "id=$id" --data-urlencode "cwd=$PWD" --data-urlencode "pids=$pids" --data-urlencode "name=$name" >/dev/null; then
    echo opened
    exit 0
  fi
done

# An empty TERM_PROGRAM means a background session: it can't tell where it's attached, so assume
# VS Code if it's running. Any other terminal app means the user isn't in VS Code.
# By bundle id: pgrep doesn't list VS Code's main process, and a name match would also catch other apps.
if [[ ${TERM_PROGRAM:-vscode} == vscode ]] &&
  [[ $(osascript -e 'application id "com.microsoft.VSCode" is running' 2>/dev/null) == true ]]; then
  cwd_uri=$(jq -rn --arg v "$PWD" '$v | @uri')
  name_uri=$(jq -rn --arg v "$name" '$v | @uri')
  if open "vscode://local.claude-attach/attach?id=$id&cwd=$cwd_uri&name=$name_uri"; then
    echo requested
    exit 0
  fi
fi

echo unavailable
