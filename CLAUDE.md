# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and applies globally across all projects.

## Platform

Development environment is **macOS with zsh**.

- Use the **Bash tool** for shell work — there is no PowerShell on this machine.
- macOS ships **BSD userland, not GNU**. `sed`, `date`, `grep`, `stat`, `find`, and `xargs` behave differently from Linux (e.g. BSD `sed -i` requires a backup-suffix argument: `sed -i ''`; BSD `date` flags differ from GNU `date`). Prefer the dedicated **Read / Edit / Grep / Glob** tools over shelling out to `sed`/`awk`/`find` — they sidestep this entirely.
- Homebrew is installed. `jq` is available (the statusline depends on it). Don't assume a specific brew package (`gsed`, `gawk`, GNU `coreutils`, etc.) is installed — check with `which`/`brew list` before relying on one.
- `~` expands fine in zsh, but prefer absolute paths in scripts, hooks, and `settings.json` commands. Avoid `cd` inside a compound Bash command — it can trigger permission prompts; use absolute paths instead.
- When a command "should work" but doesn't, the first hypothesis is a **BSD-vs-GNU or PATH quirk** — not a logic bug. Investigate the environment before retrying with a variant.
- Statusline, hook scripts, and anything in `settings.json` that shells out are written in **bash** (see `~/.claude/statusline-command.sh`).

## Workflow Rules

- **Plan before multi-file or UI changes.** Before editing more than one file, or anything visible in the UI, enter Plan Mode and present a plan via ExitPlanMode: files to modify, the change in each, existing behavior to preserve. Auto mode doesn't exempt this. Why: the plan is where misheard instructions and design calls get caught before code exists, and its file is what `/handoff` points at.
  - One approval per plan: a `/handoff` session or subagent carrying out an approved plan implements it directly, and returns to Plan Mode only when the work needs files or behavior the plan didn't name.
- **Analysis requests are not edit requests.** A question, a pasted spec, or "what would happen if…" is not authorization to touch files. Acknowledge and analyze first; start editing only after an explicit go-ahead (e.g. "do it", "yes", "go ahead").
- **Inventory existing interactions before integrating new components.** Before adding any component into an area that already has hover effects, animations, or pointer behavior, list every existing interaction and state explicitly how each will be preserved or intentionally changed.
- **No silent regressions.** Never revert styling, classes, or behavior to an earlier version as a side effect. If existing styles or behavior must change, say so explicitly.
- **Investigate environment before a second fix attempt.** If a shell/path/deps fix fails, stop iterating. List every assumption the first fix relied on (shell, available binaries, path conventions, escaping) and verify each before trying again.
- **Check docs, not memory, for versioned libraries.** When a third-party library/framework API may have changed since training, query Context7 for the installed version before writing code or making a second fix attempt. Skip for stdlib and stable APIs.
- **Verify end-to-end before claiming done.** Type checks and linting verify code correctness, not feature correctness. If you cannot run or render the feature, say so explicitly rather than claiming it works.

## Coding Standards

- **Semantic Commentary:** Write comments to explain the *why* behind architectural decisions or non-obvious logic, never the *what*. If the *what* requires explanation, refactor for clarity instead.

## Technical decision-making

When making technical decisions, don't give too much weight to development cost. You can write and modify code far faster than a human developer, but your cost estimates are anchored to human data (days/weeks/months) and therefore overstate the effort of the more robust option. Do not let that bias push you toward cheap solutions that are low-quality, not scalable, or hard to maintain. Choose the option that's best for the long-term health of the codebase and assume the implementation cost is low.
