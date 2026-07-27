# Chapter 11 — Build with AI Without Losing Judgment

> **Core Principle:** Delegate tasks to AI; never delegate unnamed responsibility.

## Learning Objectives

- Assign AI work according to consequence and reversibility.
- Name a human owner for inputs, outputs, decisions, and incidents.
- Preserve evidence needed to review and reproduce important outcomes.

## Deep Dive

AI can draft, classify, summarize, generate code, and propose actions. The same
capability can create confident errors, expose sensitive data, or automate a
bad assumption. The question is not whether AI is “in the loop.” It is who is
accountable and what happens when the system is wrong.

NIST’s AI Risk Management Framework organizes risk work around governing,
mapping, measuring, and managing.[^rmf] RTB Publishing applies that orientation at
startup scale: map the user and consequence, measure the behavior that matters,
set controls, and name the person who decides.

Classify tasks by consequence and reversibility:

- Low consequence and reversible: drafting internal alternatives.
- Moderate consequence: user-facing summaries with review and correction.
- High consequence or hard to reverse: financial, health, employment, safety,
  access, or legal effects that require qualified human control.

For each workflow, record allowed data, tool access, expected output, evaluation,
fallback, and owner. “The model decided” is not an ownership model.

## AI Founder Interpretation

The founder should use AI most aggressively where errors are visible and cheap
to reverse. Increase review, testing, and access restrictions as consequence
rises. Sometimes the responsible choice is not to automate.

Preserve prompts, relevant settings, source references, approvals, and outcome
evidence when they are needed for review—subject to privacy and retention limits.

## Callouts

### Decision Lens

> **Decision Lens:** Who notices, corrects, and explains the result when this AI
> output is wrong?

### Common Failure

> **Common Failure:** Adding a human approval button after the person has lost
> enough context to evaluate the output meaningfully.

## Checklist

- [ ] Classify consequence and reversibility for each AI-assisted task.
- [ ] Name the human owner and escalation path.
- [ ] Limit data and tool access to what the task requires.
- [ ] Define evaluation, fallback, and incident evidence.
- [ ] Reconsider whether automation is appropriate.

## Worksheet

| AI-assisted task | Consequence | Reversible? | Human owner | Evaluation | Fallback |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
| | | | | | |
| | | | | | |

## Key Takeaways

- AI capability does not remove human accountability.
- Consequence and reversibility should determine control strength.
- Meaningful review requires context, time, and authority.
- Not automating can be the correct product decision.

## Sources

- [AI Risk Management Framework — NIST](https://www.nist.gov/itl/ai-risk-management-framework)
- [Generative AI Profile — NIST](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)

[^rmf]: National Institute of Standards and Technology, “AI Risk Management Framework.”
