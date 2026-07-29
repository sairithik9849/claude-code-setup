# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and applies globally across all projects.

## Platform

Development environment is **macOS with zsh**.

- Use the **Bash tool** for shell work — there is no PowerShell on this machine.
- macOS ships **BSD userland, not GNU**. `sed`, `date`, `grep`, `stat`, `find`, and `xargs` behave differently from Linux (e.g. BSD `sed -i` requires a backup-suffix argument: `sed -i ''`; BSD `date` flags differ from GNU `date`). Prefer the dedicated **Read / Edit / Grep / Glob** tools over shelling out to `sed`/`awk`/`find` — they sidestep this entirely.
- Don't assume GNU coreutils or Homebrew tools are installed. `jq` is available (the statusline depends on it); don't assume `gsed`, `gawk`, or GNU `coreutils` are present.
- `~` expands fine in zsh, but prefer absolute paths in scripts, hooks, and `settings.json` commands. Avoid `cd` inside a compound Bash command — it can trigger permission prompts; use absolute paths instead.
- When a command "should work" but doesn't, the first hypothesis is a **BSD-vs-GNU or PATH quirk** — not a logic bug. Investigate the environment before retrying with a variant.
- Statusline, hook scripts, and anything in `settings.json` that shells out are written in **bash** (see `~/.claude/statusline-command.sh`).

## Workflow Rules

- **Plan-first for multi-file or UI changes.** Before editing more than one file, or anything visible in the browser, present a plan via ExitPlanMode that lists: files to modify, what changes in each, and any existing behavior that must be preserved. Wait for approval before editing.
- **Analysis requests are not edit requests.** A question, a pasted spec, or "what would happen if…" is not authorization to touch files. Acknowledge and analyze first; start editing only after an explicit go-ahead (e.g. "do it", "yes", "go ahead").
- **Inventory existing interactions before integrating new components.** Before adding any component into an area that already has hover effects, animations, or pointer behavior, list every existing interaction and state explicitly how each will be preserved or intentionally changed.
- **No silent regressions.** Never revert styling, classes, or behavior to an earlier version as a side effect. If existing styles or behavior must change, say so explicitly.
- **Investigate environment before a second fix attempt.** If a shell/path/deps fix fails, stop iterating. List every assumption the first fix relied on (shell, available binaries, path conventions, escaping) and verify each before trying again.
- **Verify end-to-end before claiming done.** Type checks and linting verify code correctness, not feature correctness. If you cannot run or render the feature, say so explicitly rather than claiming it works.
- **Usage-aware visual MCP tools.** Screenshot/browser MCP tools (`claude-in-chrome`, Playwright, or any other snapshot/screenshot MCP) are token-heavy — page snapshots and screenshots can run thousands of tokens each. When the statusline's 5-hour usage is **above 50%**, state the current usage and ask before invoking any such tool. If the user has already authorized this class of tool this turn or session, don't re-ask.

## Coding Standards

- **Modularity & Single Responsibility:** Write highly modular, decoupled code. Functions and classes have a single responsibility. Extract complex logic into smaller, testable helper functions.
- **Defensive Programming:** Fail fast. Validate inputs at the boundaries, use early returns to avoid deep nesting, and never swallow errors silently. Catch specific exceptions and handle them explicitly.
- **Self-Documenting Code:** Rely on descriptive, unabbreviated naming over inline comments. Variables describe their data; functions describe their action.
- **Semantic Commentary:** Write comments to explain the *why* behind architectural decisions or non-obvious logic, never the *what*. If the *what* requires explanation, refactor for clarity instead.
- **State & Purity:** Favor pure functions and immutable data structures. Avoid global mutable state. When state management is necessary, keep it localized to the tightest possible scope.
- **No Magic Values:** Hardcoded numbers, string keys, and configuration URLs get extracted into named constants or environment variables.
