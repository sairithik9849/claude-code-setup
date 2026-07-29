# claude-code-setup

The durable, hand-authored layer of my [Claude Code](https://claude.com/claude-code) config — global instructions, settings, statusline, and a handful of custom skills. Everything here is symlinked back into `~/.claude` so Claude Code picks it up exactly as if it lived there directly, because it does — the real files just happen to live in this repo instead.

Session transcripts, memory, caches, and installed plugin/marketplace clones are **not** here on purpose — see [What's not tracked](#whats-not-tracked).

## Current inventory

| Repo path | Symlinked to | What it is |
|---|---|---|
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | Global instructions applied across all projects (platform notes, workflow rules, coding standards) |
| `settings.json` | `~/.claude/settings.json` | Model, statusline, theme, and enabled plugins/marketplaces |
| `statusline-command.sh` | `~/.claude/statusline-command.sh` | Custom statusline: folder, git branch, model, context %, 5h/7d rate limit usage |
| `skills/grill-me/` | `~/.claude/skills/grill-me` | Interviews you about a plan/design until every branch is resolved, before any implementation starts |
| `skills/fan-out-fan-in/` | `~/.claude/skills/fan-out-fan-in` | Fans an open-ended question out to 5 independent researchers (4 Sonnet + 1 cross-model), merges into one answer |
| `skills/model-chat/` | `~/.claude/skills/model-chat` | Spawns 3+ Claude Code instances into a multi-round debate room that challenges and converges on an answer |
| `skills/stochastic-multi-agent-consensus/` | `~/.claude/skills/stochastic-multi-agent-consensus` | Spawns N agents with distinct mental-model lenses to scan a decision space in one pass and cluster to consensus |

## How the symlinks work

Real content lives in this repo. `~/.claude` holds symlinks pointing here, and Claude Code follows them transparently — including files that hardcode their own `~/.claude` path, like `model-chat/model_chat.py`, which `SKILL.md` invokes as `python3 /Users/sai/.claude/skills/model-chat/model_chat.py`. That path still resolves because the symlink makes it the same file.

## Recreating the links

On a fresh machine, or if a symlink ever gets deleted by accident:

```bash
git clone https://github.com/sairithik9849/claude-code-setup.git ~/claude-code-setup
REPO=~/claude-code-setup
CLAUDE=~/.claude

ln -s "$REPO/CLAUDE.md"              "$CLAUDE/CLAUDE.md"
ln -s "$REPO/settings.json"          "$CLAUDE/settings.json"
ln -s "$REPO/statusline-command.sh"  "$CLAUDE/statusline-command.sh"

for skill in grill-me fan-out-fan-in model-chat stochastic-multi-agent-consensus; do
  ln -s "$REPO/skills/$skill" "$CLAUDE/skills/$skill"
done
```

## Adding something new

Move the real file/folder into this repo, then symlink it back to where Claude Code expects it — same pattern as above:

```bash
mv ~/.claude/skills/some-new-skill ~/claude-code-setup/skills/some-new-skill
ln -s ~/claude-code-setup/skills/some-new-skill ~/.claude/skills/some-new-skill
```

Then `git add`, commit, push whenever you feel like it.

## Syncing

Fully manual — no hooks, no auto-commit. Editing `~/.claude/CLAUDE.md` edits this repo's `CLAUDE.md` directly (it's the same file via symlink), so changes show up under `git status` here with no copying step. Push just what you want, when you want:

```bash
cd ~/claude-code-setup
git add CLAUDE.md        # or whatever you actually changed
git commit -m "..."
git push
```

## What's not tracked

- **`projects/`, `sessions/`, `history.jsonl`, `file-history/`, `shell-snapshots/`, `paste-cache/`** — session transcripts and runtime state. This repo is public; these should never end up in it.
- **`plugins/`** — clones of marketplace repos (`claude-plugins-official`, `ponytail`), fully reproducible from the `enabledPlugins`/`extraKnownMarketplaces` keys already in `settings.json`. Re-fetched automatically by Claude Code.
- **Third-party skills** (`banner-design`, `brand`, `design`, `design-system`, `slides`, `ui-styling`, `ui-ux-pro-max`, `stop-slop`) — downloaded packs (a bulk "claudekit" design bundle, and `stop-slop` by Hardik Pandya), not authored here. Re-obtainable from their original sources; no reason to vendor them into this repo.
