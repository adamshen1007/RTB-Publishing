# ADR-000 — Foundational Architecture

## Status

Accepted

## Context

RTB Publishing requires a long-lived architecture that preserves knowledge,
supports AI-assisted automation, and avoids vendor lock-in. Its canonical
content must remain portable, reviewable, and reproducible even when individual
tools change.

## Decision

### Source of Truth

The Git repository and its Markdown files are the canonical source of truth.
Specifications and accepted ADRs are version controlled with the content they
govern.

### Knowledge Graph

Obsidian may provide local knowledge management and bidirectional linking. It
must not become the exclusive store for canonical knowledge.

### Editorial Workspace

Notion may provide review workflows, dashboards, and publishing management.
Notion content is a derived workspace unless it has been synchronized back to
canonical Markdown.

### AI Layer

Specialized AI agents may collaborate through documented, reproducible
workflows. Human approval remains required for strategic and architectural
decisions.

### Automation and Publishing

CI/CD will validate Markdown, diagrams, links, citations, and release outputs.
Publishing pipelines may generate websites, PDF, EPUB, and DOCX artifacts from
canonical content.

### Initial Implementation

The first implementation remains lightweight and file based:

```text
Markdown change -> quality checks -> publishing export -> release artifact
```

A complex orchestration runtime must not be introduced until the manual and
scripted workflows have been validated.

## Rationale

This architecture maximizes portability, version control, automation, and
long-term maintainability while allowing individual tools to evolve
independently.

## Consequences

Benefits:

- Vendor independence
- Reusable and AI-editable documentation
- Strong version history and reviewability
- Reproducible multi-format publishing

Trade-offs:

- More initial repository setup
- Governance is required to prevent conflicting sources of truth
- Integrations require explicit synchronization rules
- Multiple tools increase operational complexity
