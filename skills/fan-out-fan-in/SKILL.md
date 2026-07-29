---
name: fan-out-fan-in
description: Answer a divergent, open-ended question (no single right answer — strategy, design trade-offs, "what are the best approaches to X", comparisons, ideation) by fanning out 5 independent researchers — 4 Sonnet sub-agents plus 1 Codex (cross-model) — on the same question, then fanning their outputs back in as a scored union. Use when the user wants a thorough, multi-perspective research answer, says "fan out", "get multiple perspectives", "research council", or invokes /fan-out-fan-in. NOT for simple factual lookups, single-answer questions, or code edits.
---

# Fan-Out / Fan-In Research

You are the **orchestrator and synthesizer** of a multi-agent research run. You spawn a panel of
independent researchers on the same divergent question, then merge everything they surface into a
single scored union. You keep your own reasoning out of the fan-out — the researchers think, you
integrate.

This skill exists for **divergent questions with no single right answer**. The value comes from
(a) stochastic diversity across identical prompts and (b) cross-model diversity from including a
non-Claude researcher. The fan-in is a **union of all thoughts — nothing gets discarded for being
rare**.

## Panel composition

- **4 × Sonnet researchers** — `Agent` tool, `subagent_type: "general-purpose"`, `model: "sonnet"`,
  run in the **background** (truly parallel). Required members of the panel.
- **1 × Codex researcher** — `mcp__pal__clink`, `cli_name: "codex"`, `role: "default"`. A
  **synchronous, blocking** call in your context — it is not an `Agent` spawn. Best-effort member.

All 5 receive the **identical research prompt**. Codex's worth is that it is a different model
family (GPT/Codex vs. Claude), so it adds diversity four Claude draws cannot.

## Arguments

The invocation is `/fan-out-fan-in [count] <question>`.

- If the first token is an integer, it overrides the Sonnet researcher count (Codex is always +1).
  Example: `/fan-out-fan-in 6 what are the best ways to onboard a new engineer` → 6 Sonnets + 1 Codex.
- Otherwise the whole argument is the question and the count defaults to **4 Sonnets + 1 Codex**.

## Procedure

### Step 0 — Pre-flight (clarify only if ambiguous)

Read the question. If it is clear and self-contained, proceed straight to Step 1 with no friction.
Ask **one** tight round of clarifying questions **only** when the question is genuinely ambiguous,
under-specified, or readable multiple ways — spawning 5 agents on a misread question is the most
expensive way to be wrong. Do not clarify well-formed questions.

### Step 1 — Build the identical research prompt

Compose one prompt template, reused verbatim for every researcher (Sonnet and Codex). It must:

1. State the exact question.
2. Instruct the researcher to reason **independently** and **not hedge toward a safe consensus** —
   its job is to surface its own strongest, most distinct thinking.
3. Ask for a **set of distinct ideas / positions / approaches**, each with: a one-line claim, the
   reasoning behind it, the researcher's **own confidence** (high / medium / low), and any
   **assumptions** it is making.
4. Explicitly invite **contrarian or non-obvious** angles — outliers are wanted, not penalized.
5. Permit tools: "Use web search or file reading **only if** it materially improves the answer;
   pure ideation questions need no search."
6. Request a compact, skimmable structure (a list of ideas, not an essay) so the fan-in is clean.

Keep the template identical across all researchers — diversity is meant to come from stochasticity
and cross-model difference, not from prompt engineering per agent.

### Step 2 — Fan out (single message, all researchers at once)

In **one** assistant turn, issue every researcher call together:

- N × `Agent` calls (`general-purpose`, `model: "sonnet"`) with the identical prompt — these run in
  the background in parallel.
- 1 × `mcp__pal__clink` call (`cli_name: "codex"`, `role: "default"`) with the identical prompt.
  This **blocks** the turn until Codex replies, and it runs **concurrently** with the background
  Sonnets — so firing it in the same message is the efficient ordering, not a bottleneck.

Tell the user you have dispatched the panel (how many Sonnets + Codex) before the calls resolve.

### Step 3 — Collect and enforce the failure policy

- **Sonnets are required.** If any Sonnet fails or returns nothing usable, **retry it once** with
  the same prompt. If it still fails after one retry, drop it and record the gap.
- **Codex is best-effort.** If the clink call errors (CLI not configured, timeout, refusal),
  **do not retry and do not fail the run** — proceed without it and note its absence.
- **Floor:** if fewer than **2** researchers survive in total, stop and report that the panel could
  not produce enough material to synthesize, rather than fabricating a synthesis.

### Step 4 — Fan in (you synthesize, as the main agent)

You already hold all returned outputs in your context. Do the integration yourself — do **not**
spawn a separate synthesizer.

1. **Extract** atomic ideas/claims from each researcher's output.
2. **Cluster** overlapping ideas across researchers; for each cluster track **how many of the N
   contributors raised it** (the agreement count).
3. **Score** every idea. Confidence rises with (agreement count) + (researchers' stated confidence)
   + (strength of reasoning). Use High / Medium / Low.
4. **Union rule — never drop an idea.** A point raised by only one researcher is an *outlier*, kept
   and flagged, scored on its merits (often Low-Medium confidence but potentially high value). Rare
   is not wrong.
5. **Surface disagreements** — where researchers directly contradict each other. On a divergent
   question this is the most informative signal.
6. **Weigh** consensus and outliers into a final recommendation that answers the question.

### Step 5 — Write the file + inline summary

Write the full synthesis to `fan-out-fan-in-<slug>.md` in the **current working directory**
(`<slug>` = short kebab-case of the question). Structure:

```markdown
# Fan-Out / Fan-In: <question>

**Contributors:** <k> of <N> (Sonnet ×<s>, Codex <yes/no>)

## Consensus (higher confidence)
- [High · 4/5] <claim> — <one-line why>
- [Medium · 3/5] <claim> — <one-line why>

## Outliers & unique insights (kept, flagged)
- [Low · 1/5] <claim> — <why it may still matter>

## Disagreements
- <point of contention>: <side A> vs <side B>

## Recommendation
<weighted answer to the question>
```

Then show a **short inline summary**: the top consensus points, the most notable outlier(s), the
recommendation, the contributor count (`k of N`), and the path to the full file. Keep the inline
version tight — the file holds the depth.

## Do not

- Do **not** inject your own answer into the fan-out — you research nothing; you only orchestrate
  and synthesize.
- Do **not** spawn a separate Opus synthesizer agent — you are already Opus and already hold every
  output; a second agent would cold-start and see nothing new.
- Do **not** give researchers different prompts — the prompt is identical across the panel.
- Do **not** discard an idea for being raised by only one researcher — the fan-in is a union.
- Do **not** retry Codex or let a Codex failure abort the run — it is best-effort.
- Do **not** use `subagent_type: "fork"` for researchers — forks inherit your context and defeat the
  clean-context, independent-draw premise. Use fresh `general-purpose` agents.

## Exit criteria (done when)

- The identical prompt was sent to N Sonnet researchers (background) and Codex (clink), with failed
  Sonnets retried once and Codex treated as best-effort.
- At least 2 outputs were synthesized (else an honest "insufficient panel" report was given).
- The synthesis is a scored union: consensus (with agreement counts), outliers (kept & flagged),
  disagreements, and a weighted recommendation — nothing dropped.
- The full synthesis was written to `fan-out-fan-in-<slug>.md` and a tight inline summary shown,
  stating how many of N contributed.
