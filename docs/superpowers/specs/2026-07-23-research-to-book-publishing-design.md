# RTB Publishing Research-to-Book Publishing Design

<!-- cspell:words devex passwordless WCAG gstack -->

**Status:** Reviewed and approved for implementation planning
**Date:** 2026-07-23
**Initial reference publication:** The RTB Publishing Playbook for AI Founders

## 1. Purpose

RTB Publishing will become a reusable research-to-book publishing application. It
will help one creator research a bounded topic, organize traceable evidence,
compose and enrich a beta book, review that beta in Notion, and publish an
approved edition as HTML, PDF, and EPUB to a private subscriber library.

The existing YC Playbook is the migration reference, not a hard-coded product
type. The same workflow must support future books about consulting methods,
industries, technologies, and other bounded topics without topic-specific
application logic.

The product is local-first, not offline-only. Canonical content and operational
state persist locally. Approved provider operations may process the minimum
necessary classified data externally under an explicit egress policy.

## 2. Product Decisions

The approved product decisions are:

- Use a governed hybrid research model. Creator-approved sources are primary;
  wider search may propose additional sources for approval.
- Support capability-tiered ingestion of public web pages, text PDFs, Markdown,
  text documents, YouTube videos, podcasts, and manual files.
- Use versioned locators and timestamps for audio and video evidence.
- Use evidence-first visuals: traceable charts, editable diagrams, labeled AI
  illustrations, and external media with operational rights records.
- Run the Creator Studio privately and locally.
- Persist authored content in Markdown and Git; store operational state in
  SQLite.
- Deploy only immutable, approved release bundles to a hosted subscriber
  library.
- Use Ghost as the first subscriber-library adapter, subject to an early
  capability spike.
- Manage initial subscriber access through a manual email allowlist.
- Use task-specific provider contracts with OpenAI as the first AI provider.
- Store Editorial Memory in global, series, and book layers.
- Import Notion edits and comments as proposals rather than direct canonical
  changes.
- Use three lifecycle approval gates: Blueprint, Beta, and Publish.
- Implement the minimum Blueprint, Beta, and Publish approvals in Increment 1
  and require that order. The single Publish Gate binds the validated local
  candidate and creates the immutable final manifest consumed by Increment 3.
- Publish HTML, PDF, and EPUB. DOCX is no longer a supported release format.
- Migrate the YC Playbook first, then create a short second pilot book.

## 3. Architectural Direction

RTB Publishing uses a governed pipeline with bounded AI workers. Deterministic
workflow state, evidence relationships, review gates, quality policies, and
release manifests are owned by RTB Publishing. Providers, skills, and MCP
integrations operate inside individual stages but cannot bypass those controls.

```text
Book brief
  -> Blueprint Gate
  -> governed hybrid research
  -> evidence and claim graph
  -> approved book architecture
  -> evidence-grounded composition
  -> evidence-first visual enrichment
  -> automated quality review
  -> Beta Gate
  -> Notion beta review
  -> proposed reconciliations
  -> canonical Markdown
  -> local Publish Gate and immutable HTML + PDF + EPUB release
  -> hosted staging and verification
  -> Ghost subscriber-library activation
```

This architecture reuses the repository's research records, governed agents,
Markdown model, quality checks, Notion export, job manager, and publishing
pipeline. It generalizes or replaces fixed-volume, fixed-chapter, DOCX, and
one-way-only assumptions.

## 4. Product and Trust Boundaries

### 4.1 Local Creator Studio

The private Creator Studio contains:

- Book Projects and reusable Book Blueprints
- Research Desk and Evidence Gateway
- Evidence and Claim Graph
- Book Planner and Chapter Studio
- Editorial Memory
- Composition Pipeline
- Visual Studio
- Quality Center
- Notion Review Bridge
- Publication Console

Canonical Markdown, structured research records, workflow state, credentials,
research archives, drafts, rejected proposals, and Editorial Memory persist
locally.

### 4.2 AI and Media Provider Processing

AI and media provider processing is distinct from hosted identity persistence.
Each field considered for synthesis, drafting, embeddings, image generation,
transcription, or tool use has a provider-processing classification and egress
policy. An adapter must declare:

