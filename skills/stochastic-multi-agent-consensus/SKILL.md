---
name: stochastic-multi-agent-consensus
description: Spawn N agents (default 5), each given a distinct role/mental-model lens (Conservative Expert, First-Principles Thinker, Disruptive Contrarian, Pragmatic Operator, Systems Thinker), to independently scan the search space for a question and surface a spectrum of solutions from low-hanging fruit to high-variance outliers. The orchestrator clusters the results and aggregates to the statistical mode (frequency-weighted consensus) in a single pass — no debate, no rounds. Use for decision-making, ranking options, strategic analysis, or any problem where you want a wide, high-variance discovery scan. Triggers on "consensus", "stochastic consensus", "poll agents", "spawn N agents to analyze", "discover solutions", "scan the search space", "multi-agent vote", "what do N agents think", "get multiple opinions", or "/stochastic-multi-agent-consensus". Produces a debate-ready artifact of structured positions. NOT for simple factual lookups, single-answer questions, or code edits — those don't need a panel. For an identical-prompt fan-out merged into a single terminal answer (with a cross-model researcher), use fan-out-fan-in instead. For stateful multi-round debate where agents challenge and revise each other's positions, use the model-chat refine skill on this skill's output artifact — that debate loop lives there, not here.
allowed-tools: Read, Grep, Glob, Bash, Agent, Write
---

# Stochastic Multi-Agent Consensus

You are the **orchestrator**. You spawn a role-diverse panel of agents on the same
question — each agent reasoning through a different mental-model lens — then aggregate
their independent answers to the **statistical mode** in a single pass. You do all the
clustering, mode-counting, and tiering yourself — you never spawn an aggregator or
synthesizer agent.

This is a **discovery and filtering tool only**. It does not debate. It scans wide,
counts what recurs, and hands off a structured artifact for a later refine phase.

## Distinction from neighboring skills

- **vs `fan-out-fan-in`**: that skill sends the *identical* prompt to all agents (plus
  one cross-model researcher) and merges everything into one terminal scored-union
  answer. This skill sends **role-differentiated** prompts — each agent argues from a
  distinct lens — specifically to widen variance before any aggregation happens, and its
  output is a mode/frequency read, not a terminal recommendation.
- **vs the `model-chat` refine skill**: stateful, multi-round debate — agents see each
  other's reasoning and revise their stance over time — happens there, not here. This
  skill produces the debate's **starting positions** (see the Positions block below) and
  stops. Don't try to make this skill argue with itself.

## Panel composition

- **N Sonnet agents** (default **5**), `Agent` tool, `subagent_type: "general-purpose"`,
  `model: "sonnet"`, spawned in the **background** in a single message so they run in
  parallel.
- **Claude-only.** No cross-model agent — diversity here comes from role lenses, not
  model family. If cross-model diversity is what's wanted, use `fan-out-fan-in`.
- **Single pass.** Agents are not resumed or reused. No stable-name-for-resume
  requirement, no `SendMessage`.

## Roles roster

Assign one distinct lens per agent, in order, up to N. Default roster:

1. **Conservative Expert** — favors proven, low-risk, well-precedented approaches.
2. **First-Principles Thinker** — ignores convention, rederives the answer from
   fundamentals.
3. **Disruptive Contrarian** — actively argues against the obvious answer; surfaces what
   everyone else would miss.
4. **Pragmatic Operator** — optimizes for what ships fastest with the least effort/risk
   given real-world constraints.
5. **Systems / Second-Order Thinker** — traces downstream effects, feedback loops, and
   interactions the other lenses ignore.

If N > 5, the orchestrator may add further question-appropriate lenses, but each added
lens must be **meaningfully divergent** from the others — never add a second agent with
a near-duplicate lens just to hit a count. If N < 5, drop from the bottom of the list.

## Arguments

Invocation: `/stochastic-multi-agent-consensus [count] <question>`.

- Leading integer overrides the agent count. Example:
  `/stochastic-multi-agent-consensus 8 what's the best caching strategy here` → 8 agents.
- Otherwise the whole argument is the question and count defaults to **5**.

## Procedure

### Step 0 — Pre-flight (clarify only if genuinely ambiguous)

A run here costs N agents — expensive to spend on a misread question. If the question is
clear, proceed straight to Step 1. Clarify only when it's genuinely ambiguous or reads
multiple distinct ways.

### Step 1 — Build per-agent prompts

Same question core for every agent, but each prompt is customized with that agent's
role lens. Each prompt must:

