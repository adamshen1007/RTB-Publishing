# RFC-007 — Research-to-Book Publishing

<!-- cspell:words MiB WCAG -->

## Status

Accepted for Increment 1 implementation

## Summary

RTB Publishing publishes canonical Markdown as validated HTML, PDF, and EPUB 3.
DOCX is removed from the research-to-book release contract. Increment 1 must
generalize the existing pipeline, migrate the YC Playbook through a semantic
oracle, select and pin the required validators, use safe disk-backed staging,
complete the Ghost capability spike, implement the minimum Blueprint and Beta
approvals required before the single Publish Gate, and create the Publish-bound
local final manifest.

This RFC also fixes the release, activation, rollback, unpublish, retention,
and failure contracts that Increment 3 subscriber delivery must implement.
Increment 3 consumes the approved immutable release and does not add a second
Publish gate.
Defining those contracts now does not represent Ghost compatibility as proven
or authorize production hosted delivery before ADR-012's spike criteria pass.

## Evidence, Assumptions, and Scope

ADR-001 proves a local, repeatable Markdown pipeline for standalone HTML, EPUB
3, and DOCX. RFC-006 accepts the research-to-book pivot and replaces DOCX with
PDF. The reviewed design requires all three new outputs from one source
snapshot, output-specific validation, a YC semantic migration report,
checksummed immutable release manifests, one activation pointer, protected
downloads, and preservation of the prior active release on failure.

The exact PDF accessibility profile is not yet selected by the reviewed
records. This RFC therefore makes a named, versioned profile and its pinned
validation procedure a blocking Increment 1 implementation prerequisite. No
claim of PDF accessibility conformance may be made until that profile's
automated and manual acceptance evidence passes.

Increment 1 covers local publishing foundation, YC migration, the Ghost spike,
minimum guarded Blueprint, Beta, and Publish approvals in mandatory order, and
Publish-bound immutable final-manifest generation.
Subscriber staging, activation, rollback, unpublish, and retention controls are
contractually defined here but remain Increment 3 implementation scope under
RFC-006. They verify and consume the existing approval rather than requesting
another one.

## Publishing Contract

### Authority and Common Build Input

Markdown and Git remain the authority for authored publication content.
Generated artifacts, build intermediates, release manifests, Ghost, and object
storage are derived and cannot write canonical content.

One build resolves an immutable source snapshot containing:

- Project and edition configuration
- Ordered Markdown documents and stable semantic IDs
- Publication metadata, references, worksheets, and approved assets
- Rendered visual inputs and accessibility text
- Rights, quality-policy, template, and toolchain versions

The build records the Git revision and normalized source-snapshot hash. HTML,
PDF, and EPUB must all derive from that same snapshot and content-addressed
dependency graph. A source or configuration change invalidates affected
outputs; an old artifact cannot be silently mixed into a new release.

Rendering uses a clean, bounded, disk-backed staging directory. Large inputs
and artifacts use bounded-buffer streaming for reads, checksum calculation,
validation, and later transfer. Renderers run without network or credentials,
use fixed argument arrays rather than shell interpolation, and may write only
inside approved staging and output roots.

### Required Output Set

Every successful research-to-book build produces:

1. Standalone, sanitized HTML
2. A PDF meeting the selected PDF profile
3. A valid EPUB 3 publication

DOCX is not a supported output, compatibility artifact, or release-manifest
entry. Its removal is an approved semantic difference in YC migration. A
consumer that still requires DOCX must use a separately governed conversion
outside this release contract.

Output filenames are deterministic from project configuration. Build
intermediates stay outside canonical source directories. A format succeeds
only when conversion and all validators for that output pass.

### HTML Profile

HTML targets WCAG 2.2 Level AA. The pinned HTML profile must check, at minimum:

- Valid document structure, language, title, landmarks, and heading hierarchy
- Keyboard-operable navigation, visible focus, skip navigation, and logical
  reading and tab order
- Text alternatives for meaningful images and appropriate decorative-image
  handling
- Table headers and associations, link purpose, labels, and accessible names
- Color contrast, reflow, zoom, spacing, and reduced-motion behavior
- Sanitized markup, safe URLs, content security policy, and no required active
  third-party content
- Internal links, external-link policy, metadata, and required book navigation

