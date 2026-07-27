# Increment 1 Governance Package Implementation Plan

<!-- cspell:words WCAG -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the reviewed research-to-book design into accepted,
non-conflicting governance decisions before Increment 1 code begins.

**Architecture:** One pivot RFC changes the product direction. Five focused
ADRs define data authority, workflow, provider, Notion, and release boundaries.
A publishing RFC and expanded threat model make output and security
requirements executable. The roadmap and governance indexes identify every
superseded decision.

**Tech Stack:** Markdown, RTB Publishing RFC/ADR process, markdownlint, CSpell, Vale,
link checker, Node test runner

## Global Constraints

- Markdown and Git remain canonical for authored publication content.
- SQLite owns operational and transactional state only.
- Creator Studio may change Markdown only through the authorized local mutation
  service.
- Notion changes return as proposals through normalized-AST three-way merge.
- AI and media providers receive only classified, approved, minimized data.
- OpenAI is the first provider behind task-specific capability contracts.
- Lifecycle gates are exactly Blueprint, Beta, and Publish.
- Release formats are HTML, PDF, and EPUB; DOCX is superseded.
- Ghost is the first hosted adapter, subject to a capability spike.
- Hosted activation changes one active-release pointer to an immutable release
  ID.
- Increment 1 implements the minimum Blueprint, Beta, and Publish approvals and
  the YC migration traverses them in that order.
- The single human Publish action and Publish-bound local final-manifest
  generation occur in Increment 1.
- Increment 2 deepens beta quality through the existing Beta Gate; it does not
  introduce the gate.
- Increment 3 consumes the approved immutable release for hosted staging and
  activation; it does not add another Publish gate.
- No document may silently erase prior decisions; superseded records stay
  linked and readable.

---

### Task 1: Product Pivot RFC and Canonical Roadmap

**Files:**

- Create: `governance/RFC/RFC-006-Research-to-Book-Product-Pivot.md`
- Modify: `ROADMAP.md`

**Interfaces:**

- Consumes: reviewed research-to-book design and RFC-000
- Produces: accepted product boundary and three-increment delivery sequence

- [x] **Step 1: Write RFC-006**

Use the required RFC sections. Set status to `Accepted for Increment 1
planning`. State that RTB Publishing changes from a general founder workspace into a
local-first research-to-book Creator Studio with a private subscriber library.
Normatively include the three increments, three approval gates, Ghost-first
adapter, HTML/PDF/EPUB formats, YC migration, short pilot, scorecard, and the
requirement for ADR-008 through ADR-012 plus RFC-007.

- [x] **Step 2: Record explicit supersession**

RFC-006 must identify:

- RFC-004 hosted expansion pause is superseded only for the bounded
  allowlisted publishing adapter, not for teams, billing, or general cloud
  workspace features.
- RFC-005's one-way Notion rule remains active until ADR-011 and its
  implementation acceptance criteria pass.
- ADR-001's DOCX output is replaced by PDF for the new release contract.
- ADR-005's direct browser-write prohibition is narrowed by ADR-008's
  authorized mutation service.
- ADR-007 remains canonical for Markdown authority while its manual-only return
  path is superseded by proposal import under ADR-011.

- [x] **Step 3: Rewrite the roadmap priority**

Replace the current publication-only priority with
`Research-to-Book Increment 1 — YC Migration and Publishing Foundation`. Keep
the completed M0-M5 history. Add the three increments and state that they are
the canonical sequence after M5A.3; old M5B requirements remain deferred except
for the bounded Ghost publishing adapter accepted by RFC-006.

- [x] **Step 4: Validate Task 1**

Run:

```bash
node_modules/.bin/markdownlint-cli2 governance/RFC/RFC-006-Research-to-Book-Product-Pivot.md ROADMAP.md
node_modules/.bin/cspell lint governance/RFC/RFC-006-Research-to-Book-Product-Pivot.md ROADMAP.md --no-progress
node scripts/check-style.mjs
```

Expected: all commands exit 0.

- [x] **Step 5: Commit Task 1**

```bash
git add governance/RFC/RFC-006-Research-to-Book-Product-Pivot.md ROADMAP.md
git commit -m "docs: accept research-to-book product pivot"
```

### Task 2: Canonical State and Workflow ADRs

**Files:**

