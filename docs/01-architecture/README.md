# RTB Publishing Architecture

These documents form the M0 architecture baseline:

1. [System overview](system-overview.md)
2. [Domain architecture](domain-architecture.md)
3. [Capability architecture](capability-architecture.md)
4. [Repository structure](repository-structure.md)

The domain architecture defines ownership boundaries. The capability
architecture defines the value RTB Publishing must deliver. Detailed engine
contracts live under [`specs/engines`](../../specs/engines), and interaction
rules live under [`specs/orchestration`](../../specs/orchestration).

Architecture changes require the RFC and ADR process described under
[`governance`](../../governance).

## Research-to-Book Architecture

- The [reviewed publishing design](../superpowers/specs/2026-07-23-research-to-book-publishing-design.md)
  defines the approved product direction and implementation program.
- [RFC-006](../../governance/RFC/RFC-006-Research-to-Book-Product-Pivot.md)
  fixes the product boundary, delivery increments, and approval gates.
- [RFC-007](../../governance/RFC/RFC-007-Research-to-Book-Publishing.md)
  fixes the HTML, PDF, EPUB, release, and hosted-delivery contracts.
- [ADR-008](../../governance/ADR/ADR-008-Markdown-SQLite-Authority-and-Mutations.md)
  assigns Markdown and SQLite authority and defines recoverable mutations.
- [ADR-009](../../governance/ADR/ADR-009-Lifecycle-and-Durable-Workflow.md)
  defines the lifecycle gates and durable workflow.
- [ADR-010](../../governance/ADR/ADR-010-Provider-Capabilities-and-Data-Egress.md)
  defines provider capabilities and classified data egress.
- [ADR-011](../../governance/ADR/ADR-011-Notion-Three-Way-Proposal-Reconciliation.md)
  defines proposal-only Notion reconciliation.
- [ADR-012](../../governance/ADR/ADR-012-Immutable-Releases-and-Ghost-Adapter.md)
  defines immutable releases and the Ghost adapter boundary.
- The [research-to-book threat model](../../governance/policies/RESEARCH-TO-BOOK-THREAT-MODEL.md)
  defines the security boundaries and invariants for ingestion through
  subscriber delivery.