Automated checks are necessary but not sufficient. The release evidence must
also record the versioned manual review procedure, tested user-agent and
assistive-technology matrix, findings, approved exceptions, and remediation
status. An unresolved Level A or Level AA blocker fails HTML validation.

### EPUB Profile

EPUB output conforms to EPUB 3 and must pass a repository-pinned EPUBCheck
version and configuration. The EPUB profile also verifies:

- Required package metadata, language, unique identity, and navigation
- Ordered spine content, chapter hierarchy, links, anchors, and media types
- Embedded asset presence, checksums, and permitted remote-resource policy
- Accessibility metadata, semantic structure, text alternatives, tables, and
  reading order
- Absence of undeclared, unsafe, or unreachable content

Warnings are classified in a versioned policy. A warning cannot be ignored by
default or reclassified without a recorded policy change and regression
fixture. EPUBCheck success does not replace EPUB accessibility and content
tests.

### PDF Profile

Before PDF implementation begins, the Increment 1 plan must explicitly select:

- A named PDF accessibility and archival profile with a fixed version
- A renderer and pinned versions capable of producing that profile
- Pinned structural and profile validators with machine-readable results
- A versioned manual screen-reader and visual review procedure
- Supported font, language, metadata, link, and tagged-structure behavior
- Failure, waiver, and regression-fixture rules

The selected profile must be named and versioned by an accepted amendment to
this RFC before PDF implementation begins. Selecting only a renderer default
or an unversioned claim such as “accessible PDF” does not satisfy this
prerequisite.

Regardless of the selected profile, pinned checks must verify:

- File signature, page count, successful pinned-parser reads, and absence of
  corruption
- Tagged document structure, logical reading order, headings, lists, tables,
  figures, alternative text, and document language
- Embedded or approved font substitution, font licensing, and missing-glyph
  detection
- Title, author, subject, keywords, profile, and creation metadata according to
  the reproducibility policy
- Internal and external links, bookmarks, destinations, and page references
- Page geometry, overflow, clipped content, image resolution, and visual
  regression samples

Any blocking structural, font, metadata, link, accessibility-profile, or
visual-review failure fails the PDF output.

### Pinning and Reproducibility

Renderer, sanitizer, validator, template, browser, font, and configuration
versions are pinned through repository-owned lock files or checksummed tool
manifests. CI and local commands use the same profiles. Upgrading a pinned tool
or policy requires compatibility fixtures and a recorded baseline comparison.

Reproducibility requires equivalent normalized content, deterministic
filenames and structure, stable source and configuration fingerprints, and
documented treatment of allowed timestamp or container metadata. Byte identity
is required only when the selected output profile declares it.

## Release Candidate and Manifest

After all formats pass and before the Publish action, the pipeline creates a
versioned, immutable release-candidate envelope. It records:

- Envelope schema version plus project, edition, release, and parent-release
  IDs
- Git revision, source-snapshot hash, and ordered canonical input hashes
- Artifact paths, media types, bytes, and SHA-256 checksums
- The complete required format set
- Validator profiles, versions, configurations, and machine-readable results
- Renderer, template, font, sanitizer, policy, and dependency-lock hashes
- Rights, citations, links, visual provenance, accessibility,
  quality-policy, and release-integrity results
- Lifecycle version, versioned hosted-access policy, build run, and creation
  evidence

The pipeline calculates a SHA-256 hash over the canonical serialization of the
complete envelope. The human Publish action binds that exact envelope hash and
lifecycle version and fails closed unless that lifecycle has a current Beta
approval. Any material change requires a new envelope, hash, and approval.

The final manifest required by ADR-012 derives from the approved envelope. It
must preserve every material field exactly and may add only the Publish
approval reference and an unreserved deterministic future-staging reference.
That reference is only a hint derived from the release, manifest, and
configured destination scope; it is not a staging-attempt ID, reservation,
idempotency key, expected pointer revision, or evidence authority.
Manifest creation fails when a required field or result is absent or when a
derived field differs from the approved envelope. The manifest's SHA-256
checksum binds the bundle.

Hosted destination identities, transferred bytes, verified remote checksums,
provider observations, and access-test results are always stored in the
local SQLite append-only staging-attempt ledger linked to the preexisting
manifest checksum. Increment 1 reserves no attempt. In Increment 3, after
reconciling the authoritative active pointer, one SQLite transaction reserves
the attempt ID with the expected pointer revision before outbox creation or
dispatch. Every observation and one terminal finalization are immutable
appends. A retry gets a new attempt linked to its predecessor. An immutable
audit export is optional and is not a second operational authority. Hosted
evidence is never included in or appended to the final manifest.

