---
name: model-chat
description: >
  Spawn 3+ Claude Code instances (default 3, up to 5+) into a shared debate room where they
  challenge, disagree, and converge across multiple rounds. Round-robin turns with parallel
  execution within each round; a rolling summarizer keeps context lean as rounds accumulate; a
  Devil's Advocate is forced in if consensus spikes too early; a synthesizer merges the final
  answer. This is the refine phase of a discover-then-refine pipeline — it can start from a raw
  topic, or be seeded from a stochastic-multi-agent-consensus artifact's "Positions
  (debate-ready)" block to debate out an already-discovered spread of positions. Triggers on
  "model chat", "multi-model debate", "agent debate", "spawn a chat room", "debate this",
  "refine positions", or /model-chat. Pass a topic or an artifact path as the argument. NOT for
  a single independent-draw scan (use stochastic-multi-agent-consensus) or an identical-prompt
  fan-out merged into one terminal answer (use fan-out-fan-in) — this skill's whole point is
  agents seeing and reacting to each other over multiple rounds.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Model Chat

Spawn 3 Claude Sonnet instances (default; override up to 5+) into a shared conversation room.
They debate a topic across 3 rounds (default; override up to 5+) using round-robin turns — all
agents respond in parallel each round, each seeing where the debate stands. A synthesizer agent
then merges the debate into a final answer.

**Why this works:** same model, different persona framings = systematically different failure
modes and blind spots. Surfacing disagreement between instances is more valuable than any single
instance's confident answer. Consensus across independently-reasoning instances filters
hallucination; divergences that survive debate reveal genuine judgment calls, not noise.

**No API key required.** Every "model instance" is a headless `claude -p` subprocess call
running on the machine's existing Claude Code subscription auth — not the `anthropic` SDK, no
`ANTHROPIC_API_KEY`, no `.venv`, no third-party packages. The orchestration script is Python 3
stdlib only.

## Distinction from neighboring skills

- **vs `stochastic-multi-agent-consensus`**: that skill is a single independent pass — role-diverse
  agents scan the space once, never see each other, aggregated to the mode. This skill is the
  next phase: agents debate over multiple rounds, seeing and reacting to each other.
- **vs `fan-out-fan-in`**: that skill fans out an identical prompt and merges into one terminal
  scored-union answer, single pass, no cross-agent awareness. This skill is stateful,
  multi-round, and the agents are aware of each other throughout.
- **Pipeline use**: run `stochastic-multi-agent-consensus` first to discover the spread of
  positions on a question, then hand its `stochastic-consensus-<slug>.md` artifact to this skill
  to debate those positions out. This skill also works standalone on a raw topic.

## Execution

### 1. Parse the request

Extract from the user's message:
- **Topic or artifact path** to debate — a raw question/topic, or a path to a
  `stochastic-consensus-<slug>.md` file from `stochastic-multi-agent-consensus` (auto-detected:
  an existing `.md` path seeds the debate from its `Positions (debate-ready)` block; anything
  else is treated as a raw topic).
- **Mode**: normal (default) or `--interactive` (prompts for a steering note before each round
  after the first).
- **Agent count**: default **3**, user can override (`--agents N`) — go up to 5+ (matching the
  reference's default) only for specific higher-stakes questions the user calls out.
- **Round count**: default **3**, user can override (`--rounds N`) — same 5+ opt-in logic.

### 2. Run the orchestration script

```bash
python3 /Users/sai/.claude/skills/model-chat/model_chat.py "<topic or artifact path>"
```

Optional flags:
- `--agents N` — number of debating agents (default 3; use 5 to match the full reference debate).
- `--rounds N` — number of debate rounds (default 3; use 5 to match the full reference debate).
- `--interactive` — prompt for a steering note before each round after the first.
- `--model M` — model for debating agents (default `sonnet`).
- `--summarizer-model M` — model for the rolling-context summarizer (default `haiku`, kept cheap
  since it runs every round).
- `--dissent-threshold F` — consensus level (0.0-1.0) above which a Devil's Advocate is forced
  into the next round (default `0.8`).

For interactive mode:

```bash
python3 /Users/sai/.claude/skills/model-chat/model_chat.py "<topic>" --interactive
```

### 3. Deliver results

The script streams the full debate to stdout in real time (each turn, plus per-round cost) and
saves to a timestamped subdirectory relative to the current working directory:
- `active/model-chat/<YYYYMMDD-HHMMSS>/conversation.json` — full structured transcript: every
  round, persona, turn, per-turn and per-round cost/token telemetry, and any
  `dissent_injected` markers.
- `active/model-chat/<YYYYMMDD-HHMMSS>/synthesis.md` — the final synthesized answer.
- `active/model-chat/latest` — symlink to the most recent run.

Present to the user:
- A brief summary of key agreements and disagreements.
- The synthesis (or a link to `synthesis.md`).
- Note any particularly interesting moments of debate — a stance reversal, a Devil's Advocate
  injection, an unresolved disagreement that survived to the final round.
- Total cost (`$X.XX`) so the user can see what the run spent against subscription quota.

## How it works internally

1. **Personas** — up to 5 named lenses (systems-thinker, pragmatist, edge-case-finder,
   ux-focused, contrarian; same roster as `stochastic-multi-agent-consensus` for continuity
   across the two phases), first N used. Beyond 5, generic `independent-thinker-N` personas fill
   remaining slots.
2. **Round-robin, parallel within a round** — each round, all live agents respond concurrently
   via `asyncio.gather` over `claude -p` subprocess calls; the round only advances once all
   replies are in.
3. **Dynamic context window (token-bloat guard)** — the full transcript is stored in
   `conversation.json`, but is **not** re-injected raw every round. Before each round after the
   first, a dedicated cheap-model instance (`--summarizer-model`, default `haiku`) condenses all
   prior rounds into `{agreements, unresolved conflicts, leading position, consensus level}`.
   Each agent's next prompt = that brief + the immediately preceding round verbatim (so live
   rebuttals stay sharp) — not the whole raw history. Keeps input tokens lean as rounds
   accumulate.