- The exact fields transmitted
- Processing purpose and destination
- Provider, model, region, and capability version
- Retention, training, and deletion terms
- Redaction and minimization behavior
- Required creator consent

Secrets, credentials, and subscriber email, identity, authentication, session,
access, and reading data are prohibited to AI and media providers. Sensitive
project inputs require explicit approval. The run ledger records approved
egress without storing secret values.

### 4.3 Hosted Subscriber Library

Ghost is the first hosted adapter. It initially provides:

- Manual email allowlist
- Passwordless subscriber authentication
- Book and edition pages
- Protected HTML reading
- Protected PDF and EPUB downloads
- Release metadata
- Minimal access and operational analytics

Only approved release artifacts, book metadata, and the minimum
contract-enumerated subscriber fields may leave the local environment for
hosting. The configured hosted identity adapter may receive only the fields
needed for the allowlisted access purpose, such as normalized email,
invitation, provider-subject, authentication, session, revocation, and
release-access state. Its contract records the exact purpose, consent or other
legal basis, notice, retention, deletion and revocation procedure, backup
treatment, region, and minimization rationale. Extra fields fail closed.

Creator Studio sends immutable release bundles; Ghost never reads the local
RTB Publishing database, drafts, evidence archive, rejected proposals, or Editorial
Memory.

### 4.4 Integration Boundaries

Notion is a review surface, not the canonical database. Ghost is a distribution
surface, not an authoring environment. AI and media providers are replaceable
processors, not owners of project state.

The browser cannot write files directly. Approved Creator Studio actions invoke
an authorized local mutation service. This supersedes ADR-005's absolute
read-only UI rule while preserving a narrow, validated file-write boundary.

That service binds only to loopback and accepts only an allowlisted loopback
`Host` and port. It rejects DNS-rebinding and forwarded-host ambiguity and
requires same-origin JSON with an exact content type, Origin and Fetch Metadata
checks, session-bound CSRF, and an authenticated short-lived local capability
or session. Header, body, field, batch, and operation rates are bounded.
Credentials never appear in URLs, redirects, logs, or browser history.

## 5. Canonical Data and Authority

### 5.1 Authority Matrix

| Data | Authority | Notes |
| --- | --- | --- |
| Manuscript, worksheets, citations | Markdown and Git | Human-readable source |
| Book and chapter configuration | Versioned Markdown/YAML | Portable project contract |
| Sources, evidence, claims, rights | Versioned local records | Git-trackable when safe |
| Jobs, attempts, locks, checkpoints | SQLite | Operational and transactional |
| Review proposals and decisions | SQLite plus immutable audit export | Linked to content hashes |
| Editorial Memory observations | SQLite | Approved rules exportable to Markdown |
| Search and FTS indexes | SQLite | Rebuildable derived state |
| Artifact dependency graph | SQLite | Rebuildable from manifests |
| Release bundle and manifest | Immutable files | Addressed by release ID and hash |
| Release staging attempts and evidence | Local SQLite append-only ledger | Operational authority; immutable export optional |
| Active release pointer and monotonic revision | Hosted adapter release-state store | Local SQLite is a derived observation only |
| Subscriber identity and sessions | Configured hosted identity adapter | Minimum hosted operational state |

No entity or field may have two simultaneous authorities. New fields require an
authority assignment before implementation.

### 5.2 Core Record Contracts

The following records require versioned schemas before their first use:

- `BookProject`
- `BookBlueprint`
- `Source`
- `Evidence`
- `Claim`
- `Contradiction`
- `RightsRecord`
- `ReviewProposal`
- `EditorialDecision`
- `MemoryRule`
- `WorkflowRun`
- `WorkflowStageAttempt`
- `QualityFinding`
- `Artifact`
- `ReleaseManifest`
- `ReleaseStagingAttempt`

Every record includes a stable ID, `schema_version`, creation and update
timestamps, actor or producer, and validation rules. Content-bearing or
derived records include input and output hashes. Schema changes require
forward migrations, fixture coverage, and documented rollback limits.

### 5.3 Mutation Protocol

