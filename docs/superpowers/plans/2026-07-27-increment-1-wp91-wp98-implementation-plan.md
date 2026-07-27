# Increment 1 WP91-WP98 Implementation Plan

**Status:** Approved for implementation
**Date:** 2026-07-27
**Increment:** YC Migration and Publishing Foundation
**Target outcome:** One reusable Book Project model takes the existing YC
Playbook through durable Blueprint, Beta, and Publish approvals and produces a
verified immutable HTML, PDF, and EPUB release.

**Implementation authorization:** The user authorized execution on 2026-07-27.
This approval authorizes plan execution only; it does not grant Blueprint,
Beta, Publish, legal, accessibility, Ghost-compatibility, or public-publication
approval. Those remain separate documented human evidence gates.

## Authority and Constraints

This plan implements, but does not replace, the accepted decisions in:

- [RFC-006 — Research-to-Book Product Pivot](../../../governance/RFC/RFC-006-Research-to-Book-Product-Pivot.md)
- [RFC-007 — Research-to-Book Publishing](../../../governance/RFC/RFC-007-Research-to-Book-Publishing.md)
- [ADR-008 — Markdown, SQLite Authority, and Mutations](../../../governance/ADR/ADR-008-Markdown-SQLite-Authority-and-Mutations.md)
- [ADR-009 — Lifecycle and Durable Workflow](../../../governance/ADR/ADR-009-Lifecycle-and-Durable-Workflow.md)
- [ADR-012 — Immutable Releases and Ghost Adapter](../../../governance/ADR/ADR-012-Immutable-Releases-and-Ghost-Adapter.md)
- [Research-to-Book Threat Model](../../../governance/policies/RESEARCH-TO-BOOK-THREAT-MODEL.md)

The implementation must preserve these boundaries:

- Markdown and versioned YAML remain canonical for authored book content and
  configuration.
- SQLite stores operational and transactional state, not manuscript prose.
- Creator Studio changes canonical files only through the authorized mutation
  service.
- The only approval gates are Blueprint, Beta, and Publish.
- A human performs the Publish action against one exact release candidate.
- HTML, PDF, and EPUB form one all-or-nothing release set.
- Production subscriber delivery remains Increment 3 scope.
- Provider-driven research, visual enrichment, Editorial Memory, and Notion
  three-way import remain Increment 2 scope.

## Existing Capabilities to Reuse

| Capability | Existing implementation | Increment 1 use |
| --- | --- | --- |
| Markdown chapter validation | `scripts/book-contract.mjs` | Generalize input from a Book Project instead of one fixed directory |
| HTML and EPUB generation | `scripts/build-book.mjs` | Split into reusable discovery, assembly, rendering, and verification modules |
| Output verification | `scripts/verify-outputs.mjs` | Expand to format-specific and integrated release verification |
| Schema validation | `scripts/platform/model.mjs` and existing JSON Schemas | Reuse the Ajv validation pattern for book and lifecycle records |
| Durable local jobs | `scripts/platform/jobs.mjs` | Evolve from JSON job files to the ADR-009 SQLite run and attempt ledger |
| Local request security | `scripts/platform/server.mjs` and `scripts/platform/security.mjs` | Reuse loopback, origin, CSRF, confirmation, path, and log-redaction controls |
| Governed proposals | `scripts/agents/runtime.mjs` | Reuse hash-bound approval and stale-proposal behavior where contracts align |
| Notion export | `scripts/notion-publication.mjs` | Consume generic Book Project discovery without adding import in Increment 1 |
| Research provenance | `scripts/research/*` and `schemas/research/*` | Preserve existing YC source and claim records during migration |

## Target Component Boundary

```text
Book Project YAML + canonical Markdown
                |
                v
        Book discovery/model
                |
        +-------+-------+
        |               |
        v               v
Lifecycle service   Snapshot reader
        |               |
        v               v
SQLite ledger      Build assembler
        |               |
        +-------+-------+
                |
                v
      HTML / PDF / EPUB renderers
                |
                v
       Integrated verification
                |
                v
    Release candidate + Publish Gate
                |
                v
       Immutable final manifest
```