4. **Dissent injection (anti-groupthink)** — the summarizer's consensus-level estimate is
   checked before each non-final round; if it crosses `--dissent-threshold`, one agent slot for
   that round is forcibly replaced with a Devil's Advocate persona mandated to attack the
   current leading position. Prevents premature convergence; flagged in `conversation.json`.
5. **Synthesizer** — a final agent reads the entire transcript and produces a structured merged
   answer (Agreements / Unresolved disagreements / Recommendation).
6. **Interactive mode** — after each round (from round 2 on), prompts on stdin for an optional
   steering note that gets injected into the next round's prompt as a moderator note.
7. **Persona isolation** — every debate/summarizer/synthesizer subprocess call runs with
   `--safe-mode` (disables CLAUDE.md/skills/plugins/hooks) and `--tools ""` (no filesystem/bash
   access). This keeps each persona's voice free of the orchestrator's own house style (verified:
   without `--safe-mode`, personas leaked the orchestrator's global CLAUDE.md conventions into
   every turn) and keeps debate turns to pure reasoning, no side effects.

## Output files

Each run saves to `active/model-chat/<YYYYMMDD-HHMMSS>/`:

| File | Description |
|------|-------------|
| `conversation.json` | Full structured transcript: rounds, personas, turns, per-turn/per-round cost & token telemetry, dissent markers |
| `synthesis.md` | Final synthesized answer |

A `latest` symlink (`active/model-chat/latest`) always points to the most recent run. Previous
runs are preserved, not overwritten.

## Cost note

Each `claude -p` call carries normal Claude Code startup context against the subscription quota
(`--safe-mode` reduces this by skipping CLAUDE.md/skill/hook loading, but does not eliminate
base session cost). Default run = 3 agents × 3 rounds + summarizer calls (rounds 2-3) +
1 synthesizer ≈ 10 subprocess calls. The full reference-matching 5 agents × 5 rounds run is
roughly 26 calls — reserve `--agents 5 --rounds 5` for questions that specifically warrant it.

## Do not

- Do **not** re-derive positions from scratch when seeded from a `stochastic-multi-agent-consensus`
  artifact — parse and use its `Positions (debate-ready)` block as the round-1 starting point.
- Do **not** re-inject the full raw transcript every round — that's the token-bloat failure mode
  the rolling summarizer exists to prevent.
- Do **not** skip the dissent check — a debate that converges in round 1 without any Devil's
  Advocate pressure hasn't actually stress-tested the leading position.
- Do **not** run debate agents without `--safe-mode`/`--tools ""` — persona voices must stay
  clean of the orchestrator's own CLAUDE.md/hooks and must not have filesystem/bash access.
- Do **not** default to the 5-agent/5-round reference size — that's opt-in for specific
  higher-stakes cases; default is the cost-effective 3×3.

## Exit criteria (done when)

- N agents were spawned into a shared room and debated over the configured number of rounds,
  each round's replies generated in parallel and informed by the prior round.
- Rounds after the first used the rolling summarizer brief, not the raw full transcript, to
  build each agent's prompt.
- Consensus was checked each non-final round and a Devil's Advocate was injected whenever it
  crossed `--dissent-threshold`.
- A synthesizer produced a structured final answer (agreements, unresolved disagreements,
  recommendation).
- `conversation.json` (with per-round cost telemetry) and `synthesis.md` were written to a
  timestamped run directory, `latest` updated, and a tight inline summary with total cost shown.