Canonical changes use one mutation service and ADR-008's versioned snapshot
protocol. Lifecycle transitions and canonical mutations share the per-project
writer lock through durable commit. After lock acquisition, a mutation
revalidates expected content and lifecycle versions before snapshot visibility
changes and again in the guarded SQLite commit.

Before replacement, the service durably writes or verifies content-addressed
preimages. It builds and verifies a complete next immutable snapshot, `fsync`s
its files and directories, and publishes every multi-file change through one
atomic versioned root-pointer replacement. Readers resolve one immutable root
per operation, so they see either the complete prior snapshot or the complete
next snapshot.

The journal records explicit validate, preimage, prepared-snapshot,
pointer-published, state-committed, and complete phases. Pointer replacement and
its parent directory are durable before the SQLite state commit. Startup
recovery uses the phase table and verified prior snapshot to complete or
physically roll back an interrupted operation before accepting new work. A
missing or mismatched preimage, stale lifecycle version, or stale expected hash
fails closed.

## 6. Reusable Book Model

Each Book Project has a portable directory containing configuration, Markdown,
structured research records, assets, review exports, and release metadata. It
can be backed up, versioned, reopened without a hosted service, and regenerated
with another compatible provider.

A Book Blueprint defines the initial architecture hypothesis approved before
research:

- Working title, series, edition, and stable project ID
- Target subscribers and reader outcome
- Topic, thesis, scope, counterarguments, and non-goals
- Research questions and supported source capability tiers
- Trusted, proposed, excluded, and restricted source policies
- Freshness, materiality, evidence, and rights requirements
- Parts, chapter contracts, reader journey, and required chapter elements
- Editorial Memory scopes and initial autonomy
- Visual policy and design theme
- Citation, attribution, brand, and rights rules
- Provider-egress policy, budgets, and approvals
- Notion destination
- Release formats and subscriber visibility

Evidence collection may refine parts, ordering, and individual chapter details
as granular architecture revisions. A material change to the target reader,
promised outcome, scope boundary, thesis, or a chapter contract invalidates the
current Blueprint approval. Composition cannot begin or resume until a human
reapproves the new Blueprint version. Non-material evidence refinements remain
append-only review decisions and do not create another lifecycle gate.

Organizations such as YC, McKinsey, or Bain may be research subjects or source
families. RTB Publishing must not imply endorsement, reproduce protected
publications, or imitate protected visual identities.

## 7. Evidence Gateway, Provenance, and Rights

### 7.1 Provenance Chain

```text
Source
  -> evidence excerpt, datum, or observation
  -> supported claim
  -> synthesis or contradiction
  -> chapter section
  -> visual
  -> published citation
```

Material facts, quantitative claims, quotations, comparisons, and
consequential advice require direct evidence. Synthesis requires multiple
appropriate sources. Common knowledge, illustrative examples, connective
prose, and clearly labeled interpretation may use explicit exemptions.

Exemptions, sampled evidence audits, and human waivers are recorded. Search
results and raw model output cannot directly become canonical claims or
publication text.

Audio and video evidence includes a versioned locator and timestamp. Charts
record source data, transformations, labels, and citations. Generated images
record provider, model, prompt reference, generation time, usage status, and
required disclosure.

### 7.2 Source Capability Tiers

Tier 1 supports:

- Public web pages permitted for access
- Text-based PDFs
- Markdown and text documents
- YouTube videos with available lawful transcripts
- Podcast episodes with transcripts or lawfully downloadable audio
- Creator-supplied local files

Tier 2 is implemented behind explicit capabilities:

- Scanned-PDF OCR
- Generated transcription
- Speaker diarization
- Additional languages
- Locator regeneration and alignment

Paywalled, access-restricted, robots-disallowed, unclear-rights, unstable, or
over-budget sources use metadata-only or manual fallback paths.

### 7.3 Evidence Gateway Security

All source material is untrusted data, never executable instruction. The
threat model and tests cover:

- Prompt-injection isolation
- SSRF and private-address blocking
- Redirect and DNS-rebinding controls
- Download, extracted-text, archive, and decompression limits
- File-type verification and media/PDF sandboxing
- Path traversal and symbolic-link rejection
- HTML sanitization
- Secret storage and log redaction
- OAuth scope minimization and connector consent
- Provider-egress classification
- Subscriber PII, abuse, and rate limits