Release content includes only manifest-allowlisted artifacts and minimum
publication metadata. Mutable subscriber, session, allowlist, visibility, and
active-pointer state stays outside the manifest and bundle.

## YC Semantic Migration Oracle

The existing YC Playbook is the Increment 1 migration oracle, not a fixed
product schema. Migration must remove volume-specific and 23-chapter discovery
assumptions while preserving:

- Normalized chapter text and order
- Heading hierarchy and stable semantic structure
- Citations and source relationships
- Worksheets and their chapter relationships
- Assets, diagrams, alternative text, and references
- Internal and approved external links
- Book, chapter, and publication metadata

Approved differences are project layout, generated markup, normalized
formatting that does not change meaning, and replacement of DOCX with PDF.
Every other difference is classified as intended and approved, remediated, or
blocking.

The migration produces a machine-readable report with stable semantic IDs,
base and migrated hashes, normalized values, difference categories, and
validator results. A human visual review compares representative and
risk-selected HTML, PDF, and EPUB views and records findings. Compatibility
cannot be claimed from filenames, artifact existence, or visual similarity
alone.

## Validation and Test Contract

Normal local and CI runs use deterministic fakes where an external system is
involved. Recorded, sanitized fixtures test adapter and renderer compatibility.
Opt-in staging tests use isolated Ghost resources only after credentials and
egress policy permit them.

Required shared tests cover:

- Schema validation, source-snapshot hashing, content-addressed invalidation,
  deterministic filenames, and clean staging
- Candidate-envelope canonical serialization, hashing, stale approval, and
  rejection of every material change between approval and final manifest
- Missing tools, disk exhaustion, permissions, symlinks, traversal, malformed
  content, process termination, and stale intermediates
- One format failing while two pass; the bundle remains inactive and no
  partial release is accepted
- Duplicate commands, stale lifecycle versions, cancellation, restart, and
  crash recovery at every durable checkpoint
- Artifact and manifest checksum mismatch before staging, after transfer, and
  before access
- A fixture of at least 512 MiB with streaming chunks no larger than 8 MiB and
  a peak RSS (resident set size) increase no greater than 128 MiB above the
  measured idle aggregate for the complete process tree during rendering,
  checksum, and transfer. It includes the orchestrator plus every renderer,
  adapter, and other child process, or uses an equivalent container or cgroup
  boundary containing them all. The result records the operating system,
  architecture, runtime and tool versions, process-tree or container boundary,
  memory-sampling method and interval, aggregate idle baseline, aggregate peak
  RSS or equivalent peak, and fixture composition.

Required HTML tests cover semantics, sanitization, navigation, keyboard use,
WCAG 2.2 Level AA automated rules, links, responsive reflow, assistive
technology, and the manual review procedure.

Required PDF tests cover the selected profile, tagged structure, reading order,
fonts and glyphs, metadata, links and bookmarks, overflow, visual regression,
screen-reader review, and malformed or truncated files.

Required EPUB tests cover the pinned EPUBCheck profile, package and navigation
structure, reading order, metadata, links, assets, accessibility metadata,
text alternatives, and representative reader behavior.

YC oracle fixtures cover unchanged, intended-difference, reordered, missing,
duplicated, relinked, and metadata-drift cases. A deliberately introduced
semantic difference must fail the migration gate.

Hosted adapter contract and staging tests cover every ADR-012 capability row,
including denial cases, API limits, interrupted upload, uncertain response,
duplicate delivery, drift, stale pointer, rollback, unpublish, expired
credentials, revoked subscriber, and replayed download grant. Unpublish tests
must prove a stale expected active release ID or pointer revision returns
`conflict`, a successful compare-and-set moves only that expected release to
`null` or disabled while incrementing the revision, and revocation affects only
access state bound to the unpublished release ID. After A to B to A pointer
mutations, stale activation and unpublish commands holding A's original
revision must both conflict without mutation or revocation.

## Staging, Activation, and Failure Behavior

Release preparation is a dry run. It never changes hosted visibility. A
release may enter remote staging only after all local formats, validators,
rights checks, checksums, and manifest checks pass and the immutable manifest
proves the existing Increment 1 human Publish action against that exact release
input and lifecycle version. Hosted staging does not invoke a second Publish
action.