## Delivery and Review Rules

- Use one branch and pull request per work package unless a work package is
  explicitly split below.
- Every pull request includes tests and documentation for its behavior.
- Do not combine schema ownership changes from multiple work packages in
  parallel branches.
- Keep compatibility adapters until the YC migration report and full suite
  pass; remove fixed-volume paths only in WP96.
- Never mark a human or external review complete from an automated test.
- A work package is complete only when its exit criteria and mapped acceptance
  tests pass.

## Dependency Sequence

| Work package | Depends on | Unlocks |
| --- | --- | --- |
| WP91 | Accepted governance package | Controlled implementation start |
| WP92 | WP91 | PDF implementation in WP98 |
| WP93 | WP91 | Ghost feasibility decision and Increment 3 adapter boundary |
| WP94 | WP91 | WP95, WP96, and WP97 |
| WP95 | WP94 | Safe local mutations and lifecycle persistence |
| WP96 | WP94 and stable read contracts from WP95 | YC migration oracle and generic publishing input |
| WP97 | WP94 and writer-lock contract from WP95 | Publish authorization for WP98 |
| WP98 | WP92, WP93, WP96, and WP97 | Increment 1 release decision |

## Task 1: WP91 — Plan, Baseline, and Traceability

### Goal

Freeze the implementation boundary, prove the current repository is healthy,
and create requirement-to-test traceability before behavior changes.

### Files

- Create this implementation plan.
- Create
  `docs/superpowers/plans/2026-07-27-increment-1-acceptance-test-plan.md`.
- Modify `ROADMAP.md` to link both plans without claiming approval.
- Later create `docs/05-operations/increment-1-acceptance-report.md` from the
  supplied template when the increment is evaluated.

### Steps

- [x] Record the current commit, Node, pnpm, Pandoc, Vale, and Mermaid versions.
- [x] Run `pnpm check`, `pnpm build`, and `pnpm verify:outputs` as the baseline.
- [x] Remove the current full-suite test isolation flake: concurrent research
  fixtures can temporarily change files included in the platform live-index
  fingerprint even though the isolated platform suite passes. Use isolated
  temporary roots or serialized ownership rather than accepting retries.
- [x] Record the existing YC chapter count, canonical content hashes, source
  registry hash, output filenames, and normalized HTML/EPUB semantic snapshot.
- [x] Create a requirement traceability table linking RFC/ADR clauses to
  WP91-WP98 and acceptance-test IDs.
- [x] Confirm that no work package claims beta reading, legal clearance,
  accessibility approval, Ghost compatibility, or public publication.
- [x] Record the user's implementation authorization before WP92-WP98 start;
  preserve all separate human and external approval gates.

### Exit Criteria

- The full baseline suite passes from a clean clone.
- The full suite passes repeatedly under its configured concurrency without
  relying on a rerun.
- Every Increment 1 acceptance criterion has an owner and test ID.
- Baseline evidence is machine-readable under
  `build/acceptance/increment-1/baseline/` and summarized in the future
  acceptance report.

### Suggested Commit

`docs: plan Increment 1 WP91 through WP98`

## Task 2: WP92 — PDF Profile and Toolchain Decision

### Goal

Satisfy RFC-007's blocking PDF prerequisite before PDF implementation begins.

### Files

- Create `governance/RFC/RFC-008-PDF-Publication-Profile.md` as an explicit
  amendment to RFC-007.
- Modify `governance/README.md` to index the accepted amendment.
- Create `publishing/pdf/toolchain.lock.json` for pinned tools, fonts,
  checksums, and supported platforms after the RFC is accepted.
- Create `docs/05-operations/pdf-accessibility-review.md` for the versioned
  manual procedure.
- Add fixtures under `tests/fixtures/publishing/pdf/`.

### Steps

- [ ] Compare candidate renderers against tagged structure, reproducibility,
  disk-backed processing, installation, licensing, and CI parity requirements.
