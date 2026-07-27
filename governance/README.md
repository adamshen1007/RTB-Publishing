# Governance

This directory contains the constitutional, RFC, ADR, policy, and decision
framework for RTB Publishing. Earlier records remain part of the decision history
when a later record narrows or supersedes them.

## Constitution and Process

- [RTB Publishing Constitution](../CONSTITUTION.md) is the only canonical RTB Publishing
  constitution and the authority for RTB Publishing source-of-truth rules.
- [RTB Publishing agent instructions](../AGENTS.md) define the repository-wide
  operating rules and required chapter elements.
- [RFC-000 — RTB Publishing RFC Process](RFC/RFC-000-Process.md) defines how major
  changes are proposed, reviewed, accepted, and superseded.
- [RFC template](RFC/RFC-001-Template.md) provides the required structure for
  a new RFC.

## Requests for Comments

| Record | Purpose |
| --- | --- |
| [RFC-001 — Engineering Kit Generator](RFC/RFC-001-Engineering-Kit-Generator.md) | Generate deterministic engineering kits from canonical product inputs |
| [RFC-002 — Local Research Automation](RFC/RFC-002-Research-Automation.md) | Automate local research while preserving provenance and human review |
| [RFC-003 — Governed Agent Runtime](RFC/RFC-003-Governed-Agent-Runtime.md) | Run proposal-only agents behind explicit policy and approval boundaries |
| [RFC-004 — Local Founder Workspace](RFC/RFC-004-Local-Founder-Workspace.md) | Provide the local workspace and its derived read model |
| [RFC-005 — Notion Editorial Workspace](RFC/RFC-005-Notion-Editorial-Workspace.md) | Provide a private, derived Notion review workspace |
| [RFC-006 — Research-to-Book Product Pivot](RFC/RFC-006-Research-to-Book-Product-Pivot.md) | Define the research-to-book product boundary, increments, and approval gates |
| [RFC-007 — Research-to-Book Publishing](RFC/RFC-007-Research-to-Book-Publishing.md) | Define the HTML, PDF, EPUB, single Publish gate, release, and hosted-delivery contracts |
| [RFC-008 — PDF Publication Profile](RFC/RFC-008-PDF-Publication-Profile.md) | Amend RFC-007 with the accepted Increment 1 PDF/A-2a + PDF/UA-1 toolchain decision; human accessibility and legal evidence remain separate gates |

## Architecture Decision Records

| Record | Purpose |
| --- | --- |
| [ADR-000 — Foundational Architecture](ADR/ADR-000-Foundational-Architecture.md) | Establish the foundational repository architecture |
| [ADR-001 — M1 Publishing Toolchain](ADR/ADR-001-Publishing-Toolchain.md) | Select the original Markdown publishing toolchain |
| [ADR-002 — Deterministic Engineering Kit Generation](ADR/ADR-002-Deterministic-Engineering-Kit-Generation.md) | Keep engineering-kit generation deterministic and reproducible |
| [ADR-003 — Research Provenance and Freshness](ADR/ADR-003-Research-Provenance-and-Freshness.md) | Preserve research provenance, locators, and freshness |
| [ADR-004 — Proposal-only Agent Architecture](ADR/ADR-004-Proposal-Only-Agent-Architecture.md) | Keep agent output proposal-only and human-governed |
| [ADR-005 — Local Derived Read Model](ADR/ADR-005-Local-Derived-Read-Model.md) | Keep the local interface derived from canonical sources |
| [ADR-006 — Local External Project Overlay](ADR/ADR-006-Local-External-Project-Overlay.md) | Admit explicitly approved external projects through a local overlay |
| [ADR-007 — Markdown Canonical, Notion Derived](ADR/ADR-007-Markdown-Canonical-Notion-Derived.md) | Keep Markdown canonical and Notion private and derived |
| [ADR-008 — Markdown, SQLite Authority, and Mutations](ADR/ADR-008-Markdown-SQLite-Authority-and-Mutations.md) | Assign data authority and define snapshot-consistent recoverable mutations |
| [ADR-009 — Lifecycle and Durable Workflow](ADR/ADR-009-Lifecycle-and-Durable-Workflow.md) | Define the three approval gates and durable workflow semantics |
| [ADR-010 — Provider Capabilities and Data Egress](ADR/ADR-010-Provider-Capabilities-and-Data-Egress.md) | Bound provider capabilities, classified egress, consent, and fallback |
| [ADR-011 — Notion Three-Way Proposal Reconciliation](ADR/ADR-011-Notion-Three-Way-Proposal-Reconciliation.md) | Import Notion changes as immutable, human-decided proposals |
| [ADR-012 — Immutable Releases and Ghost Adapter](ADR/ADR-012-Immutable-Releases-and-Ghost-Adapter.md) | Define immutable releases, staging evidence, authoritative hosted activation, and the conditional Ghost adapter |