1. State the exact question.
2. Assign the agent's lens explicitly and instruct it to reason **through that lens**,
   not to hedge toward a generic, safe-sounding answer.
3. Ask for a **set of distinct positions**, each with: a one-line claim, the reasoning
   behind it, the agent's own confidence (high/medium/low), and any assumptions it's
   making.
4. Invite contrarian or non-obvious angles explicitly, even (especially) for
   non-contrarian lenses.

### Step 2 — Fan-out

In **one** message, spawn all N agents in the background, each with its role-customized
prompt. Tell the user the panel size and roles in play.

### Step 3 — Aggregate (orchestrator, inline — no extra agent)

You already hold all N outputs. Map them to thematic clusters and count the mode
yourself — do not spawn an aggregator. For each cluster, note which agents (and which
roles) hold it, and their stated confidence. Frequency (vote count) is the primary
signal; stated confidence and reasoning strength are secondary.

### Step 4 — Tier (orchestrator, inline — no synthesizer agent)

Score and tier every cluster:

1. **Consensus (mode)** — the highest-frequency cluster(s). Confidence scored by vote
   count first, agent-stated confidence and reasoning strength second.
2. **Secondary signals** — mid-frequency clusters that didn't hit the mode but recurred.
3. **Wildcard** — single-agent or low-frequency positions. **Never drop these for being
   rare.** They get their own dedicated section, kept and flagged, scored on their own
   merits — this is where high-variance, non-obvious ideas live.
4. **Ties** in the mode are broken by strength-of-reasoning and flagged as unresolved
   ties — never picked silently.

### Step 5 — Write the file + inline summary

Write the full result to `stochastic-consensus-<slug>.md` in the **current working
directory** (`<slug>` = short kebab-case of the question):

```markdown
# Stochastic Multi-Agent Consensus: <question>

**Panel:** <k> of <N> agents live · Roles: <role1, role2, ...>

## Consensus (mode)
- [High · 4/5] <cluster claim> — <why> (held by: <roles>)
- [Medium · 3/5] <cluster claim> — <why> (held by: <roles>)

## Secondary signals
- [Medium · 2/5] <cluster claim> — <why>

## Wildcard
- [Low · 1/5] <claim> — <why it may still matter> (role: <role>)

## Positions (debate-ready)
- id: p1
  claim: <one-line claim>
  reasoning: <the agent's reasoning, condensed>
  held-by: <role(s)/agent(s)>
  count: <n>/<N>
  confidence: <High/Medium/Low>
- id: p2
  ...

## Recommendation
<frequency-weighted best answer, given current evidence>
```

The **Positions** block is the handoff contract for the `model-chat` refine skill — keep
it structured (stable `id`, verbatim-enough `claim`/`reasoning`) so that skill can load
it directly as debate starting positions without re-deriving them.

Then show a **short inline summary**: consensus top items, roles in play, notable
Wildcard entries, panel survival (`k of N`), and the file path.

## Failure policy

- **Spawn failure** — retry once. Still fails → drop that agent (and its role) from the
  panel and note the shrunk roster in the artifact header.
- **Floor: 3 live agents.** If live agents drop below 3, stop, consolidate whatever
  exists, and flag the result as degraded / low-confidence due to panel attrition.
- **Ties** in the mode are never picked silently — break by strength-of-reasoning and
  flag as an unresolved tie in the artifact.

## Do not

- Do **not** run debate rounds, resume agents, or use `SendMessage` — this skill is a
  single independent pass. Hand off to `model-chat` for debate.
- Do **not** spawn an aggregator agent to cluster outputs, or a synthesizer agent for
  tiering — you already hold everything in context; do it yourself.
- Do **not** give two agents near-duplicate role lenses just to fill N — divergence is
  the entire point of this skill now that there's no debate to force disagreement out.
- Do **not** drop a Wildcard idea from the final file for being rare — keep and flag,
  score on its own merits.
- Do **not** add a cross-model agent to this panel — diversity here is role-based, not
  model-based. Use `fan-out-fan-in` if cross-model diversity is what's wanted.

## Exit criteria (done when)

- N agents were spawned in one background pass, each with a distinct, meaningfully
  divergent role lens applied to the same question core.
- The orchestrator (not a spawned agent) clustered and mode-counted the results inline.
- The output is tiered into Consensus (mode) / Secondary signals / Wildcard, with
  Wildcard entries kept and flagged rather than dropped.
- The final file includes a structured, debate-ready `Positions` block usable as-is by
  the `model-chat` refine skill, written to `stochastic-consensus-<slug>.md`, with a
  tight inline summary stating panel survival (`k of N`) and roles in play.