- Create: `governance/ADR/ADR-008-Markdown-SQLite-Authority-and-Mutations.md`
- Create: `governance/ADR/ADR-009-Lifecycle-and-Durable-Workflow.md`

**Interfaces:**

- Consumes: RFC-006 and the reviewed authority/lifecycle decisions
- Produces: field ownership, safe mutation, state machine, and job contracts

- [x] **Step 1: Write ADR-008**

Set status to `Accepted`. Include the authority matrix from the design,
versioned core-record envelope, content-addressed durable preimages, file and
directory `fsync` ordering, versioned snapshot-root visibility, an explicit
mutation-phase recovery table, optimistic hashes, SQLite rebuildable indexes,
shared lifecycle serialization, local request security, and the exact
amendment to ADR-005. Reject direct browser writes, best-effort dual writes,
and database-first manuscripts.

- [x] **Step 2: Write ADR-009**

Set status to `Accepted`. Define the three lifecycle gates and distinguish
granular review decisions from gates. Require a versioned guarded state
machine, append-only transitions, expected versions, durable run/stage/attempt
IDs, idempotency keys, explicit retry classes, cancellation, stale-job
recovery, resource budgets, normative retry-to-visible-state mappings, initial
Blueprint-hypothesis revision semantics, the minimum three-gate Increment 1
sequence, and user-visible operation states. Reject module-owned status fields
and in-memory-only jobs.

- [x] **Step 3: Validate Task 2**

Run markdownlint and CSpell on both files, then `node scripts/check-style.mjs`.
Expected: all commands exit 0.

- [x] **Step 4: Commit Task 2**

```bash
git add governance/ADR/ADR-008-Markdown-SQLite-Authority-and-Mutations.md governance/ADR/ADR-009-Lifecycle-and-Durable-Workflow.md
git commit -m "docs: decide canonical state and workflow architecture"
```

### Task 3: Provider, Notion, and Threat Boundaries

**Files:**

- Create: `governance/ADR/ADR-010-Provider-Capabilities-and-Data-Egress.md`
- Create: `governance/ADR/ADR-011-Notion-Three-Way-Proposal-Reconciliation.md`
- Create: `governance/policies/RESEARCH-TO-BOOK-THREAT-MODEL.md`

**Interfaces:**

- Consumes: RFC-006, ADR-004, ADR-007, and Evidence Gateway decisions
- Produces: provider capability, classified egress, reconciliation, and threat
  controls

- [x] **Step 1: Write ADR-010**

Set status to `Accepted`. Define task-specific capability contracts for
research synthesis, structured drafting, embeddings, image generation,
transcription, and tool use. Require provider/model/prompt/capability versions,
input classification, minimized fields, consent, retention/training metadata,
cost and token budgets, output hashes, and no silent fallback.
Separate AI and media provider-processing classification from minimum hosted
identity-adapter fields governed by purpose, consent or other legal basis,
retention, deletion, and minimization.

- [x] **Step 2: Write ADR-011**

Set status to `Accepted for implementation after RFC-006`. Preserve Markdown
authority. Define immutable export bases, stable section/block IDs, Notion
revision IDs, normalized AST conversion, three-way comparison, individual
proposals, unsupported-block reports, conflicts, and authorized mutation after
human acceptance. Explicitly supersede only ADR-007's manual-only return path.

- [x] **Step 3: Write the expanded threat model**

Cover local assets, source ingestion, external providers, Notion, the mutation
service, rendering, Ghost, object storage, and subscriber PII. Include trust
boundaries, abuse cases, controls, residual risks, incident evidence, and
security invariants for prompt injection, SSRF, DNS rebinding, redirects,
archives, malformed media, path traversal, HTML sanitization, OAuth scopes,
secrets, provider egress, log redaction, rights expiry, release integrity,
short-lived downloads, rate limits, retention, and deletion.

- [x] **Step 4: Validate Task 3**

Run markdownlint and CSpell on all three files, then
`node scripts/check-style.mjs`. Expected: all commands exit 0.

- [x] **Step 5: Commit Task 3**

```bash
git add governance/ADR/ADR-010-Provider-Capabilities-and-Data-Egress.md governance/ADR/ADR-011-Notion-Three-Way-Proposal-Reconciliation.md governance/policies/RESEARCH-TO-BOOK-THREAT-MODEL.md
git commit -m "docs: govern providers Notion and research security"
```