### 7.4 Rights Ledger

Each reusable source, excerpt, visual, and generated asset links to a versioned
rights record containing:

- License or permission basis and proof artifact
- Rights holder and decision owner
- Permitted uses and derivative-use conditions
- Attribution terms
- Territory and jurisdiction notes
- Expiry or recheck date
- Revocation and decision history
- Affected artifacts and releases

Expired, revoked, or changed rights invalidate downstream artifacts and trigger
a documented removal and rebuild workflow.

## 8. Editorial Memory and Progressive Autonomy

Editorial Memory is explicit, inspectable, editable, and reversible:

```text
Global creator profile
└── Series profile
    └── Book profile
```

Each learned rule records the original proposal, accepted revision or
rejection, creator rationale, scope, confidence, supporting examples,
provider/model context, dates, and active state.

Memory promotion is governed:

1. One accepted edit becomes a scoped observation.
2. Repeated consistent observations may become a proposed preference.
3. The creator approves a preference before it becomes a reusable rule.
4. High-confidence approved rules may be applied automatically to beta drafts,
   with visible diffs and rollback.

The highest autonomy level produces a beta for review. It never bypasses a
lifecycle gate or performs final publication.

## 9. Provider Architecture

Provider neutrality uses task-specific capability contracts, not one generic
text interface. Initial contracts include:

- Research synthesis
- Structured claim and outline generation
- Evidence-grounded drafting
- Embeddings
- Image generation
- Transcription
- Tool use

Each run records the provider, model, parameters, prompt version, capability
contract version, approved egress, usage, cost, and output hash. Unsupported
capabilities fail visibly. RTB Publishing does not silently change providers,
models, or capability levels.

## 10. Lifecycle and Approval Model

The lifecycle is one versioned, guarded state machine with an append-only
transition history. Transitions record actor, reason, expected version, and
policy results. Lifecycle transitions and canonical mutations share the
per-project writer lock through durable commit. A transition or mutation
revalidates its expected lifecycle version after lock acquisition; stale work
returns `conflict` without lifecycle or canonical change.

The three lifecycle gates are:

1. **Blueprint Gate:** approves the brief, research plan, source policy,
   initial architecture hypothesis, budgets, and provider-egress policy before
   research or other expensive work. Material reader, outcome, scope, thesis,
   or chapter-contract changes invalidate approval and require a human to
   approve the revised Blueprint before composition.
2. **Beta Gate:** approves a complete beta for Notion export.
3. **Publish Gate:** requires an explicit human Publish action after all
   blocking proposals and quality policies pass. In Increment 1 it binds the
   exact local release-candidate envelope and authorizes the immutable final
   manifest. Increment 3 hosted staging and activation consume that approved
   release without another Publish gate.

Source, claim, chapter, and visual decisions occur inside lifecycle stages;
they are review decisions, not additional lifecycle gates.

Increment 1 implements the minimum guarded transitions, durable approval
records, and human actions for all three gates. The YC migration traverses
Blueprint, Beta, and Publish in that order, and Publish fails closed without a
current Beta approval. Increment 2 may deepen and automate beta-quality
preparation and evaluation, but it reuses the existing Beta Gate and cannot
introduce or defer it.

The book lifecycle is:

1. Brief and Blueprint Gate
2. Evidence collection
3. Evidence-refined architecture
4. Composition
5. Visual enrichment
6. Quality review and Beta Gate
7. Notion beta
8. Proposal reconciliation
9. Release preparation and Publish Gate
10. Distribution and verification

## 11. Creator Studio Experience

Primary screens are:

1. Library
2. New Book Wizard
3. Research Desk
4. Outline Builder
5. Chapter Studio
6. Visual Studio
7. Beta Review
8. Release Center

Every long-running operation uses the same user-visible states:

- `idle`
- `queued`
- `running`
- `partial`
- `blocked`
- `failed-retryable`
- `failed-terminal`
- `stale`
- `conflict`
- `cancelled`
- `succeeded`

Each state provides a clear next action. Screens must also specify loading,
empty, offline, permission, stale-data, and recovery behavior. Double
submission and stale-tab actions are rejected through idempotency keys and
expected versions.