- [ ] Select one named and versioned accessibility and archival profile.
- [ ] Select and pin the renderer, structural validator, profile validator,
  PDF parser, fonts, and visual-regression method.
- [ ] Specify language, metadata, links, bookmarks, reading order, alternative
  text, tables, figures, font substitution, and missing-glyph behavior.
- [ ] Specify waiver rules and require every waiver to be explicit, scoped,
  expiring, and human-approved.
- [ ] Define the screen-reader and visual review procedure with evidence fields.
- [ ] Accept RFC-008 before adding the PDF renderer to production code.

### Exit Criteria

- RFC-008 is accepted and linked from RFC-007 and the governance index.
- Tool and font versions are pinned with checksums or repository lock data.
- Compatibility fixtures demonstrate the selected toolchain on every supported
  local and CI platform.
- No repository text makes an unversioned “accessible PDF” claim.

### Suggested Commit

`docs: select the Increment 1 PDF publication profile`

## Task 3: WP93 — Time-Boxed Ghost Capability Spike

### Goal

Determine whether Ghost plus approved fallbacks can satisfy ADR-012 without
building production subscriber delivery.

### Files

- Create `spikes/ghost/capability-matrix.md`.
- Create `spikes/ghost/README.md` with setup, teardown, data classification,
  and evidence instructions.
- Create `spikes/ghost/fixtures/` containing only synthetic content.
- Create `spikes/ghost/results.schema.json` and a sanitized result record.
- Modify ADR-012 only through a new RFC or ADR if the spike requires a changed
  architectural decision.

### Steps

- [ ] Start a maximum two-working-day or 16-human-hour time box.
- [ ] Use a disposable Ghost environment and synthetic book/subscriber data.
- [ ] Test every ADR-012 capability-matrix row.
- [ ] Classify each row as `direct`, `fallback-required`, or `infeasible`.
- [ ] Record API behavior, scopes, rate limits, payload limits, idempotency,
  failure responses, deletion, retention, and rollback evidence.
- [ ] Select the documented sidecar or object-storage fallback where required.
- [ ] Stop immediately if credentials, private manuscript content, or real
  subscriber data would be required; revise the spike method first.
- [ ] Record a go, conditional-go, or blocked decision. Any required
  `infeasible` row blocks a production Ghost compatibility claim.

### Exit Criteria

- Every matrix row has evidence and one permitted classification.
- No required row remains unknown or `infeasible` for a go decision.
- The spike leaves no production credentials or subscriber data in Git.
- Increment 3 has an explicit adapter/fallback boundary and unresolved risks.

### Suggested Commit

`docs: record the Ghost capability spike`

## Task 4: WP94 — Versioned Book Project and Blueprint Schemas

### Goal

Create reusable, migratable contracts that do not assume one book, one volume,
or 23 chapters.

### Files

- Create `schemas/books/book-project.schema.json`.
- Create `schemas/books/book-blueprint.schema.json`.
- Create `schemas/books/book-chapter.schema.json`.
- Create `schemas/books/schema-migration.schema.json`.
- Create `scripts/books/model.mjs` and `scripts/books/migrations.mjs`.
- Create `tests/books-model.test.mjs` and versioned fixtures under
  `tests/fixtures/books/`.
- Create `books/volume-01-yc-playbook/book.project.yaml` as the migration
  target, without removing current discovery yet.

### Contract Requirements

Every core record includes a stable ID, `schema_version`, timestamps, actor or
producer, validation rules, and content hashes where applicable. The Book
Project owns identity, paths, locale, output profiles, blueprint reference,
and lifecycle reference. The Blueprint owns reader, promised outcome, scope,
thesis, source policy, budgets, provider-egress policy, parts, chapter
contracts, and materiality rules.

### Steps

- [ ] Define strict schemas with no undeclared properties.
- [ ] Define stable ID and path rules that reject traversal and symlinks.
- [ ] Define forward migrations, idempotency, input/output hashes, and rollback
  limits for every schema version.