Remote staging streams content under a new release ID and verifies each hosted
artifact and access rule against the immutable local manifest. Staging is not
activation. The only activation mutation is ADR-012's guarded compare-and-set
of `(release_id, monotonic_pointer_revision)` after verification of the
existing human Publish action and repeated lifecycle and policy checks.

Activation, rollback, and unpublish compare both tuple values. Every successful
pointer mutation increments the revision by one; a mismatch in either value
returns `conflict` without mutation. The revision never resets, including when
the release ID returns to an earlier value. The hosted adapter release-state
store is authoritative for this pair and its monotonic revision. Local SQLite
contains append-only observations that must be reconciled before mutation; it
cannot authorize a pointer change.

All remote side effects use ADR-009's durable outbox, stable idempotency key,
attempt lineage, and reconciliation rules. A known retryable failure may resume
within its recorded limit. An uncertain side effect is reconciled before
retry; if safe replay cannot be proved, the operation becomes
`blocked-awaiting-action`.

Failure behavior is atomic at the release level:

- A prerequisite, conversion, or validator failure produces no staged release.
- A partial or mismatched upload remains inactive and is quarantined or handled
  through idempotent compensation.
- An access-control or hosted-verification failure blocks activation.
- A stale release ID or pointer revision leaves the pointer pair unchanged.
- A compensation failure preserves evidence and becomes visible blocked work.
- A process crash resumes from a verified durable checkpoint and never infers
  success from an incomplete response.

Rollback verifies a retained prior manifest and changes only the guarded active
pointer. It compare-and-sets the expected release ID and monotonic pointer
revision to the retained target and increments the revision. It does not
rebuild or mutate that release.

Unpublish supplies the expected active release ID and monotonic pointer
revision, then compare-and-sets that pair to `null` or disabled while
incrementing the revision. A stale release ID or revision returns `conflict`
without changing the pointer or revoking the current release, even after an A
to B to A sequence returns to the expected release ID. After a successful
pointer change, session, grant, cache, visibility, and other access revocation
is scoped to the unpublished release ID and uses the same durable idempotency
identity. Neither rollback nor unpublish bypasses current rights, integrity,
lifecycle, or incident-policy checks.

## Retention and Removal

Release bundles are immutable while retained. The retention schedule declares
per-store periods and actions for:

- Active, superseded, failed-staging, and unreferenced release content
- Local staging and temporary files
- Hosted copies, caches, backups, and deletion requests
- Release, activation, rollback, unpublish, access, and incident evidence
- Subscriber identity, allowlist, session, grant, and access records
- Rights expiry or revocation and legal holds

Mutable access and privacy data remains separate from immutable release
content. Privacy deletion or redaction must not require editing a release.
Rights withdrawal or unpublish revokes access first, then creates a corrected
release or destructively removes the complete affected bundle when policy
requires it.

After activation, the immediate predecessor, when one exists, is the verified
rollback target. It remains ineligible for garbage collection until either its
configured rollback window ends, which defaults to 30 days, or a human
explicitly retires it after another retained release passes manifest, artifact,
access, and rollback verification and is recorded as the replacement target.

Garbage collection cannot remove the active release, that protected immediate
predecessor, any rollback target still required by policy, a referenced audit
object, or held records. Storage pressure, routine cleanup, a shorter provider
default, or an unpublish operation cannot bypass the rollback window.
Authorized destructive removal deletes the complete bundle and preserves only
the minimal non-content tombstone defined by ADR-012. Legal holds suspend only
covered deletion; the applicable deletion or redaction schedule resumes after
release.

Protected binary downloads require current authorization and short-lived,
audience-bound access. Permanent public URLs are prohibited. Provider deletion
outcomes are evidence of requests and observed results, not proof of
unobservable physical erasure.

## Compatibility and Supersession

This RFC narrows ADR-001 as follows:

- Markdown authority, derived output directories, local and CI command parity,
  and repeatable project-owned quality gates remain active.
- PDF replaces DOCX for research-to-book releases.
- HTML and EPUB remain required, now under the profiles in this RFC.
- PDF production, local release manifests, and the Ghost capability spike move
  into Increment 1 scope.
- Production hosted delivery remains outside Increment 1 and enters only
  through RFC-006 Increment 3 and ADR-012's proven adapter.

