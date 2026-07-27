# Final Governance Integration Fix Report

## Status

DONE_WITH_CONCERNS

The requested governance integration fixes, including the final whole-branch
lifecycle-allocation follow-up, are complete. The only concerns are the two
intentionally unresolved implementation prerequisites and transient external-
link network warnings described below.

## Commit

`HEAD` — `docs: align lifecycle increment boundaries`

The immutable commit SHA is reported by the Git handoff after this report is
committed. A commit cannot contain its own final SHA.

## Changed Files

- `ROADMAP.md`
- `docs/superpowers/plans/2026-07-23-increment-1-governance-package.md`
- `docs/superpowers/specs/2026-07-23-research-to-book-publishing-design.md`
- `governance/ADR/ADR-008-Markdown-SQLite-Authority-and-Mutations.md`
- `governance/ADR/ADR-009-Lifecycle-and-Durable-Workflow.md`
- `governance/ADR/ADR-010-Provider-Capabilities-and-Data-Egress.md`
- `governance/ADR/ADR-011-Notion-Three-Way-Proposal-Reconciliation.md`
- `governance/ADR/ADR-012-Immutable-Releases-and-Ghost-Adapter.md`
- `governance/README.md`
- `governance/RFC/RFC-006-Research-to-Book-Product-Pivot.md`
- `governance/RFC/RFC-007-Research-to-Book-Publishing.md`
- `governance/policies/PLATFORM-SECURITY.md`
- `governance/policies/RESEARCH-TO-BOOK-THREAT-MODEL.md`
- `.superpowers/sdd/final-fix-report.md`

## Finding Resolutions

1. **Increment decision:** The single Publish Gate now occurs in Increment 1
   after the prerequisite minimum Blueprint and Beta approvals and binds the
   immutable final manifest. Increment 2 deepens beta quality through the
   existing gate. Increment 3 consumes the approved release for hosted staging
   and activation without another gate. RFC-006, RFC-007, the roadmap, design,
   governance supersession map, and completed plan all use the same allocation.
2. **ADR-008 recovery:** Canonical mutation now requires durable
   content-addressed preimages or a verified prior snapshot before replacement,
   normative file and directory `fsync` ordering, explicit mutation phases and
   recovery actions, and one atomic versioned root pointer for reader-consistent
   multi-file visibility. Recovery can physically restore verified prior bytes
   after pointer publication. ADR-011 uses the same recovery contract.
3. **Egress:** AI and media provider-processing classifications are distinct
   from hosted identity persistence. Subscriber personal data is prohibited to
   AI and media providers. Only minimum contract-enumerated fields may reach
   the configured hosted identity adapter under a recorded purpose, consent or
   other legal basis, retention, deletion, backup, region, and minimization
   policy.
4. **Lifecycle race:** Lifecycle transitions and canonical mutations share the
   per-project writer lock through durable commit. Mutations recheck lifecycle
   version and guards before snapshot publication and in the SQLite commit.
   Stale work fails as `conflict`; crash fixtures must restore the verified
   prior snapshot.
5. **Blueprint semantics:** The Blueprint Gate approves an initial architecture
   hypothesis before research. Evidence-refined details are granular
   revisions. A material reader, outcome, scope, thesis, or chapter-contract
   change invalidates approval and blocks composition until a human approves
   the revised Blueprint.
6. **Authority:** The hosted adapter release-state store owns the active
   release pointer and monotonic revision; local SQLite holds derived,
   append-only observations. Local SQLite is the append-only operational
   authority for staging attempts and evidence. Increment 1 may include only an
   unreserved deterministic future-staging hint. Increment 3 reconciles the
   pointer and transactionally reserves the authoritative attempt ID with its
   expected revision before outbox creation or dispatch, appends immutable
   observations and one finalization, and creates a new linked attempt for
   retry. Immutable export is optional.
7. **Browser and local mutation security:** The local boundary now requires
   loopback-only binding, a strict loopback `Host` and port allowlist,
   DNS-rebinding defense, same-origin and Fetch Metadata checks, CSRF, an
   authenticated short-lived local capability or session, exact JSON content
   type and size limits, rate limits, replay protection, and no credentials in
   URLs.
8. **PDF and open status:** The design and RFC require an accepted RFC-007
   amendment to name and version the PDF profile before implementation. The
   final review report now lists the PDF amendment and Ghost spike outcome as
   unresolved implementation prerequisites.
9. **Tracking:** Every governance-plan checkbox is checked. Design task T1 is
   checked; implementation tasks T2 through T12 remain unchecked.
10. **Retry visibility:** ADR-009 normatively maps durable retry
    classifications and concurrency conditions to `failed-retryable`,
    `blocked`, `cancelled`, `failed-terminal`, `stale`, `conflict`, and
    `queued`, with required next actions.
11. **Gate sequencing follow-up:** Increment 1 now implements durable human
    Blueprint, Beta, and Publish approvals and moves the YC migration through
    them in mandatory order. Publish fails closed without a current Beta
    approval. Increment 2 adds evidence, automation, and stronger beta-quality
    policies around that existing gate rather than introducing it.

## Validation

- `node_modules/.bin/markdownlint-cli2 "**/*.md" "#node_modules/**"
  "#dist/**" "#build/**"` — exit 0; 183 Markdown files; 0 errors.
- `node_modules/.bin/cspell lint "**/*.md" --no-progress
  --show-suggestions` — exit 0; 183 files; 0 issues.
- `node scripts/check-style.mjs` — exit 0; 183 Markdown files; 0 errors,
  warnings, or suggestions.
- `node scripts/check-links.mjs` — exit 0; 183 Markdown files and 28 external
  links checked. The restricted environment reported transient fetch warnings
  for all 28 external links; the checker found no blocking link error.
- `node --test tests/*.test.mjs` with permission to bind its temporary
  loopback server — first run exited 1 with 60 passed and the timing-sensitive
  live-index test reporting one extra increment; an immediate isolated full
  rerun exited 0 with 61 passed and 0 failed.
- `git diff --check` — exit 0.

## Concerns

- The PDF accessibility and archival profile, renderer, validators, and manual
  review procedure remain an intentional implementation decision. PDF
  implementation is blocked until an accepted RFC-007 amendment names and
  versions them.
- The Ghost spike remains an intentional implementation prerequisite. A
  production adapter is blocked until every capability is classified and the
  direct or bounded-fallback architecture is recorded with no required
  capability left infeasible.
- External link targets could not be fetched from the restricted validation
  environment. The repository link checker treats these as transient warnings
  and exited successfully; internal documentation and links passed.
- The first full Node run exposed a non-repeating live-index timing failure.
  The immediate isolated full rerun passed 61 of 61; no runtime code changed in
  this documentation-only follow-up.
