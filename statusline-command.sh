#!/usr/bin/env bash
input=$(cat)

# Debug: capture raw JSON once so we can inspect actual field names
echo "$input" > /tmp/statusline-debug.json 2>/dev/null

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
# Handle both Unix (/) and Windows (\) path separators
folder=$(echo "$cwd" | sed 's|.*[/\\]||')

branch=$(git -C "$cwd" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null)

# .model may be a plain string or an object with display_name/id
model=$(echo "$input" | jq -r '
  if .model == null then "unknown"
  elif (.model | type) == "string" then .model
  else (.model.display_name // .model.id // "unknown")
  end
')

used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
input_tokens=$(echo "$input" | jq -r '.context_window.total_input_tokens // empty')

five_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
week_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')

five_resets_at=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
week_resets_at=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

now=$(date +%s)

# Formats seconds-until as "XdYh" (>=1 day) or "XhYm" or "Xm". Empty if already past.
time_until() {
  local resets_at="$1"
  [ -z "$resets_at" ] && return
  local secs_left=$((resets_at - now))
  [ "$secs_left" -le 0 ] && return
  local d=$((secs_left / 86400))
  local h=$(((secs_left % 86400) / 3600))
  local m=$(((secs_left % 3600) / 60))
  if [ "$d" -gt 0 ]; then
    printf '%dd%dh' "$d" "$h"
  elif [ "$h" -gt 0 ]; then
    printf '%dh%dm' "$h" "$m"
  else
    printf '%dm' "$m"
  fi
}

five_remaining=$(time_until "$five_resets_at")
week_remaining=$(time_until "$week_resets_at")

# Formats a token count as "61k" (rounded to nearest 1000), or raw digits under 1000.
format_tokens() {
  local n="$1"
  if [ "$n" -lt 1000 ]; then
    printf '%d' "$n"
  else
    printf '%dk' "$(((n + 500) / 1000))"
  fi
}

RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
YELLOW='\033[33m'
GREEN='\033[32m'
MAGENTA='\033[35m'
RED='\033[31m'

printf "${CYAN}${BOLD} %s${RESET}" "$folder"

if [ -n "$branch" ]; then
  printf "  ${YELLOW}%s${RESET}" "$branch"
fi

printf "  ${MAGENTA}%s${RESET}" "$model"

# Context bar — only show when data is actually present
if [ -n "$used" ]; then
  used_int=$(printf '%.0f' "$used")
  if [ "$used_int" -ge 80 ]; then
    bar_color="$RED"
  elif [ "$used_int" -ge 50 ]; then
    bar_color="$YELLOW"
  else
    bar_color="$GREEN"
  fi
  printf "  ${DIM}ctx${RESET} ${bar_color}%s%%${RESET}" "$used_int"
  if [ -n "$input_tokens" ]; then
    printf " ${bar_color}(%s)${RESET}" "$(format_tokens "$input_tokens")"
  fi
fi

# 5-hour plan — only show when the field is present in the payload
if [ -n "$five_pct" ]; then
  five_int=$(printf '%.0f' "$five_pct")
  if [ "$five_int" -ge 80 ]; then plan_color="$RED"
  elif [ "$five_int" -ge 50 ]; then plan_color="$YELLOW"
  else plan_color="$GREEN"; fi
  printf "  ${DIM}5h${RESET} ${plan_color}%s%%${RESET}" "$five_int"
  if [ -n "$five_remaining" ]; then
    printf " ${DIM}(%s)${RESET}" "$five_remaining"
  fi
fi

# 7-day plan — only show when the field is present in the payload
if [ -n "$week_pct" ]; then
  week_int=$(printf '%.0f' "$week_pct")
  if [ "$week_int" -ge 80 ]; then week_color="$RED"
  elif [ "$week_int" -ge 50 ]; then week_color="$YELLOW"
  else week_color="$GREEN"; fi
  printf "  ${DIM}7d${RESET} ${week_color}%s%%${RESET}" "$week_int"
  if [ -n "$week_remaining" ]; then
    printf " ${DIM}(%s)${RESET}" "$week_remaining"
  fi
fi

printf "\n"
