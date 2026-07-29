#!/usr/bin/env python3
"""
model-chat: stateful multi-round debate among Claude Code instances.

Refine phase of the discover -> refine pipeline (pairs with the
stochastic-multi-agent-consensus skill, which produces the discovery-phase
"Positions (debate-ready)" artifact this script can seed from).

Each "model instance" is a headless `claude -p` subprocess call running on the
user's Claude Code subscription auth -- no ANTHROPIC_API_KEY, no venv, no
third-party packages. Stdlib only.
"""
import argparse
import asyncio
import json
import re
import sys
from datetime import datetime
from pathlib import Path

CLAUDE_BIN = "claude"
AGENT_MODEL_DEFAULT = "sonnet"
SUMMARIZER_MODEL_DEFAULT = "haiku"  # cheap model for the rolling-context summarizer
AGENT_TIMEOUT_SECONDS = 180

# (persona_name, system_prompt) -- first N used per --agents.
PERSONAS = [
    ("systems-thinker", "You are a systems thinker. Trace downstream effects, "
     "feedback loops, and second-order consequences before judging a solution."),
    ("pragmatist", "You are a pragmatic operator. Weigh real-world constraints: "
     "time, cost, effort, and what actually ships."),
    ("edge-case-finder", "You are an edge-case finder. Actively hunt for the "
     "inputs, states, and failure modes that break a proposed solution."),
    ("ux-focused", "You are UX-focused. Judge every solution by what it does to "
     "the end user's experience, not just technical elegance."),
    ("contrarian", "You are a contrarian. Default to disagreeing with the "
     "current leading position and argue the strongest case against it."),
]

DEVILS_ADVOCATE = ("devils-advocate", "You are the Devil's Advocate, injected "
    "because the panel is converging too fast. Your sole mandate: attack the "
    "current leading position's weakest assumption as hard as you can, even if "
    "you privately agree with it.")


def persona_system_prompt(persona_name, persona_desc):
    """Frame the lens as an explicit debate persona so 'respond as your assigned
    persona' in the round prompt has something to resolve against."""
    return (f"You are participating in a multi-round, multi-agent debate. "
            f"Your assigned persona is '{persona_name}': {persona_desc}")


def personas_for(agents_n):
    roster = list(PERSONAS)
    # ponytail: generic fallback past the 5 named lenses, extra divergence not modeled
    for i in range(len(roster), agents_n):
        roster.append((f"independent-thinker-{i + 1}",
                        "You are an independent thinker. Form your own view without "
                        "deferring to a specific archetype."))
    return roster[:agents_n]


async def call_agent(persona_name, system_prompt, user_prompt, model):
    """Spawn one headless `claude -p` call. Retries once on failure/empty result."""
    cmd = [
        CLAUDE_BIN, "-p", user_prompt,
        "--model", model,
        "--output-format", "json",
        "--tools", "",  # pure reasoning turn, no filesystem/bash access needed
        # isolate the persona's voice from the orchestrator's own CLAUDE.md/hooks/skills
        # (e.g. ponytail mode leaking into every debate turn) -- verified this actually
        # suppresses it, plain --setting-sources alone does not disable hooks
        "--safe-mode",
        "--append-system-prompt", system_prompt,
    ]
    last_error = None
    for _attempt in range(2):
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=AGENT_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                last_error = f"timeout after {AGENT_TIMEOUT_SECONDS}s"
                continue
            if proc.returncode != 0:
                last_error = f"exit {proc.returncode}: {stderr.decode(errors='replace')[:500]}"
                continue
            data = json.loads(stdout.decode())
            if not data.get("result"):
                last_error = f"no result field in response: {stdout.decode()[:300]}"
                continue
            return {
                "persona": persona_name,
                "text": data["result"],
                "cost_usd": data.get("total_cost_usd", 0.0),
                "tokens": data.get("usage", {}),
                "error": None,
            }
        except (json.JSONDecodeError, OSError) as exc:
            last_error = str(exc)
    return {"persona": persona_name, "text": None, "cost_usd": 0.0, "tokens": {}, "error": last_error}