- [ ] Add fixtures for one chapter, 23 chapters, multiple books, non-English
  metadata, invalid IDs, missing paths, and future unsupported versions.
- [ ] Add CLI validation and dry-run migration commands without canonical
  writes.
- [ ] Add a compatibility adapter so existing YC commands keep working until
  WP96 completes.

### Exit Criteria

- Valid projects of different sizes discover and validate deterministically.
- Invalid, stale, unsafe, and unknown-version records fail with problem,
  cause, and repair guidance.
- Migration is deterministic and idempotent; fixtures prove no source content
  changes.
- The existing suite remains green through the compatibility adapter.

### Suggested Commit

`feat: add versioned Book Project and Blueprint contracts`

## Task 5: WP95 — Authority, SQLite State, and Safe Mutations

### Goal

Implement ADR-008's single-writer, snapshot, journal, and recovery boundary
without moving manuscript authority into SQLite.

### Files

- Create `scripts/state/database.mjs` and versioned SQL migrations under
  `scripts/state/migrations/`.
- Create `scripts/state/project-lock.mjs`.
- Create `scripts/state/snapshots.mjs`.
- Create `scripts/state/mutation-journal.mjs`.
- Create `scripts/state/recovery.mjs`.
- Create `schemas/operations/mutation-command.schema.json` and
  `schemas/operations/mutation-result.schema.json`.
- Extend `scripts/platform/server.mjs` with a fixed mutation allowlist only
  after service-level tests pass.
- Create `tests/mutations.test.mjs` and crash fixtures under
  `tests/fixtures/mutations/`.

### Steps

- [ ] Create the SQLite schema for migrations, leases, fencing tokens,
  mutation journals, lifecycle versions, and immutable audit references.
- [ ] Implement one OS/filesystem writer lock per project and a fenced SQLite
  lease held through durable completion.
- [ ] Implement immutable versioned snapshots and one atomic current-root
  pointer.
- [ ] Implement validate, preserve, prepare, publish-files, commit-state, and
  complete phases with required file and directory durability ordering.
- [ ] Implement startup recovery for every ADR-008 durable phase.
- [ ] Reject stale hashes, stale lifecycle versions, replayed commands,
  arbitrary paths, unsupported commands, oversized requests, and symlinks.
- [ ] Preserve the prior and proposed versions on every conflict.
- [ ] Expose user-visible `queued`, `running`, `blocked`, `conflict`, `failed`,
  `cancelled`, `succeeded`, and `needs_review` states without leaking logs or
  secrets.

### Exit Criteria

- Crash injection at each durable phase restores or completes exactly as the
  ADR recovery table requires.
- Concurrent writers serialize; stale writers cannot commit.
- Concurrent readers observe one complete snapshot, never a mixed tree.
- SQLite can be deleted and its derived indexes rebuilt without losing
  canonical manuscript content.
- The browser cannot submit arbitrary commands or paths.

### Suggested Commits

- `feat: add durable local project state`
- `feat: add recoverable canonical mutation service`

## Task 6: WP96 — Generic Discovery and YC Semantic Migration

### Goal

Remove fixed-volume assumptions and prove that migrating the YC Playbook
preserves its required meaning and structure.

### Files

- Create `scripts/books/discovery.mjs`, `scripts/books/assemble.mjs`, and
  `scripts/books/migrate-yc.mjs`.
- Refactor `scripts/lib.mjs`, `scripts/book-contract.mjs`,
  `scripts/build-book.mjs`, and `scripts/notion-publication.mjs` to accept a
  discovered Book Project.
- Create `schemas/books/migration-report.schema.json`.
- Create `tests/book-discovery.test.mjs` and `tests/book-migration.test.mjs`.
- Create sanitized oracle fixtures under `tests/fixtures/migration/yc/`.
- Add a reviewed migration record under
  `books/volume-01-yc-playbook/migrations/`.

### Semantic Oracle

The machine report compares at least title and metadata, part and chapter
order, headings, paragraphs, lists, tables, links, footnotes, callouts,
worksheets, source references, diagrams, assets, language, and normalized text
content. Differences are classified as equal, normalized-equivalent,
approved-change, or blocking-difference.