ADR-001 remains part of the decision history. This RFC does not rewrite M1
release artifacts already produced under its accepted contract.

This RFC also narrowly supersedes RFC-006's original allocation of the Publish
Gate and immutable release-manifest generation to Increment 3. The versioned
local release-candidate envelope, single Publish Gate, Publish-bound final
manifest, manifest checksum, and its prerequisite minimum Blueprint and Beta
approvals are Increment 1 publishing-foundation outputs.
Remote staging, hosted artifact and access verification, subscriber delivery,
active-pointer activation, rollback, unpublish, and hosted retention remain
Increment 3 and consume that approved immutable release. RFC-006's product
boundary, three-gate model, remaining increment contents, and decision history
remain active.

Ghost is the first adapter candidate, not a guaranteed implementation.
Production support requires the recorded capability matrix and selected
fallback architecture required by ADR-012. A missing capability cannot be
silently ignored or replaced by a broader hosted system.

## Increment 1 Acceptance Criteria

- A fresh clone discovers reusable Book Projects without fixed volume or
  chapter-count assumptions.
- The YC migration traverses durable human Blueprint, Beta, and Publish
  approvals in order, and Publish fails closed without the current Beta
  approval. Increment 2 beta automation reuses rather than introduces the
  gate.
- An accepted amendment to this RFC names and versions the selected PDF
  accessibility profile and pins every required renderer and validator before
  PDF implementation begins.
- The same public local and CI command surface builds and validates HTML, PDF,
  and EPUB from one source snapshot.
- Output-specific tests and an integrated multi-format failure test pass.
- The YC migration machine report and human visual review preserve every
  required semantic dimension or record an approved difference.
- Candidate envelopes and release manifests are deterministic, complete, bind
  the exact Publish decision, and fail closed on stale, missing, extra,
  changed, or mismatched material fields and artifacts.
- Hosted staging tests prove the Increment 1 deterministic future-staging
  reference is unreserved and non-authoritative. Increment 3 transactionally
  reserves an append-only local SQLite attempt with the expected pointer
  revision before outbox creation or dispatch, appends immutable observations
  and finalization, and creates a new linked attempt for each retry.
- Pointer tests prove the hosted adapter release-state store owns the active
  pair and monotonic revision and that stale local SQLite observations cannot
  authorize activation, rollback, or unpublish.
- A fixture of at least 512 MiB demonstrates disk-backed rendering, validation,
  checksum, and transfer with chunks no larger than 8 MiB and a peak
  RSS (resident set size) increase no greater than 128 MiB above the idle
  aggregate for the complete process tree or equivalent container or cgroup.
  The boundary includes the orchestrator, renderer, and adapter children, and
  the measurement platform and method are recorded.
- The Ghost spike stops when every ADR-012 matrix row is classified `direct`,
  `fallback-required`, or `infeasible`, and no later than two working days or
  16 human hours. It records the evidence, selects the sidecar or object-storage
  fallback where required, and treats `infeasible` as a production blocker.
- No production activation is represented as complete unless a later
  Increment 3 acceptance report proves staging, authorization, activation,
  rollback, unpublish, retention, and failure contracts.

## Consequences

- Research-to-book releases have one explicit required output set and no DOCX
  compatibility ambiguity.
- Accessibility becomes a versioned release target with automated and manual
  evidence rather than an unqualified renderer claim.
- One failed output prevents a partial edition from becoming a release.
- The YC Playbook can prove semantic migration while future books remain
  independent of its fixed structure.
- Defining hosted contracts before implementation reduces the risk of adapting
  release integrity to whatever Ghost happens to expose.
- Pinned validators, manual reviews, retained releases, and disk-backed staging
  add build time, storage, and operational work.

## Rejected Alternatives

### Keep DOCX and Add PDF

Rejected. RFC-006 accepts PDF as the research-to-book replacement for DOCX; a
fourth required format would preserve an unsupported compatibility burden.

### Treat Conversion Success as Validation

Rejected. A renderer can emit a corrupt, inaccessible, stale, or semantically
different artifact without returning an error.

### Accept Partial Multi-Format Releases

Rejected. Subscribers would receive an edition whose formats do not represent
the same approved source snapshot.

### Claim Ghost Compatibility Before the Spike

Rejected. Membership, protected access, download, staging, activation,
rollback, limit, and reconciliation behavior must be proved against isolated
resources first.
