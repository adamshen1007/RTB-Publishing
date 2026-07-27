# Specification 010 — Research Workflow

## Purpose

Define the local M3 workflow for traceable, refreshable research briefs.

## Canonical Records

Each topic contains:

- `research.yaml`: question, owner, status, source threshold, review date
- `sources/SRC-NNN.yaml`: normalized source metadata
- `evidence/EVD-NNN.yaml`: a short quote, paraphrase, or observation
- `claims/CLM-NNN.yaml`: classified statement and evidence relationships
- `outputs/research-brief.md`: deterministic generated brief
- `.rtb-publishing/research-state.json`: generated-output hash

## Claim Classifications

- `sourced-fact`: externally verifiable statement supported by evidence
- `source-opinion`: advice or judgment attributed to its source
- `synthesis`: interpretation supported by at least two distinct sources
- `assumption`: unverified proposition with no evidence requirement
- `observation`: first-party observation with an internal evidence record

## Commands

```text
rtb-publishing research create <topic> [options]
rtb-publishing research add-source <manifest> [options]
rtb-publishing research validate <manifest>
rtb-publishing research build <manifest> [--dry-run] [--check] [--force]
rtb-publishing research status <manifest>
rtb-publishing research refresh <manifest> --as-of YYYY-MM-DD [--dry-run]
```

## Validation

Validation must reject:

- Invalid schemas or duplicate IDs
- Missing source or evidence relationships
- Sourced claims without evidence
- Synthesis based on fewer than two sources
- Assumptions incorrectly linked to evidence
- Quotations without locators or with more than 25 words
- Access dates before publication or capture dates after the topic review date
- Research below its minimum-source threshold
- Unknown contradiction relationships
- Unsafe or symbolic-link paths

Stale sources are reported but do not invalidate historical research. A source
is stale when its access date is older than `freshnessDays` relative to `asOf`.

## Generation

The research brief contains the question, executive synthesis, method, findings,
conflicting evidence, limitations, open assumptions, source freshness, and full
source list. Claims display source IDs resolved through their evidence records.

## Ownership

The YAML records are user-owned. Generated Markdown has a RTB Publishing ownership
marker. Builds stop if output differs from the prior generated hash unless the
human supplies `--force`.

## Exit Codes

- `0`: operation completed, validation passed, or no drift exists
- `1`: invalid input, integrity failure, unsafe path, conflict, or drift

## M3 Acceptance Criteria

- One public topic has five or more normalized sources.
- Every sourced claim resolves through evidence to a source.
- Generation and refresh behavior are deterministic.
- Stale sources and contradictory claims are visible.
- Human edits receive overwrite protection.
- CI validates records and checks the committed brief for drift.
