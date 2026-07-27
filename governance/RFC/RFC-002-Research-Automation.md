# RFC-002 — Local Research Automation

## Status

Accepted for M3 implementation

## Summary

RTB Publishing will provide a local research workflow that turns structured topic,
source, evidence, and claim records into a validated Markdown research brief.

## Motivation

Research notes currently have no shared metadata, provenance graph, freshness
policy, or deterministic output. This makes it difficult to distinguish sourced
facts from synthesis and assumptions or to refresh a publication safely.

## Proposal

Add a `rtb-publishing research` command group with these operations:

- `create` creates a research topic manifest and record directories.
- `add-source` writes one normalized source record.
- `validate` checks schemas and cross-record integrity.
- `build` generates a cited research brief.
- `status` reports coverage, approval, conflicts, and stale sources.
- `refresh` advances the explicit research review date after human verification.

Normal validation and generation make no network calls. The committed topic
manifest provides the review date so equal input always produces equal output.

## Provenance Model

A claim references evidence records, and each evidence record references exactly
one source. Quotations retain a locator and are limited to short excerpts.
Synthesis requires evidence from at least two distinct sources. Assumptions are
explicit and cannot masquerade as sourced facts.

## Storage

Each topic owns YAML records under `research/topics/<topic>/`. Generated output
is Markdown. A deterministic state file contains only generator version and the
last generated output hash.

## Safety

- All paths remain inside the repository and reject symbolic-link traversal.
- Existing or human-modified output is never silently replaced.
- `--force` is the only destructive build override.
- Refresh requires an explicit ISO date and represents human verification.
- Full third-party pages are not copied into the repository.

## Deferred Work

Web scraping, scheduled cloud jobs, semantic search, vector databases, Notion
synchronization, and autonomous research agents remain outside M3.

## Acceptance

M3 is accepted when one topic can move from normalized public sources to a
validated, cited brief with reproducible freshness and CI drift checks.
