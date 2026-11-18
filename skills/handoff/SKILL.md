---
name: handoff
description: Hand the current conversation off to another Claude Code session — one this skill launches, or one you name — as a brief in the conversation, not a file.
argument-hint: "[session name, or 'recent'] — blank launches a new session"
disable-model-invocation: true
---

Hand this session's work to another session so it can carry on. Compose a brief
from the conversation, say it here, and pass it to the other session. Reference
existing artifacts — plan, spec, ADR, PR, diff — by path or URL; the brief adds
only what they don't capture. Redact secrets: API keys, passwords, tokens,
personal data.

## The brief

Keep it short. Include only what a fresh session can't reconstruct from the
artifacts — assume it will read them.

1. What isn't written down — 2–4 sentences: rejected approaches, why a decision
   went the way it did, constraints raised in discussion. This is the part
   that's lost otherwise.
2. Pointers — the plan file, and any other live artifact: ADR, spec, open PR,
   branch name.
3. Suggested skills — which the next session should invoke, and when.
4. This session's name — read it from `ListAgents` ("This session is ..."). Tell
   the next session to message this one for the reasoning behind a decision
   rather than guess at it.
5. Sign-off — "The plan is approved. Read it, then ask me one question: work
   in a new worktree, the main checkout, or an existing worktree? Implement as
   soon as I answer." A handoff means the user already approved the plan; the
   next session is the implementer.

## Mode 1 — launch a new session (default)

Bare `/handoff`, or an argument naming what to focus on (anything that isn't a
session name or "recent"). This session's environment picks the launcher: Orca
when `TERM_PROGRAM` is `Orca` or `ORCA_WORKSPACE_ID` is set, otherwise
`claude --bg`. Orca stays running while the user works in VS Code, so whether
Orca is running says nothing about where they are.

In Orca, read [orca.md](orca.md) before composing the brief: it replaces the
sign-off and the launch below.

Otherwise launch a background session in the current repo:

    claude --bg --name "<short slug>" "$(cat <<'EOF'
    <brief>
    EOF
    )"

The quoted heredoc keeps newlines and backticks intact. Launch straight away —
the new session pauses on its worktree question, and the user answers it by
attaching. Then open a terminal attached to it, using the id `claude --bg`
printed:

    ~/.claude/skills/handoff/open-terminal.sh <id> "<short slug>"

Pass the same slug given to `--name`; it becomes the tab's title.

Report the session id and what the script printed:

- `opened` — a VS Code terminal tab named after the session is attached to it; it takes the
  session's name once the attach starts. The user clicks it when ready.
- `requested` — VS Code was asked to open one in its last-focused window. If no
  tab appears, the user runs `claude attach <id>`.
- `unavailable` — tell the user to run `claude attach <id>` when ready.

## Mode 2 — brief a running session

An argument that names a session, or says "recent" / "the open one". Run
`ListAgents`, show the candidate peers, let the user pick. Call out a target
that's busy (the message interrupts it), an offline Remote Control peer (won't
arrive until it reconnects), or a cloud session (can't reply).

Show the user the brief and the target, wait for approval, then `SendMessage`
the brief to that session.