## Policies and Threat Models

| Record | Purpose |
| --- | --- |
| [Agent Data Retention Policy](policies/AGENT-DATA-RETENTION.md) | Bound retention of agent inputs, outputs, and evidence |
| [AI Agent Threat Model](policies/AI-AGENT-THREAT-MODEL.md) | Model threats at agent and tool boundaries |
| [Local Platform Security Policy](policies/PLATFORM-SECURITY.md) | Define controls for the local application boundary |
| [Research-to-Book Threat Model](policies/RESEARCH-TO-BOOK-THREAT-MODEL.md) | Model ingestion, provider, mutation, rendering, hosted-delivery, and subscriber threats |
| [Citation Policy](policies/citation-policy.md) | Define evidence and citation requirements |
| [Quality Policy](policies/quality-policy.md) | Define publication quality gates |

## Narrow Supersession Map

| Earlier record | Replacement scope | Scope that remains active |
| --- | --- | --- |
| [RFC-004](RFC/RFC-004-Local-Founder-Workspace.md) | [RFC-006](RFC/RFC-006-Research-to-Book-Product-Pivot.md) lifts the hosted-expansion pause only for the bounded, allowlisted publishing adapter. | Teams, billing, remote projects, general cloud workspace features, and all other M5B capabilities remain deferred. |
| [RFC-006](RFC/RFC-006-Research-to-Book-Product-Pivot.md) original increment allocation | [RFC-007](RFC/RFC-007-Research-to-Book-Publishing.md) moves the minimum Blueprint and Beta approvals, the single Publish Gate, and Publish-bound immutable final-manifest generation into Increment 1. | Increment 2 deepens beta quality through the existing gate. Increment 3 consumes the approved immutable release for remote staging, hosted verification, activation, rollback, unpublish, and retention; neither increment adds a gate. |
| [RFC-005](RFC/RFC-005-Notion-Editorial-Workspace.md) | After [ADR-011](ADR/ADR-011-Notion-Three-Way-Proposal-Reconciliation.md)'s implementation acceptance criteria pass, its manual-only return path is replaced by normalized three-way import that creates proposals for human decision and authorized local application. | Until those criteria pass, RFC-005's one-way manual reconciliation remains operational. Notion remains private and derived; it never writes Markdown or grants approval. |
| [ADR-001](ADR/ADR-001-Publishing-Toolchain.md) | [RFC-006](RFC/RFC-006-Research-to-Book-Product-Pivot.md) and [RFC-007](RFC/RFC-007-Research-to-Book-Publishing.md) replace DOCX with PDF for research-to-book releases and bring PDF, the minimum three-gate lifecycle, local final manifests, and the Ghost spike into Increment 1. | Markdown authority, derived output directories, required HTML and EPUB, local/CI command parity, and repeatable quality gates remain active. Prior M1 release artifacts are not rewritten, and production hosted delivery remains Increment 3. |
| [ADR-005](ADR/ADR-005-Local-Derived-Read-Model.md) | [ADR-008](ADR/ADR-008-Markdown-SQLite-Authority-and-Mutations.md) narrows only the write boundary: approved Creator Studio actions may invoke the fixed-allowlist authorized mutation service. | The browser still cannot write canonical content directly. The dependency-light local application, derived indexes and summaries, and deferral of arbitrary external execution remain active. |
| [ADR-007](ADR/ADR-007-Markdown-Canonical-Notion-Derived.md) | After [ADR-011](ADR/ADR-011-Notion-Three-Way-Proposal-Reconciliation.md)'s implementation acceptance criteria pass, normalized three-way proposal import replaces only the manual-only return path. | Until those criteria pass, the manual path remains operational. Markdown remains canonical; Notion remains private and derived, its identifiers remain local, and outages do not block local authoring or publishing. |