### Steps

- [ ] Discover books from versioned project manifests rather than constants.
- [ ] Resolve all paths through the safe project-root boundary.
- [ ] Make chapter count, part count, filenames, and output names data-driven.
- [ ] Generate a deterministic pre/post migration report with hashes and
  machine-readable difference records.
- [ ] Fail migration when any required dimension is missing or unclassified.
- [ ] Perform and record a human visual review of representative and risky
  pages without treating it as accessibility or legal approval.
- [ ] Remove the compatibility adapter and fixed YC constants only after the
  semantic oracle passes.

### Exit Criteria

- A fresh clone discovers at least two fixture Book Projects of different
  shapes.
- Existing YC content passes all semantic dimensions or records an explicit
  approved difference.
- Notion export still covers all 23 YC chapters and worksheets through generic
  discovery.
- No production module contains a fixed YC chapter-count requirement.

### Suggested Commit

`feat: generalize book discovery and migrate the YC Playbook`

## Task 7: WP97 — Lifecycle, Three Gates, and Durable Jobs

### Goal

Implement one guarded lifecycle whose human approvals bind exact content and
whose work survives restart, retry, cancellation, and stale clients.

### Files

- Create `schemas/lifecycle/lifecycle.schema.json`,
  `approval.schema.json`, `transition.schema.json`, and
  `workflow-attempt.schema.json`.
- Create `scripts/lifecycle/model.mjs`, `guards.mjs`, `service.mjs`, and
  `approvals.mjs`.
- Refactor `scripts/platform/jobs.mjs` to use the SQLite run/stage/attempt
  ledger while preserving its public operation behavior.
- Extend `scripts/platform/server.mjs` and `platform/web/app.js` with explicit
  Blueprint, Beta, and Publish review actions and states.
- Create `tests/lifecycle.test.mjs`, `tests/workflow-ledger.test.mjs`, and
  `tests/platform-lifecycle.test.mjs`.

### Steps

- [ ] Define the versioned state machine and append-only transition history.
- [ ] Require expected lifecycle versions on transitions and canonical
  mutations under the shared project writer lock.
- [ ] Bind Blueprint approval to the brief, source policy, budgets, egress
  policy, and exact Blueprint hash.
- [ ] Invalidate Blueprint approval after material reader, outcome, scope,
  thesis, or chapter-contract changes.
- [ ] Bind Beta approval to the complete beta snapshot and policy results.
- [ ] Make Publish unavailable without current Blueprint and Beta approvals,
  zero blocking findings, and an exact release-candidate hash.
- [ ] Require explicit human confirmation for every gate; no agent, provider,
  connector, or adapter may create an approval.
- [ ] Implement durable run, stage, and attempt IDs; scoped idempotency keys;
  retries; cancellation; heartbeat; stale recovery; and visible failure class.
- [ ] Ensure retry creates a linked attempt and never repeats a completed
  external side effect under the same idempotency contract.

### Exit Criteria

- The YC migration traverses Blueprint, Beta, and Publish in order.
- Publish fails closed for missing, rejected, expired, or stale Beta approval.
- Two-tab and concurrent-worker tests prove optimistic conflicts and shared
  locking.
- Restart and cancellation tests preserve lineage and expose one truthful
  operation state.
- Gate actions are explicit, accessible, and unavailable when guards fail.

### Suggested Commits

- `feat: add the guarded book lifecycle`
- `feat: persist workflow runs and approvals`

## Task 8: WP98 — Multi-Format Release and Immutable Manifest

### Goal

Build and verify HTML, PDF, and EPUB from one canonical snapshot, then bind one
immutable release manifest to the human Publish decision.

### Files

- Create `scripts/publishing/project-build.mjs`, `html.mjs`, `epub.mjs`,
  `pdf.mjs`, `candidate.mjs`, `manifest.mjs`, and `verify-release.mjs`.