def extract_json_object(text):
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("no JSON object found in text")
    return match.group(0)


def coerce_summary(parsed):
    try:
        consensus_level = float(parsed.get("consensus_level") or 0.0)
    except (TypeError, ValueError):
        consensus_level = 0.0
    return {
        "agreements": list(parsed.get("agreements") or []),
        "unresolved_conflicts": list(parsed.get("unresolved_conflicts") or []),
        "leading_position": parsed.get("leading_position"),
        "consensus_level": consensus_level,
    }


def render_rounds(rounds):
    lines = []
    for r in rounds:
        lines.append(f"--- Round {r['round']} ---")
        for t in r["turns"]:
            if not t["error"]:
                lines.append(f"[{t['persona']}]: {t['text']}")
    return "\n".join(lines)


async def summarize_rounds(topic, rounds, model):
    """Condense prior rounds into agreements / unresolved conflicts / consensus_level.

    Uses a cheap model (default haiku) so the token-bloat guard doesn't itself
    become expensive. This is the dynamic-context-window step: later rounds see
    this brief instead of the full raw transcript.
    """
    prompt = (
        f"Topic under debate: {topic}\n\n"
        f"Transcript of the debate so far:\n{render_rounds(rounds)}\n\n"
        "Summarize this debate for the next round of participants. Respond with "
        "ONLY a JSON object, no other text, in this exact shape: "
        '{"agreements": ["..."], "unresolved_conflicts": ["..."], '
        '"leading_position": "...", "consensus_level": 0.0}\n'
        "consensus_level is your estimate, 0.0-1.0, of what fraction of agents "
        "currently back the leading_position."
    )
    turn = await call_agent(
        "summarizer",
        "You are a neutral debate summarizer. Be terse, structured, and honest "
        "about disagreement -- do not manufacture false consensus.",
        prompt, model=model,
    )
    if turn["error"] or not turn["text"]:
        return coerce_summary({}), turn
    try:
        parsed = json.loads(extract_json_object(turn["text"]))
    except (json.JSONDecodeError, ValueError):
        parsed = {}
    return coerce_summary(parsed), turn


def build_seed_context(seed_positions):
    if not seed_positions:
        return "This is round 1. State your opening position on the topic above, from your assigned persona's lens."
    lines = ["This debate is seeded from a prior discovery-phase scan. Existing positions found:"]
    for p in seed_positions:
        claim = p.get("claim", "?")
        conf = p.get("confidence", "?")
        count = p.get("count", "?")
        lines.append(f"- {claim} (confidence: {conf}, support: {count})")
    lines.append("\nRound 1: react to these from your assigned persona's lens -- agree, disagree, or add nuance.")
    return "\n".join(lines)


def build_rolling_context(summary, previous_round):
    lines = ["Debate summary so far:"]
    if summary["agreements"]:
        lines.append("Agreements: " + "; ".join(summary["agreements"]))
    if summary["unresolved_conflicts"]:
        lines.append("Unresolved conflicts: " + "; ".join(summary["unresolved_conflicts"]))
    if summary["leading_position"]:
        lines.append(f"Current leading position: {summary['leading_position']}")
    lines.append("\nMost recent round, verbatim:")
    for t in previous_round["turns"]:
        if not t["error"]:
            lines.append(f"[{t['persona']}]: {t['text']}")
    return "\n".join(lines)


def build_round_prompt(topic, context_block, moderator_note):
    parts = [f"Debate topic: {topic}", "", context_block]
    if moderator_note:
        parts.append(f"\nModerator note for this round: {moderator_note}")
    parts.append(
        "\nRespond as your assigned persona. Explicitly state whether you agree, "
        "disagree, or want to revise your prior stance, and why. Be concise "
        "(under 200 words). Do not repeat the full history back -- react to it."
    )
    return "\n".join(parts)


def prompt_for_moderator_input(round_idx):
    try:
        line = input(f"\n[interactive] optional steering note before round {round_idx} (Enter to skip): ")
    except EOFError:
        return None
    return line.strip() or None


