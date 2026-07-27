# Research-to-Book Test Plan

**Generated:** 2026-07-23
**Branch:** `codex/research-to-book-design`
**Primary input:** `2026-07-23-research-to-book-publishing-design.md`

## Affected Pages and Surfaces

Exact route names are assigned by the Increment 1 UI plan. QA must cover these
logical surfaces:

- Library — project lifecycle, release history, empty and stale states
- New Book Wizard — Blueprint creation, budgets, egress, and approval
- Research Desk — ingestion, evidence, rights, filtering, and failures
- Outline Builder — claim coverage, contradictions, and Blueprint changes
- Chapter Studio — proposals, memory, canonical mutations, and conflicts
- Visual Studio — provenance, rights, accessibility, and regeneration
- Beta Review — Notion export, import, comparison, and conflict handling
- Release Center — dry run, Publish, activation, rollback, and unpublish
- Subscriber library — allowlist, authentication, protected reading, downloads

## Key Interactions to Verify

- Create, validate, approve, reopen, migrate, and archive a Book Project.
- Estimate and approve a research run under project budgets.
- Ingest each Tier 1 source type through the Evidence Gateway.
- Approve and reject granular sources, claims, chapters, and visuals.
- Complete each of the Blueprint, Beta, and Publish gates.
- Export a beta to Notion and import comments, edits, reorders, and deletions.
- Accept, revise, reject, defer, and conflict a Notion proposal.
- Apply a canonical mutation and recover it after injected termination.
- Build and validate HTML, PDF, and EPUB.
- Stage a release, verify subscriber controls, activate, roll back, and
  unpublish.
- Invite an allowlisted subscriber and deny a non-allowlisted address.

## Edge Cases

- Empty book, empty research result, one source, and configured maximum sources
- Oversized source, archive expansion, malformed PDF, redirect loop, private IP
- Missing or regenerated transcript, unstable locator, and expired rights
- Provider timeout, invalid structured output, cost ceiling, and no capability
- Duplicate click, two browser tabs, stale version, cancellation, and restart
- Local edit after Notion export, unsupported Notion block, and deleted block
- One output format fails while the other two pass
- Artifact hash mismatch, interrupted upload, stale staging release
- Expired login link, revoked subscriber, replayed download URL
- Disk full, database locked, missing temporary directory, and process crash

## Critical Paths

1. YC Playbook migration produces semantically equivalent HTML and EPUB plus
   the approved new PDF output.
2. A short pilot moves from Blueprint through Tier 1 research, evidence,
   composition, visuals, Beta Gate, Notion reconciliation, and canonical
   acceptance.
3. A human Publish action produces one immutable release bundle and exposes it
   only to an allowlisted subscriber.
4. Termination after every durable checkpoint resumes without duplication,
   silent loss, or replacement of the active release.

## AI Evaluation Suites

- Research-plan usefulness and scope discipline
- Evidence-to-claim entailment and unsupported-claim rate
- Citation precision and sampled recall
- Outline coherence and chapter-contract coverage
- Chapter usefulness, faithfulness, and required-element coverage
- Editorial Memory adherence, overreach, and memory-off comparison
- Visual-purpose selection, provenance, and accessibility text
- Notion edit/comment proposal interpretation

Every prompt, model, or capability change compares with pinned baselines.
Threshold changes require a recorded decision rather than silently updating
fixtures.