- Refactor `scripts/build-book.mjs` into a compatibility entry point.
- Expand `scripts/verify-outputs.mjs` with format-specific validators.
- Create `schemas/publishing/release-candidate.schema.json` and
  `release-manifest.schema.json`.
- Update `package.json`, `.github/workflows/publishing.yml`, and publishing
  operations documentation.
- Create `tests/publishing.test.mjs`, `tests/release-manifest.test.mjs`,
  `tests/publishing-e2e.test.mjs`, and large disk-backed fixtures.
- Create `docs/05-operations/increment-1-acceptance-report.md` after evaluation.

### Steps

- [ ] Assemble one immutable source snapshot and fingerprint all canonical
  input, configuration, templates, tools, fonts, and policies.
- [ ] Render HTML, PDF, and EPUB only from that snapshot.
- [ ] Run the selected output-specific validators with machine-readable
  results and fail the whole release if one format fails.
- [ ] Verify semantic parity across all three formats.
- [ ] Create a deterministic release-candidate envelope containing all
  material hashes and policy results.
- [ ] Present the candidate at the Publish Gate and require explicit human
  approval of its exact hash.
- [ ] Generate the final immutable manifest only after approval and bind it to
  the approval, lifecycle version, candidate, artifacts, validators, and
  checksums.
- [ ] Reject missing, extra, stale, changed, or mismatched fields and files.
- [ ] Prove disk-backed processing with a fixture of at least 512 MiB, chunks
  no larger than 8 MiB, and peak process-tree RSS increase no greater than
  128 MiB above idle using the recorded measurement method.
- [ ] Emit only an unreserved, non-authoritative future-staging reference;
  never claim hosted activation in Increment 1.
- [ ] Run the complete acceptance plan and record the release decision.

### Exit Criteria

- Local and CI use the same public command surface and pinned profiles.
- HTML, PDF, and EPUB pass all format and integrated checks.
- The immutable manifest reproduces the candidate and fails closed on drift.
- The Publish approval binds the exact final candidate and cannot be reused for
  another release.
- The Increment 1 acceptance report records every automated result, manual
  review, exception, limitation, and go/no-go decision.

### Suggested Commits

- `feat: build verified HTML PDF and EPUB releases`
- `feat: bind immutable manifests to Publish approval`
- `docs: record the Increment 1 acceptance decision`

## Pull Request Sequence

| Pull request | Work packages | Merge requirement |
| --- | --- | --- |
| PR-A | WP91 | Plans approved and baseline green |
| PR-B | WP92 | RFC-008 accepted before PDF code |
| PR-C | WP93 | Spike matrix complete; no production adapter claim |
| PR-D | WP94 | Schemas, migrations, and compatibility fixtures green |
| PR-E | WP95 | Crash, concurrency, security, and recovery tests green |
| PR-F | WP96 | YC semantic oracle and human visual review complete |
| PR-G | WP97 | Three-gate and durable-ledger E2E tests green |
| PR-H | WP98 | Full acceptance plan and release decision complete |

## Increment 1 Definition of Done

- WP91-WP98 exit criteria are satisfied.
- All automated acceptance tests pass from a clean clone locally and in CI.
- Required manual reviews have named reviewers, dates, procedures, evidence,
  and unresolved findings; automation never impersonates them.
- The YC Playbook is represented by a generic Book Project and passes the
  semantic migration oracle.
- One exact candidate receives Blueprint, Beta, and Publish approvals in order.
- The final immutable manifest binds verified HTML, PDF, and EPUB to the human
  Publish decision.
- Ghost feasibility is known, but no hosted activation is claimed.
- The acceptance report records an explicit go, conditional-go, or no-go
  decision before Increment 2 planning begins.

## NOT in Scope

- New research ingestion or automated composition
- OpenAI provider implementation for drafting or enrichment
- Automated visual generation
- Editorial Memory learning and evaluation
- Notion three-way proposal import
- Subscriber authentication, invitations, downloads, or production Ghost
  activation
- Billing, public registration, team permissions, native mobile apps, or
  autonomous final publication