## 12. Notion Review and Reconciliation

Notion export creates:

- An immutable normalized export base
- Stable section and block IDs
- Notion page, block, and revision IDs
- Canonical content hashes
- A conversion report for unsupported or lossy blocks

Import performs a normalized-AST three-way comparison between the export base,
current Markdown, and current Notion representation. Edits, deletions,
reordering, and comments become individual proposals.

The creator can accept, revise, reject, or defer a proposal. Accepted proposals
invoke the authorized mutation service. Concurrent local and Notion changes
produce explicit conflicts and preserve all three versions.

Two-way reconciliation requires a new accepted RFC and an ADR that supersedes
the one-way-only decision in the existing Notion specification.

## 13. Quality Policy

One versioned, machine-readable policy registry governs the CLI, workers,
Creator Studio, and Publish action. Each rule has:

- Stable rule ID and version
- Applicability and severity
- Deterministic evaluator where possible
- Evidence and result
- Remediation guidance
- Blocking or advisory status
- Waiver policy and audit record

Publication is blocked by material unsupported claims, broken evidence
relationships, unresolved high-severity contradictions, missing required
provenance, rights failures, required accessibility failures, blocking Notion
proposals, failed output generation, manifest mismatches, or failed subscriber
authorization.

Release verification uses pinned tool versions and target profiles:

- HTML targets WCAG 2.2 Level AA, with automated and required manual checks
- EPUB targets EPUB 3 and passes the pinned W3C EPUBCheck configuration
- PDF passes pinned structural, font, metadata, link, and accessibility checks;
  a named, versioned PDF profile must be accepted through an RFC-007 amendment
  before PDF implementation begins
- Download sessions define authentication, expiry, replay, and revocation rules
- Analytics fields are allowlisted; manuscript content and private research
  never enter analytics

## 14. Workflow, Failure, and Recovery

### 14.1 Durable Job Ledger

Every workflow run and stage attempt records:

- Run, stage, and attempt IDs
- Parent and retry lineage
- Input fingerprint and idempotency key
- Provider, model, prompt, and capability versions
- Status, timestamps, progress, and verification result
- Retry classification and attempt limit
- Checkpoint and recovery action
- Sanitized error and user-visible message

Errors are classified as retryable, blocked-awaiting-action, cancelled, or
terminal. Cancellation, restart, stale-job recovery, and crash recovery are
explicit state transitions. Restarting cannot duplicate records or corrupt
canonical state.

The normative visible mapping is: retryable to `failed-retryable`,
blocked-awaiting-action to `blocked`, cancelled to `cancelled`, and terminal to
`failed-terminal`. Unreconciled expired ownership is `stale`; an expected
version mismatch is `conflict`. A retry reserves a new linked attempt and
becomes `queued` rather than rewriting the failed attempt.

Local SQLite is the append-only operational authority for hosted staging
attempts and evidence. Increment 1 may emit only an unreserved deterministic
future-staging hint. In Increment 3, after authoritative pointer
reconciliation, one transaction reserves the real attempt ID with the expected
pointer revision before outbox creation or dispatch. It then appends immutable
observations and one terminal finalization; every retry receives a new attempt
linked to its predecessor. Immutable export is optional. The hosted adapter
release-state store, not SQLite, is authoritative for the active release
pointer and monotonic revision.

### 14.2 Artifact Graph

Derived artifacts form a content-addressed dependency graph. Each artifact
records input hashes, policy/configuration versions, provider and prompt
versions, dependencies, and output hash. Invalidation traverses downstream
edges only.

### 14.3 Resource Budgets

Projects have configurable budgets bounded by safe application ceilings:

- Source count and per-source bytes
- Total project and temporary storage
- Transcript duration and extracted text
- Context and output tokens
- Per-run and per-project model cost
- Concurrent jobs and provider request rate
- Stage and request timeouts

Creator Studio shows an estimate before expensive execution and pauses cleanly
when a budget is reached.

### 14.4 Search and Memory Use

SQLite indexes and FTS5 support bounded, paginated local search. The index is
derived and rebuildable; it is never canonical.

Rendering and publication are disk-backed. Large source, manuscript, and
artifact bodies are streamed rather than retained together in application
memory.

