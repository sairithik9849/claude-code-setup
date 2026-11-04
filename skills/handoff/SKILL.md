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
5. Sign-off — "Read the plan, play it back to me so I can check your
   understanding, then wait." The playback is the user's checkpoint before the
   session touches files.

## Mode 1 — launch a new session (default)

Bare `/handoff`, or an argument naming what to focus on (anything that isn't a
session name or "recent"). Launch a background session in the current repo:

    claude --bg --name "<short slug>" "$(cat <<'EOF'
    <brief>
    EOF
    )"

The quoted heredoc keeps newlines and backticks intact. Report the session id it
prints; tell the user to run `claude attach <id>` when ready. Launch straight
away — the sign-off makes the new session pause for review, so the user checks
the brief by attaching.

## Mode 2 — brief a running session

An argument that names a session, or says "recent" / "the open one". Run
`ListAgents`, show the candidate peers, let the user pick. Call out a target
that's busy (the message interrupts it), an offline Remote Control peer (won't
arrive until it reconnects), or a cloud session (can't reply).

Show the user the brief and the target, wait for approval, then `SendMessage`
the brief to that session.
