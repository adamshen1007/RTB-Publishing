# ADR-007 — Markdown Canonical, Notion Derived

## Status

Accepted

## Context

The public book is built, validated, reviewed in version control, and released
from Markdown. Notion offers a friendlier surface for editorial coordination and
worksheets, but permitting independent prose edits in two systems would create
conflicts and unverifiable releases.

## Decision

Keep Markdown as the only canonical publication source. Treat Notion chapters,
worksheets, sources, and release gates as private derived records. Store a
SHA-256 hash and source path on each chapter and worksheet. Keep private Notion
identifiers in a Git-ignored local state file.

Use Review Findings as the return path. A Notion suggestion becomes effective
only after a human accepts it, changes Markdown, runs quality checks, and resyncs
the derived page. Do not implement automatic two-way reconciliation.

## Consequences

- Publication remains reproducible without Notion or private credentials.
- Reviewers receive structured, searchable working views.
- Hash differences make stale derived copies detectable.
- Accepted edits require an explicit reconciliation step.
- Notion outages do not block local authoring or publishing.
- A future two-way workflow requires a new architectural decision.