## 15. Publication and Subscriber Delivery

Increment 1 owns the minimum gate sequence and local release preparation:

1. Record the human Blueprint approval before governed work.
2. Revalidate research and manuscript integrity.
3. Rebuild and validate affected visuals.
4. Generate HTML, PDF, and EPUB in a bounded staging directory.
5. Verify content, metadata, accessibility, links, and file integrity.
6. Record the human Beta approval for the complete local beta.
7. Create the immutable candidate envelope and calculate its hash.
8. Record the human Publish approval against that exact hash and lifecycle
   version.
9. Generate and checksum the immutable final manifest bound to that approval.
   Any future-staging reference in it is a deterministic, unreserved hint only.

Increment 3 consumes that approved immutable release. It does not add another
Publish gate:

1. Reconcile the authoritative active pointer and transactionally reserve the
   local append-only staging-attempt ID with its expected revision before
   outbox creation or remote dispatch.
2. Stream artifacts to a staged release ID.
3. Verify hosted artifacts and access controls against the local manifest.
4. Reconcile the authoritative hosted active-pointer pair.
5. Compare-and-set that pair once to activate the approved release.
6. Reconcile or compensate remaining side effects with idempotent operations.

Ghost compatibility is not assumed. An early, time-boxed spike must test
invitations, passwordless access, protected HTML, binary downloads, search,
staging, activation, rollback, API limits, and webhooks. Missing capabilities
use a documented sidecar or object-storage fallback behind the same hosted
library adapter.

Release bundles are immutable while retained. Visibility, allowlists, sessions,
and subscriber records are mutable. Retention policy covers unpublishing,
privacy deletion, legal holds, audit redaction, release garbage collection, and
explicit destructive removal with tombstone metadata.

A failed publication leaves the prior release pointer active. Protected
downloads use authenticated, short-lived access rather than permanent public
URLs. The configured hosted release-state store is authoritative for the active
pointer and its monotonic revision; local SQLite stores only append-only,
reconciled observations.

## 16. Testing and Evaluation Strategy

The repository's Node test runner remains the deterministic test foundation.
Testing uses three integration tiers:

1. Deterministic fakes for normal local and CI runs
2. Recorded, sanitized contract fixtures for adapter compatibility
3. Opt-in staging E2E tests with isolated OpenAI, Notion, and Ghost resources

Required coverage includes:

- Unit tests for schemas, migrations, transformations, state transitions,
  mutation recovery, artifact invalidation, and policy rules
- Security tests for Evidence Gateway and connector boundaries
- Contract tests for AI, search, media, Notion, rendering, and Ghost adapters
- E2E tests for all three gates and the complete lifecycle
- Crash injection after every durable checkpoint
- Duplicate submission, stale tab, two-tab concurrency, cancellation, expired
  credentials, partial upload, rollback, and safe rerun
- Accessibility, rights, citation, provenance, and release-integrity tests

Task-specific, versioned AI evaluation suites cover:

- Research-plan usefulness
- Evidence-to-claim faithfulness
- Citation precision and sampled recall
- Outline and chapter quality
- Unsupported-claim rate
- Editorial Memory adherence
- Visual-purpose selection and provenance
- Notion-proposal interpretation

Model, prompt, or capability-contract changes compare against committed
baselines and release thresholds.

### 16.1 YC Migration Oracle

YC migration preserves normalized chapter text, order, headings, citations,
worksheets, assets, links, and metadata. Approved differences include project
layout, generated markup, and replacement of DOCX with PDF. Migration produces
a machine-readable difference report and a human visual review.

The migration must generalize project discovery, remove fixed Volume 1 and
23-chapter assumptions, introduce PDF production, and use safe disk staging
before compatibility is claimed.

### 16.2 Pilot Scorecard

Thresholds are set before each pilot. The scorecard measures:

- Evidence precision and sampled recall
- Unsupported-claim and publication-defect rates
- Proposal acceptance and edit distance
- Blinded editorial rubric scores
- Time-to-beta and creator intervention time
- Model and infrastructure cost
- Editorial Memory on/off performance

Failure to meet a stop/go threshold blocks automatic-beta promotion and informs
the next stage plan.

## 17. Delivery Program

