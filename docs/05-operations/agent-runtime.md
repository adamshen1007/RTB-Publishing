# Governed Agent Runtime

## What It Does

RTB Publishing M4 adds one enabled Research Review Agent. It reads an already-valid
M3 topic and creates a review proposal. It cannot browse, run commands, edit
files, use Git, publish, approve itself, or bypass existing research checks.

The other role definitions are contracts for later work and intentionally fail
if you try to run them.

## Inspect the Runtime

```bash
pnpm rtb-publishing agent list
pnpm rtb-publishing agent doctor
```

`doctor` does not require an API key. A hollow circle beside the OpenAI key is
normal when using the fake provider.

## Run Locally Without an API Key

```bash
pnpm rtb-publishing agent run research-reviewer \
  --subject research/topics/customer-validation-before-mvp/research.yaml \
  --provider fake \
  --run-id RUN-LOCAL-001
```

The run is stored in `.rtb-publishing/agent-runs/RUN-LOCAL-001/`, which Git ignores.
Inspect `proposal.json`, `verification.json`, and `summary.json`. The command
does not change the research topic.

## Review and Apply

Record a real human decision with an explicit timestamp:

```bash
pnpm rtb-publishing agent review .rtb-publishing/agent-runs/RUN-LOCAL-001 \
  --decision rejected \
  --reviewer "Your Name" \
  --reviewed-at "2026-07-13T12:00:00Z" \
  --note "The recommendation is not justified."
```

For an approved proposal, use `--decision approved`, inspect the approval
artifact, and then run:

```bash
pnpm rtb-publishing agent apply .rtb-publishing/agent-runs/RUN-LOCAL-001
```

Apply fails if the proposal or any target changed after review. It validates
the resulting claim and complete M3 research graph, restoring original files
if validation fails. Review the Git diff yourself; the agent cannot commit or
push.

## Optional OpenAI Provider

Set the key only in your shell or local environment loader. RTB Publishing never
writes it to an artifact:

```bash
export OPENAI_API_KEY="your-key"
pnpm rtb-publishing agent run research-reviewer \
  --subject research/topics/customer-validation-before-mvp/research.yaml \
  --provider openai \
  --model "a-model-enabled-for-your-project" \
  --input-cost-per-million "CURRENT_INPUT_PRICE" \
  --output-cost-per-million "CURRENT_OUTPUT_PRICE" \
  --run-id RUN-LIVE-001
```

Look up current model availability and prices immediately before the run. The
runtime requires prices instead of embedding a value that can become stale. It
uses the OpenAI Responses API, strict JSON Schema output, `store: false`, a
timeout, and no tools. CI never makes this live request.

## Troubleshooting

- **Outside allowlist:** choose a subject under `research/topics/`; do not widen
  a contract casually.
- **Potential prompt injection:** inspect the named input and remove or safely
  represent embedded instructions before retrying.
- **Cost exceeds limit:** use a smaller current model or update limits through
  governance review; do not bypass enforcement.
- **Stale approval:** rerun review against the new proposal and file hashes.
- **Contract-only:** the role needs an RFC and implementation; this is expected.

## Quality Commands

```bash
pnpm test:agents
pnpm eval:agents
pnpm check:agent-example
pnpm check
```
