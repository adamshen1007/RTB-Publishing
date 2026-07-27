# RTB Publishing Roadmap

RTB Publishing uses one milestone sequence: **M0, M1, M2, M3, M4, and M5**.
Decimal milestone names such as M0.1–M0.3 were working-draft labels and are no
longer part of the canonical roadmap. Each milestone must satisfy its exit
criteria before the next milestone becomes the primary implementation focus.

## Current Priority — Volume 1 Publication Preparation

The canonical 23-chapter manuscript of *The RTB Publishing Playbook for AI Founders*
is a version 0.3.0 publication candidate. The explicit decision to pursue public
publication was made on 2026-07-21. This content track uses the existing M1
publishing foundation; it does not create a decimal product milestone or imply
a new platform phase.

Completed work:

- Canonical reader, promise, scope, independence note, and editorial criteria
- Six-part, 23-chapter table of contents with a decision output per chapter
- Primary-source registry and chapter research map
- Automated chapter contract, authoring template, tests, and runbook
- Complete Parts I–VI with worksheets, checklists, callouts, and sources
- Reproducible HTML, EPUB, and DOCX internal-review artifacts
- Private Notion Book Headquarters with derived pages and worksheets for all 23
  chapters, searchable sources, review findings, release gates, and source-hash
  freshness checks

Before the 0.9.0 Public Preview:

- Complete substantive and copy editing by human reviewers.
- Obtain sensitivity, accessibility, legal, and trademark review where needed.
- Run real beginner beta reading and record observed confusion and outcomes.
- Resolve blocking findings, rebuild artifacts, and record preview approval.

Version 1.0.0 follows the Public Preview only after preview findings are
resolved and final publication approval is recorded. No beta reading, legal
approval, Y Combinator endorsement, public preview, or final publication is
claimed by the decision to pursue publication.

## M0 — Strategy and Governance

**Goal:** Establish the source of truth and define what RTB Publishing is building.

**Status:** Complete

Deliverables:

- Vision, worthiness review, strategy, and product requirements
- Constitution, RFC process, and foundational ADR
- Domain, capability, engine, and orchestration specifications
- Canonical repository structure and documentation standards
- Initial book, chapter, worksheet, and governance templates

Exit criteria:

- Canonical documents have one unambiguous location.
- The repository can be understood from the root README.
- Future work maps to an accepted milestone and capability.
- Documentation quality configuration is present and reproducible.

## M1 — Publishing Foundation

**Goal:** Turn canonical Markdown into validated release artifacts.

**Status:** Complete; public release remains a human approval gate

Deliverables:

- Markdown, link, style, diagram, and citation checks
- Repeatable local `check`, `build`, and `preview` commands
- HTML, EPUB, and DOCX output from one representative book chapter
- CI workflow that validates changes and uploads build artifacts
- Documented local setup and troubleshooting guide

Exit criteria:

- A fresh clone can produce the documented outputs without private services.
- A failed quality gate blocks publication.
- Generated outputs are reproducible and excluded from source control.

## M2 — Engineering Kit Generator

**Goal:** Generate a consistent project foundation from reusable templates.

**Status:** Complete

Deliverables:

- Standard project starter documents
- PRD, ADR, milestone, and verification-plan generators
- One end-to-end generated engineering kit

Exit criteria:

- A new project kit can be generated, reviewed, and regenerated predictably.
- Invalid manifests and unsafe output paths fail before writes occur.
- User-modified generated documents require explicit replacement approval.
- A committed example is checked for drift in CI.

## M3 — Research Automation

**Goal:** Ingest, evaluate, cite, and refresh evidence reproducibly.

**Status:** Complete

Deliverables:

- Research ingestion and normalization workflow
- Citation validation and evidence-quality policy
- Quarterly update workflow

Exit criteria:

- One research topic can move from source capture to cited publication with an
  auditable trail.
- Sourced claims resolve through evidence to normalized sources.
- Freshness, generated output, and refresh state are deterministic.
- Human changes and unsafe paths are protected.
- CI blocks invalid provenance or example drift.

## M4 — AI Agent Ecosystem

**Goal:** Assist validated workflows with governed, observable AI agents.

**Status:** Complete

Deliverables:

- Research, authoring, editorial, diagram, QA, and publisher roles
- Human approval gates and traceable agent outputs
- Failure handling and operational observability

Exit criteria:

- Agents improve an existing validated workflow without becoming a new source
  of truth or bypassing human approval.
- Deterministic fake-provider execution and adversarial controls pass without a
  secret or live provider call.
- Every proposal, verification, review decision, usage record, and lifecycle
  state is inspectable as a versioned artifact.

## M5 — RTB Publishing Platform

**Goal:** Package proven workflows into a coherent multi-project platform.

**Status:** M5A.3 evidence collection; active platform expansion paused

Potential capabilities:

- Founder workspace and dashboard
- Multi-project knowledge and analytics
- Team collaboration and commercial workflows
- Selectively open-sourced foundational components

M5A delivered:

- A local two-project registry and deterministic read model
- A loopback-only API and responsive founder dashboard
- Governed execution of existing validated workflows
- Persistent, redacted, recoverable local job records

Hosted accounts, collaboration, billing, remote projects, and commercial
workflows remain deferred until internal use provides evidence for M5B.

M5A.1 adds safe project registration, live indexing, detailed project evidence,
cancellable job history, diagnostics, and a pilot protocol. No completed pilot
sessions are claimed yet.

M5A.2 adds guided external-project onboarding through an explicit, local-only
allowlist; external projects remain read-only. It also adds registry backup and
restore, clearer workflow progress and recovery guidance, and broader local
security and browser-shell coverage. This hardening is not pilot evidence.

M5A.3 is the active evidence cycle. RTB Publishing now reports pilot session,
represented-project, date-span, outcome, and task coverage while preserving a
manual decision gate. The cycle cannot complete until genuine records span the
published two-week threshold.

M5A exit criteria are defined in RFC-004. Any M5B exit criteria require a new
RFC after internal pilot evidence exists.