async def synthesize(topic, rounds, model):
    prompt = (
        f"Topic: {topic}\n\nFull debate transcript:\n{render_rounds(rounds)}\n\n"
        "Synthesize this debate into a final answer. Structure your response in "
        "markdown with these sections: ## Agreements, ## Unresolved disagreements, "
        "## Recommendation."
    )
    turn = await call_agent(
        "synthesizer",
        "You are a neutral synthesizer merging a multi-agent debate into one answer.",
        prompt, model=model,
    )
    text = turn["text"] or f"(synthesis failed: {turn['error']})"
    return text, turn


async def run_debate(topic, seed_positions, agents_n, rounds_n, agent_model,
                      summarizer_model, dissent_threshold, interactive, run_dir):
    personas = personas_for(agents_n)
    rounds = []
    total_cost = 0.0

    for round_idx in range(1, rounds_n + 1):
        dissent_injected = False
        round_personas = list(personas)
        summarizer_cost = 0.0

        if round_idx == 1:
            context_block = build_seed_context(seed_positions)
        else:
            summary, summarizer_turn = await summarize_rounds(topic, rounds, summarizer_model)
            summarizer_cost = summarizer_turn["cost_usd"]
            if summary["consensus_level"] >= dissent_threshold and round_idx < rounds_n:
                round_personas[-1] = DEVILS_ADVOCATE
                dissent_injected = True
            context_block = build_rolling_context(summary, rounds[-1])

        moderator_note = prompt_for_moderator_input(round_idx) if (interactive and round_idx > 1) else None
        prompt = build_round_prompt(topic, context_block, moderator_note)

        print(f"\n=== Round {round_idx} ===")
        turns = await asyncio.gather(*[
            call_agent(name, persona_system_prompt(name, desc), prompt, agent_model)
            for name, desc in round_personas
        ])

        for t in turns:
            if t["error"]:
                print(f"[{t['persona']}] ERROR: {t['error']}")
            else:
                print(f"[{t['persona']}] {t['text']}\n")

        round_cost = sum(t["cost_usd"] for t in turns) + summarizer_cost
        extra = " + 1 summarizer" if round_idx > 1 else ""
        print(f"--- round {round_idx} cost: ${round_cost:.4f} ({len(turns)} agent calls{extra})")
        if dissent_injected:
            print(f"--- dissent injected: consensus was high, Devil's Advocate added")

        rounds.append({
            "round": round_idx, "turns": turns, "cost_usd": round_cost,
            "dissent_injected": dissent_injected, "moderator_note": moderator_note,
        })
        total_cost += round_cost

    synthesis, synth_turn = await synthesize(topic, rounds, agent_model)
    total_cost += synth_turn["cost_usd"]

    write_outputs(run_dir, topic, personas, rounds, synthesis, total_cost)
    return rounds, synthesis, total_cost


def write_outputs(run_dir, topic, personas, rounds, synthesis, total_cost):
    run_dir.mkdir(parents=True, exist_ok=True)
    conversation = {
        "topic": topic,
        "personas": [name for name, _ in personas],
        "total_cost_usd": total_cost,
        "rounds": [
            {
                "round": r["round"],
                "dissent_injected": r["dissent_injected"],
                "moderator_note": r["moderator_note"],
                "cost_usd": r["cost_usd"],
                "turns": [
                    {"persona": t["persona"], "text": t["text"],
                     "cost_usd": t["cost_usd"], "tokens": t["tokens"], "error": t["error"]}
                    for t in r["turns"]
                ],
            }
            for r in rounds
        ],
        "synthesis": synthesis,
    }
    (run_dir / "conversation.json").write_text(json.dumps(conversation, indent=2))
    (run_dir / "synthesis.md").write_text(f"# Model Chat Synthesis: {topic}\n\n{synthesis}\n")

    latest_link = run_dir.parent / "latest"
    if latest_link.is_symlink() or latest_link.exists():
        latest_link.unlink()
    latest_link.symlink_to(run_dir.name)


