#!/usr/bin/env bash
# Agent-panel rows for Claude Code's `subagentStatusLine` setting.
# stdin: {columns, tasks[], ...}; stdout: one {"id","content"} JSON line per row we override.
# Any row we don't print keeps Claude Code's default rendering, so a jq failure degrades safely.
input=$(cat)

# Debug: capture raw JSON once so we can inspect actual field names
echo "$input" > /tmp/subagent-statusline-debug.json 2>/dev/null

# Real escape bytes (not printf-style '\033'), because content is passed through jq --arg as-is.
RESET=$'\033[0m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
CYAN=$'\033[36m'
YELLOW=$'\033[33m'
GREEN=$'\033[32m'
MAGENTA=$'\033[35m'
RED=$'\033[31m'

# Formats a token count as "61k" (rounded to nearest 1000), or raw digits under 1000.
format_tokens() {
  local n="$1"
  if [ "$n" -lt 1000 ]; then
    printf '%d' "$n"
  else
    printf '%dk' "$(((n + 500) / 1000))"
  fi
}

cols=$(echo "$input" | jq -r '.columns // 0 | floor' 2>/dev/null)
[ -z "$cols" ] && cols=0

# \x1f, not tab: tab is IFS whitespace, so `read` would merge empty fields (missing model/effort)
# and shift every later column.
echo "$input" | jq -r '
  .tasks[]? | [
    (.id | tostring),
    (.name // .agentType // "agent"),
    ((.model // "") | (capture("^claude-(?<f>[a-z]+)-(?<a>[0-9]+)-(?<b>[0-9]+)")
                        | (.f[:1] | ascii_upcase) + .f[1:] + " " + .a + "." + .b) // .),
    ((.effort // "") | tostring),
    (.tokenCount // 0 | floor | tostring),
    ((.contextWindowSize // "") | tostring),
    (.cwd // ""),
    (.status // ""),
    ((.label // .description // "") | gsub("[\n\r\u001f]"; " "))
  ] | join("\u001f")' 2>/dev/null |
while IFS=$'\x1f' read -r id name model effort tokens size cwd status label; do
  # `plain` mirrors `row` without ANSI codes so the label can be cut to the real visible width.
  row="${BOLD}${CYAN}${name}${RESET}"
  plain="$name"

  if [ -n "$model" ]; then
    row+="  ${MAGENTA}${model}${RESET}"
    plain+="  $model"
  fi
  if [ -n "$effort" ]; then
    row+=" ${DIM}${effort}${RESET}"
    plain+=" $effort"
  fi

  tk=$(format_tokens "$tokens")
  if [ -n "$size" ] && [ "$size" -gt 0 ] 2>/dev/null; then
    pct=$((tokens * 100 / size))
    if [ "$pct" -ge 80 ]; then ctx_color="$RED"
    elif [ "$pct" -ge 50 ]; then ctx_color="$YELLOW"
    else ctx_color="$GREEN"; fi
    row+="  ${DIM}ctx${RESET} ${ctx_color}${pct}% (${tk})${RESET}"
    plain+="  ctx ${pct}% (${tk})"
  else
    row+="  ${DIM}ctx${RESET} (${tk})"
    plain+="  ctx (${tk})"
  fi

  if [ -n "$cwd" ]; then
    branch=$(git -C "$cwd" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ -n "$branch" ]; then
      row+="  ${YELLOW}${branch}${RESET}"
      plain+="  $branch"
    fi
  fi

  if [ -n "$status" ] && [ "$status" != "running" ]; then
    row+="  ${DIM}${status}${RESET}"
    plain+="  $status"
  fi

  # Label goes last so it's the only thing truncated; dropped when too little room remains.
  # Measured in jq, not ${#var}: bash 3.2 counts bytes under a C locale and can split a UTF-8 char.
  jq -nc --arg id "$id" --arg row "$row" --arg plain "$plain" --arg label "$label" \
    --argjson cols "$cols" --arg dim "$DIM" --arg reset "$RESET" '
    ($cols - ($plain | length) - 3) as $avail
    | (if $label == "" then ""
       elif $cols <= 0 then $label
       elif $avail < 8 then ""
       elif ($label | length) > $avail then $label[:$avail - 1] + "…"
       else $label end) as $l
    | {id: $id, content: ($row + (if $l == "" then "" else " " + $dim + "· " + $l + $reset end))}'
done