Stages A-G remain the complete product roadmap, but delivery occurs through
three independently releasable increments.

### Increment 1 — YC Migration and Publishing Foundation

Includes Stage A and the minimum publication foundation needed to:

- Introduce versioned Book Projects and Blueprints
- Generalize project and chapter discovery
- Establish Markdown/SQLite authority and safe mutations
- Replace DOCX with verified PDF
- Produce HTML, PDF, and EPUB locally
- Migrate the YC Playbook through the semantic oracle
- Complete the Ghost capability spike
- Implement the minimum guarded Blueprint, Beta, and Publish approvals and move
  the YC migration through them in order
- Run the single Publish Gate locally and generate the Publish-bound immutable
  final manifest

### Increment 2 — Short-Book Evidence-to-Beta

Includes Stages B-F:

- Tier 1 multimodal Evidence Gateway
- Research planning, evidence graph, composition, and visual enrichment
- Provider contracts and OpenAI implementation
- Governed Editorial Memory
- Deeper and more automated beta-quality evaluation through the existing Beta
  Gate, plus three-way Notion reconciliation
- A complete short pilot through accepted canonical proposals

### Increment 3 — Subscriber Delivery

Includes Stage G:

- Consume an approved immutable Increment 1 release without a second Publish
  gate
- Ghost adapter plus proven fallbacks
- Allowlisted subscriber access
- Protected HTML, PDF, and EPUB
- Release-pointer activation, rollback, unpublish, and retention controls
- Final end-to-end pilot scorecard

Each increment has its own implementation plan, test artifact, acceptance
report, and release decision. Later increments cannot redefine earlier
contracts without migrations and a recorded architectural decision.

## 18. Governance Prerequisites

The governance package required for Stage A planning is complete. The accepted
records are:

- [RFC-006 — Research-to-Book Product Pivot](../../../governance/RFC/RFC-006-Research-to-Book-Product-Pivot.md)
- [ADR-008 — Markdown, SQLite Authority, and Mutations](../../../governance/ADR/ADR-008-Markdown-SQLite-Authority-and-Mutations.md)
- [ADR-009 — Lifecycle and Durable Workflow](../../../governance/ADR/ADR-009-Lifecycle-and-Durable-Workflow.md)
- [ADR-010 — Provider Capabilities and Data Egress](../../../governance/ADR/ADR-010-Provider-Capabilities-and-Data-Egress.md)
- [ADR-011 — Notion Three-Way Proposal Reconciliation](../../../governance/ADR/ADR-011-Notion-Three-Way-Proposal-Reconciliation.md)
- [ADR-012 — Immutable Releases and Ghost Adapter](../../../governance/ADR/ADR-012-Immutable-Releases-and-Ghost-Adapter.md)
- [RFC-007 — Research-to-Book Publishing](../../../governance/RFC/RFC-007-Research-to-Book-Publishing.md)
- [Research-to-Book Threat Model](../../../governance/policies/RESEARCH-TO-BOOK-THREAT-MODEL.md)

The root roadmap records the new increment sequence. The governance index
preserves links to the older decisions and their exact replacement scopes. Two
Increment 1 implementation prerequisites remain open:

- Before PDF implementation begins, accept an RFC-007 amendment that names and
  versions the PDF accessibility and archival profile, renderer, validators,
  and manual review procedure.
- Complete the time-boxed Ghost capability spike, classify every ADR-012 matrix
  row, prove every required row directly or through a documented fallback, and
  leave no required row `infeasible` before accepting a production Ghost
  adapter or claiming Ghost compatibility.

## 19. Success Criteria

The upgraded system succeeds when:

1. The YC Playbook passes the semantic migration oracle and produces verified
   HTML, PDF, and EPUB.
2. A short second book moves from approved Tier 1 research through a complete
   Notion beta and accepted canonical proposals.
3. Material claims and meaningful visuals satisfy provenance and rights rules.
4. Notion reconciliation never silently overwrites Markdown or human edits.
5. A human-approved release is reproducible from its manifest.
6. Allowlisted subscribers can read protected HTML and download protected PDF
   and EPUB.
7. A failed publication leaves the prior release active.
8. Editorial Memory beats the declared no-memory baseline without losing
   inspectability or reversibility.