def load_seed_positions(path):
    """Parse a stochastic-multi-agent-consensus artifact's Positions block."""
    text = path.read_text()
    title_match = re.search(r"^#\s*Stochastic Multi-Agent Consensus:\s*(.+)$", text, re.MULTILINE)
    topic = title_match.group(1).strip() if title_match else path.stem

    block_match = re.search(r"##\s*Positions \(debate-ready\)\n(.*?)(?=\n##|\Z)", text, re.DOTALL)
    positions = []
    if block_match:
        for entry in re.split(r"\n(?=- id:)", block_match.group(1).strip()):
            entry = entry.strip()
            if not entry:
                continue
            fields = {}
            for line in entry.splitlines():
                line = line.strip().lstrip("- ")
                if ":" in line:
                    key, _, val = line.partition(":")
                    fields[key.strip()] = val.strip()
            if fields:
                positions.append(fields)
    return topic, positions


def resolve_input(arg):
    path = Path(arg)
    if path.suffix == ".md" and path.exists():
        return load_seed_positions(path)
    return arg, []


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Stateful multi-round debate among Claude Code instances.")
    parser.add_argument("topic", nargs="?",
                         help="Debate topic, or a path to a stochastic-consensus-<slug>.md artifact to seed from.")
    parser.add_argument("--agents", type=int, default=3, help="Number of debating agents (default 3).")
    parser.add_argument("--rounds", type=int, default=3, help="Number of debate rounds (default 3).")
    parser.add_argument("--interactive", action="store_true", help="Prompt for a steering note before each round after the first.")
    parser.add_argument("--model", default=AGENT_MODEL_DEFAULT, help="Model for debating agents (default sonnet).")
    parser.add_argument("--summarizer-model", default=SUMMARIZER_MODEL_DEFAULT, help="Model for the rolling-context summarizer (default haiku).")
    parser.add_argument("--dissent-threshold", type=float, default=0.8,
                         help="Consensus level (0-1) above which a Devil's Advocate is forced into the next round (default 0.8).")
    parser.add_argument("--self-check", action="store_true", help="Run a tiny 2-agent x 1-round smoke test and assert output shape.")
    return parser.parse_args(argv)


async def self_check():
    topic = "Should this self-check use tabs or spaces?"
    run_dir = Path("active/model-chat") / "self-check"
    rounds, synthesis, _total_cost = await run_debate(
        topic, [], agents_n=2, rounds_n=1, agent_model=AGENT_MODEL_DEFAULT,
        summarizer_model=SUMMARIZER_MODEL_DEFAULT, dissent_threshold=0.8,
        interactive=False, run_dir=run_dir,
    )
    assert len(rounds) == 1, "expected exactly 1 round"
    assert len(rounds[0]["turns"]) == 2, "expected exactly 2 agent turns"
    assert (run_dir / "conversation.json").exists(), "conversation.json not written"
    assert (run_dir / "synthesis.md").exists(), "synthesis.md not written"
    assert synthesis, "synthesis text is empty"
    print("self-check OK")


def main(argv=None):
    args = parse_args(argv)

    if args.self_check:
        asyncio.run(self_check())
        return 0

    if not args.topic:
        print("error: a topic or artifact path is required (unless --self-check)", file=sys.stderr)
        return 1

    topic, seed_positions = resolve_input(args.topic)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = Path("active/model-chat") / timestamp

    print(f"model-chat: {args.agents} agents x {args.rounds} rounds on: {topic}")
    if seed_positions:
        print(f"  seeded from {len(seed_positions)} discovery-phase position(s)")

    _rounds, synthesis, total_cost = asyncio.run(run_debate(
        topic, seed_positions, args.agents, args.rounds, args.model,
        args.summarizer_model, args.dissent_threshold, args.interactive, run_dir,
    ))

    print(f"\n=== Synthesis ===\n{synthesis}")
    print(f"\nTotal cost: ${total_cost:.4f}")
    print(f"Saved to: {run_dir} (latest -> active/model-chat/latest)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
