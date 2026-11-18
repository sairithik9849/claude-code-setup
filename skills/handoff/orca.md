# /handoff Mode 1 in Orca

Launch through Orca so it tracks the session: agent list, workspace card,
sleep and resume. `orca` below is the executable the `orca-cli` skill resolves.

The worktree is chosen before launch, so the brief's sign-off is "The plan is
approved. Read it, then implement."

First ask the user one question: new worktree, the main checkout, or an
existing worktree? Then launch with the matching command, passing the brief as
`--prompt` through a quoted heredoc, which keeps newlines and backticks intact:

- New worktree:

      orca worktree create --name "<short slug>" --no-parent --base-branch <base> --agent claude --surface terminal --json --prompt "$(cat <<'EOF'
      <brief>
      EOF
      )"

  `<base>` is always explicit: a local `origin/HEAD` goes stale when the
  remote's default branch changes, and Orca's own default follows it. Read the
  remote's default with `git ls-remote --symref origin HEAD` (offline, fall
  back to `origin/HEAD` and say so). Use `origin/<default>`, unless this branch holds
  commits the plan builds on that the default lacks
  (`git log origin/<default>..HEAD`): then use the current branch and say so in
  the brief.
- Main checkout: `orca agent launch --agent claude --surface terminal --json
  --worktree path:<main checkout> --prompt …`, the main checkout being the
  first entry of `git worktree list`.
- Existing worktree: pick one from `orca worktree list --json` and pass its
  whole `id` as `--worktree id:<id>` to the same `agent launch`.

`--surface terminal` keeps the new session a full Claude Code CLI session,
which the brief's `SendMessage` link and suggested skills rely on, whatever the
user's Chat | CLI setting. The tab opens in the background; the user switches
to it when ready.

Report the workspace, the agent handle (`outcome.handle`), and whether the
brief arrived: `prompt.outcome` of `journaled` or `handed-to-terminal`.

A failed launch follows the `orca-cli` retry rules: retry `runtime_unavailable`
for a few seconds, and after a lost reply re-issue the identical command with
`--retry-launch <operationId>` so the brief is delivered once. If it still
fails, report the exact error and stop; the brief is already in the
conversation for the user to reuse.