9. Pilot quality, time, cost, and intervention thresholds are met.

## 20. NOT in Scope

- Native payments or subscription billing
- Public account registration
- Multi-creator teams and permissions
- Fully autonomous final publication
- Opaque fine-tuning on creator decisions
- Topic-specific generators
- Native mobile applications
- Social reading, comments, or community features
- Public marketplaces for books, prompts, or templates
- Custom subscriber authentication while Ghost and its adapter are sufficient
- Tier 2 ingestion capabilities until their individual contracts are approved

## 21. What Already Exists

- Research source, evidence, claim, contradiction, and freshness records
- Governed agent proposals with explicit review and apply steps
- Prompt-injection markers, sensitive-path protection, and log redaction
- Persistent local jobs with cancellation and restart handling
- Markdown chapter contracts and publication checks
- HTML, EPUB, and DOCX generation that will be generalized to HTML, EPUB, PDF
- One-way Notion export for the 23-chapter YC publication
- Local Creator Studio shell, workspace index, and pilot records

The implementation must reuse these capabilities where their contracts remain
valid and replace fixed-volume or one-way assumptions through migrations.

## 22. Parallelization Strategy

| Lane | Scope | Depends on |
| --- | --- | --- |
| A | Schemas, authority, mutation service, lifecycle | Governance ADRs |
| B | Renderer generalization, PDF, migration oracle | Core project schema |
| C | Evidence Gateway, rights, provider contracts | Threat model, schemas |
| D | Creator Studio operation states and policy UI | Lifecycle, policy registry |
| E | Ghost capability spike | Release contract |
| F | Test fixtures and evaluation harness | Core contracts |

Lanes B, C, E, and F can begin after Lane A publishes stable contracts. Notion
reconciliation depends on A and C. Subscriber delivery depends on B and E.
Shared schema and policy files are merged through Lane A to avoid parallel
contract conflicts.

## 23. Implementation Tasks

- [x] **T1 (P1)** — Write the pivot RFC, required ADRs, publishing RFC, and
  threat model.
- [ ] **T2 (P1)** — Define and test versioned core schemas and migrations.
- [ ] **T3 (P1)** — Implement the authority matrix, mutation journal, and
  recovery algorithm.
- [ ] **T4 (P1)** — Generalize Book Project discovery and migrate the YC book.
- [ ] **T5 (P1)** — Replace DOCX with verified, disk-backed PDF publication.
- [ ] **T6 (P1)** — Implement the lifecycle state machine, three gates, durable
  job ledger, and shared operation states.
- [ ] **T7 (P1)** — Implement the policy registry, Evidence Gateway, rights
  ledger, budgets, and provider contracts.
- [ ] **T8 (P1)** — Implement artifact dependencies, FTS5 indexes, and
  incremental rebuilding.
- [ ] **T9 (P1)** — Implement stable-ID Notion export and three-way proposal
  import.
- [ ] **T10 (P1)** — Complete the Ghost spike and immutable release adapter.
- [ ] **T11 (P1)** — Build deterministic, contract, E2E, crash-injection, and AI
  evaluation suites.
- [ ] **T12 (P1)** — Run both pilots against predeclared scorecards.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
| --- | --- | --- | --- | --- | --- |
| CEO Review | `plan-ceo-review` | Scope and strategy | 1 | CLEAR | 10 product decisions |
| Outside Voice | workspace subagent | Independent challenge | 1 | CLEAR | 15 findings resolved |
| Eng Review | `plan-eng-review` | Architecture and tests | 1 | CLEAR | 16 findings resolved |
| Design Review | `plan-design-review` | UI and UX gaps | 0 | NOT RUN | Recommended before UI implementation |
| DX Review | `plan-devex-review` | Developer experience | 0 | NOT RUN | Optional after Increment 1 |

**VERDICT:** CEO and engineering reviews are clear for implementation planning.
Two implementation prerequisites remain unresolved:

- The named, versioned PDF profile, renderer, validators, and manual review
  procedure require an accepted RFC-007 amendment before PDF implementation.
- The Ghost spike must classify every capability and record whether the
  production adapter is direct, uses a bounded fallback, or is infeasible.