### Task 4: Release ADR and Publishing RFC

**Files:**

- Create: `governance/ADR/ADR-012-Immutable-Releases-and-Ghost-Adapter.md`
- Create: `governance/RFC/RFC-007-Research-to-Book-Publishing.md`

**Interfaces:**

- Consumes: RFC-006, ADR-001, and the reviewed release decisions
- Produces: immutable release, Ghost adapter, format, validator, retention, and
  rollback contracts

- [x] **Step 1: Write ADR-012**

Set status to `Accepted subject to Ghost capability spike`. Require immutable
release IDs, checksummed manifests, disk-backed staging, streaming transfer,
an authoritative hosted active-release pointer, an unreserved deterministic
Increment 1 future-staging hint, transactionally reserved Increment 3 local
SQLite attempt IDs with expected pointer revisions, an append-only
staging-attempt ledger, idempotent compensation, previous-release preservation,
protected short-lived downloads, and separation of immutable content from
mutable access/privacy records. Define the spike matrix and a sidecar or
object-storage fallback.

- [x] **Step 2: Write RFC-007**

Set status to `Accepted for Increment 1 implementation`. Define HTML, PDF, and
EPUB as required outputs and DOCX as removed. Require WCAG 2.2 Level AA targets
for HTML, pinned EPUBCheck for EPUB 3, pinned PDF structural/font/metadata/link
checks, an explicitly selected PDF accessibility profile before implementation,
release manifests, YC semantic migration oracle, output-specific tests,
staging, activation, rollback, unpublish, retention, and failure behavior.
Place the single Publish Gate and Publish-bound local final manifest in
Increment 1 together with its prerequisite minimum Blueprint and Beta
approvals; Increment 2 reuses the existing Beta Gate and Increment 3 consumes
the approved immutable release without another gate. Require an accepted
RFC-007 amendment to name and version the PDF profile before PDF
implementation.

- [x] **Step 3: Validate Task 4**

Run markdownlint and CSpell on both files, then `node scripts/check-style.mjs`.
Expected: all commands exit 0.

- [x] **Step 4: Commit Task 4**

```bash
git add governance/ADR/ADR-012-Immutable-Releases-and-Ghost-Adapter.md governance/RFC/RFC-007-Research-to-Book-Publishing.md
git commit -m "docs: decide research-to-book release architecture"
```

### Task 5: Governance Indexes and Cross-Document Verification

**Files:**

- Modify: `governance/README.md`
- Modify: `docs/01-architecture/README.md`
- Modify: `docs/superpowers/specs/2026-07-23-research-to-book-publishing-design.md`

**Interfaces:**

- Consumes: RFC-006, RFC-007, ADR-008 through ADR-012, and the threat model
- Produces: discoverable canonical governance map with no stale prerequisite
  language

- [x] **Step 1: Expand the governance index**

List the constitution/process, RFCs, ADRs, and policies by purpose. Add a
supersession table for ADR-001, ADR-005, ADR-007, RFC-004, and RFC-005 with the
exact replacement scope.

- [x] **Step 2: Expand the architecture index**

Add a `Research-to-book architecture` section linking the reviewed design,
RFC-006, RFC-007, ADR-008 through ADR-012, and the threat model.

- [x] **Step 3: Mark governance prerequisites complete**

In the reviewed design, replace the instruction to create the governance
package with a list of the accepted files. Keep implementation prerequisites
that still remain, including the Ghost spike and PDF accessibility-profile
selection.

- [x] **Step 4: Run complete verification**

Run:

```bash
node_modules/.bin/markdownlint-cli2 "**/*.md" "#node_modules/**" "#dist/**" "#build/**"
node scripts/check-links.mjs
node_modules/.bin/cspell lint "**/*.md" --no-progress --show-suggestions
node scripts/check-style.mjs
node --test tests/*.test.mjs
git diff --check
```

Expected: documentation checks exit 0 and all 61 baseline tests pass.

- [x] **Step 5: Commit Task 5**

```bash
git add governance/README.md docs/01-architecture/README.md docs/superpowers/specs/2026-07-23-research-to-book-publishing-design.md
git commit -m "docs: connect research-to-book governance"
```
