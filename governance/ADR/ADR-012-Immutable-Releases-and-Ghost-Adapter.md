# ADR-012 — Immutable Releases and Ghost Adapter

<!-- cspell:words MiB -->

## Status

Accepted subject to Ghost capability spike

## Context

RFC-006 accepts a local-first research-to-book product whose approved releases
cross a bounded publishing boundary. It selects Ghost as the first hosted
subscriber-library adapter, but only after an early capability spike. The
reviewed design also requires immutable release bundles, protected downloads,
one activation pointer, safe rollback, and a sidecar or object-storage fallback
for capabilities Ghost cannot prove.

ADR-001 keeps canonical Markdown authoritative and generated outputs derived.
ADR-009 requires durable runs, stable idempotency keys, an outbox before remote
side effects, and reconciliation before retrying an uncertain operation. This
decision applies those rules to release storage and activation without treating
Ghost, object storage, or subscriber state as canonical publication content.

## Decision

### Immutable Release Identity and Manifest

Every release candidate receives a globally unique, stable release ID before
the Publish action or remote staging. A release ID is never reused, even after
an upload fails, a release is unpublished, or retained artifacts are deleted.
An edition correction creates a new release ID and bundle; no artifact or
manifest is replaced in place.

Before the Publish action, the pipeline creates one versioned, immutable
release-candidate envelope and calculates its SHA-256 hash. The envelope binds:

- Envelope schema version plus project, edition, release, and parent-release
  IDs
- Canonical Git revision, ordered canonical input hashes, and normalized
  source-snapshot hash
- Ordered artifact paths, media types, byte sizes, and SHA-256 checksums
- Required HTML, PDF, and EPUB formats
- Validator profiles, versions, configurations, and results
- Renderer, template, policy, configuration, and dependency-lock hashes
- Machine-derived rights, accessibility, citation, link, quality-policy, and
  release-integrity results
- Lifecycle version, versioned hosted-access policy, build run, and creation
  evidence

The human Publish decision binds the exact candidate-envelope hash and
lifecycle version. After approval, the final release manifest derives from
that envelope without changing, adding to, or removing any material release
field. It may add only the Publish approval reference and an unreserved,
deterministic future-staging reference derived from the release, manifest, and
configured destination scope. That reference is a hint only: it is not a
staging-attempt ID, reservation, idempotency key, expected pointer revision, or
evidence authority. A changed artifact, checksum, source, format, validator
result, rights or quality result, lifecycle version, or access policy requires
a new candidate envelope, hash, and Publish decision.

The three human release-review decisions are the deliberate exception to
candidate-envelope storage. They are append-only local SQLite evidence linked
to an already registered candidate, not canonical manuscript input and not
fields hashed into that candidate. Each record redundantly binds the exact
candidate hash, source fingerprint, and HTML, PDF, and EPUB artifact hashes;
the service resolves those values from the registered candidate and resolves
the human reviewer from the authenticated server session. A browser cannot
author any binding or reviewer identity. For an approved rights and brand
review, the human reviewer must declare a non-empty qualified role. This is a
recorded human assertion, not independent credential or attestation proof.

Release eligibility is a server-side join of the exact current candidate and
the latest valid record for each fixed review kind. Wrong-candidate, stale,
rejected, incomplete, or corrupt evidence fails closed. The Publish approval
binds the candidate, zero-blocking-findings decision, and exact release-policy
result hash in the durable lifecycle ledger. Manifest creation re-reads the
current evidence and requires it to remain eligible with that identical policy
hash; a later rejection or replacement review cannot reuse the historical
approval. This separation prevents a review record from changing the source
fingerprint or candidate it is intended to approve while retaining an exact
auditable binding at Publish.

Manifest authority uses a recoverable pending-to-completed protocol under the
project writer lock. The first immediate SQLite transaction reloads the latest
candidate, current unexpired and non-invalidated Publish approval, current
unexpired exact Beta approval, and exact durable reviews, then persists the
normalized manifest JSON and hash with a pending identity. The system writes
staging, promotes and verifies the exact immutable target, and durably records
the filesystem `material-verified` phase. Only a module-private, one-time
capability bound to that exact live promotion may enter the second SQLite
transaction that marks the finalization and identity completed together. The
system then durably records `ledger-completed` before deleting the backup.
Recovery at `material-verified` rechecks current authority before resuming; it
rolls back when completion cannot still be authorized. A crash after SQLite
completion but before the ledger marker preserves the target and reconciles
the marker on retry. Earlier promotion failure leaves both ledger rows
pending. Only completed records verify as releases. Identical retries resume
pending material after write, promotion, verification, or process
interruption; they cannot consume a different identity. No separate
reservation API accepts a caller-created manifest.

The lock order is workspace output lock, project writer lock, then SQLite
immediate transaction. Every command that can change shared `build/` or
`dist/` material takes the workspace lock first, including builds,
finalization, and clean. A nested project lock may then protect that project's
canonical and ledger boundaries. Held project authority is rejected unless
the caller also proves the enclosing live workspace authority. No code waits
for either filesystem lock while holding a database transaction. Relevant
filesystem material is derived and re-confirmed under that lock immediately
before commit. Direct external editor writes cannot be prevented by SQLite or
the cooperative lock, so any mismatch observed by the stability recheck causes
rollback.

The promotion boundary accepts no caller-selected output root. Before reading
or recovering any promotion marker it validates both unforgeable live lock
handles, proves the discovered project path belongs to that exact workspace,
and derives `dist/releases/immutable/<project-id>/<release-id>` from those
trusted identities. The one-time completion capability binds that workspace,
every physical output directory from `dist/` through the exact target, every
expected artifact and retained-source file, the project root, manifest, and
live promotion transaction. Each directory and file identity is revalidated
before the final database commit and before promotion cleanup. Released,
forged, wrong-root, replaced, non-canonical, and replayed authority cannot
complete a ledger row.

Held-lock authority is a process-private live handle, not a caller-supplied
path or owner string. It is accepted only for the exact project root that
created it. The handle pins the lock parent and lock file, retains an open file
descriptor, and rechecks descriptor/path device and inode, one-link status, and
exact owner bytes. Release is idempotent and removes the lock only while all of
those facts still match, so parent replacement, file replacement, unlinking,
hard-linking, or repeated release cannot unlink a successor writer's lock. This
hierarchy ensures a workspace clean cannot race a build or finalization whose
project root is nested below it.

Workspace and project locks pin physical directory identity: canonical
path plus device and inode. Lock acquisition rejects a symbolic-link lock
directory and creates each missing directory segment only after checking its
ancestors. Every later authority check revalidates that physical identity, so
renaming and replacing a root invalidates the handle. Publishing, verification,
and clean similarly reject symbolic links in existing project, `build`, `dist`,
candidate, immutable, staging, and promotion path segments before touching
their contents. A symlink is never followed to establish a trusted output root.

After both physical locks are held, publication discards the caller's material
view and re-discovers the canonical Book Project. It requires the caller view
to match the fresh ID, physical roots, workspace path, authority, snapshot hash,
pointer version, manifest, Blueprint, metadata, and chapter-byte identity.
That identity is checked again after rendering, before finalization, after the
last completion hook, and immediately before promotion capability consumption.
Capability consumption occurs only after these final checks. A changed
`.rtb-content/current.json` pointer or canonical byte causes rollback and leaves
the release ledger pending; only a newly discovered build may retry.

The generic non-release book builder follows the same physical-lock and fresh
discovery rules. It renders only into unique, physically validated staging
directories and moves verified outputs into validated final namespaces. It
rejects stale project views, symbolic output roots, multiply linked snapshot
files, and multiply linked canonical pointer files.

The release build holds that lock while it renders in unique staging,
registers the candidate, finalizes approved material, and performs the last
verification. Candidate-only builds move to
`dist/candidates/<project>/<candidate-hash>` and never enter the release
namespace. Only exact approved finalization may enter
`dist/releases/immutable/<project>/<release-id>`. Existing immutable targets
are reused only after exact path, real-path containment, symbolic-link-free
tree, material, and ledger verification; no different material can overwrite
a release ID. The old `dist/releases/<project>` location remains read-only
legacy reconciliation evidence.

Promotion uses a same-filesystem directory rename with an explicit durable
state machine. Atomic, file-fsynced and directory-fsynced markers bracket every
old-to-backup, staging-to-target, target-to-quarantine, backup-to-target, and
cleanup operation with intent and completion phases. The backup remains until
the promoted directory passes exact post-rename verification. Recovery before
the durable `verified` phase restores the prior release; recovery at or after
that phase completes the exact new release. Each rollback phase is idempotent,
so a second crash cannot activate unverified bytes or delete a restored prior
release.

Markers have one closed schema and version, a fixed phase enum, exact project
and release identities, a cryptographically random UUID token, and a prior
target flag. Paths are derived internally from the trusted output root and
those validated identities. Marker-owned paths, traversal, unsafe names,
symbolic links, malformed JSON, unknown fields, and mismatched identities are
rejected without filesystem mutation. The build passes explicit held-lock
authority into finalization; the finalization
operation never recursively acquires the lock. A legacy `reserved` identity
without a finalization record may be adopted only when its deterministic
release ID, candidate, real current approval and policy, current Beta, and
existing manifest bytes exactly reproduce. Otherwise recovery requires a new
exact Publish approval and never silently blesses the legacy row.

Completed verification is not a shortcut around authority reconstruction. It
always proves exact finalization, identity, candidate registry JSON and row,
manifest and artifact/source hashes, preserved Publish facts, Beta material
and approval, review evidence, project/release/candidate/approval equality,
expiry at completion, and the causal sequence from Beta preparation and
approval through final-candidate registration, reviews, Publish approval,
identity/finalization creation, and completion. Only the one-time population
of missing migration-007 completion facts is conditional.

Completed verification is historical integrity, not current eligibility. The
completion record preserves approval actor, creation time, lifecycle version,
and exact binding bytes proven current at `completed_at`. A later Blueprint
invalidation or product revocation does not alter those historical facts or
the immutable release bytes. Current distribution eligibility and revocation
are separate mutable product decisions.

Databases upgraded from the earlier finalization schema reconcile missing
completion-time approval facts only when every redundant authority agrees:
completed identity fields, registered candidate project/hash/source/artifacts
and lifecycle, normalized manifest JSON and checksum, exact human approval and
bindings, candidate-plus-one approval lifecycle, zero blocking findings,
historical review-policy hash, exact Beta snapshot/policy material and Beta
approval lifecycle, Publish expiry, and every creation/completion/invalidation
timestamp. Manifest project, lifecycle, source, and artifacts must independently
match the registered candidate. Ambiguous, mismatched, or already-invalid evidence remains
preserved and fails with an explicit operator-reconciliation requirement;
migration never trusts a manifest-owned assertion alone or guesses historical
authority.

The manifest itself receives a SHA-256 checksum. An implementation may add a
signature, but a signature cannot replace the required artifact and manifest
checksums. The local immutable manifest is the comparison authority for remote
reconciliation. Hosted destination identities, transferred bytes, verified
remote checksums, access-test results, and provider observations always belong
in the local append-only staging-attempt ledger linked to the preexisting
manifest checksum. They are never added to or embedded in the final manifest.
Hosted metadata is never trusted as proof of artifact content.

Release content consists only of allowlisted, approved artifacts and the
minimum publication metadata declared by the manifest. Drafts, research,
evidence, rejected proposals, Editorial Memory, credentials, local database
records, and subscriber data cannot enter the bundle.

### Disk-Backed Preparation and Streaming

Preparation uses a clean, bounded, disk-backed staging directory dedicated to
one release ID. The renderer and adapter must not retain the complete
manuscript, bundle, or large artifact set in application memory. Source reads,
checksum calculation, artifact validation, and transfer use bounded buffers or
streams. Temporary paths remain inside an approved staging root, reject links
and traversal, and are cleaned or quarantined according to the recorded
failure outcome.

All required formats must be generated from the same source snapshot. The
release stays local and inactive if any artifact is missing, empty, stale,
outside the staging root, fails its format-specific validator, or has a
checksum mismatch.

### Staging Attempt and Evidence Authority

Local SQLite is the operational authority for release-staging attempts and
their evidence. Increment 1 does not reserve an attempt. In Increment 3, after
an authoritative read of the current active pointer and immediately before the
outbox or any hosted request, one SQLite transaction reserves a globally unique
attempt ID and appends an immutable attempt-start record binding the release
ID, manifest checksum, destination, expected active-pointer pair and revision,
lifecycle and approval references, input fingerprint, idempotency key,
optional future-staging hint, and prior-attempt ID when this is a retry.

Every dispatch, remote observation, checksum, access result, reconciliation,
compensation, and error is a new immutable observation linked to that attempt.
Finalization appends exactly one immutable terminal record; it does not update
or delete prior observations. Retrying reserves a new attempt ID linked to the
prior attempt and preserves both histories. An optional immutable export may
copy this ledger for audit or portability, but the export is not a second
operational authority.

Hosted records are evidence sources, not the authority for attempt history.
Local SQLite may observe the active pointer, but the configured hosted
adapter's release-state store is authoritative for the active release ID and
its monotonic revision.

### Hosted-Library Adapter Contract

The hosted-library adapter exposes versioned operations for:

- Capability discovery and compatibility proof
- Idempotent release staging or authoritative stage reconciliation
- Hosted artifact, metadata, and access-control verification
- One guarded active-release pointer and revision read and compare-and-set
- Rollback to a retained verified release
- Unpublish and access revocation
- Protected HTML access and short-lived binary download grants
- Remote release deletion under retention policy
- Audit and webhook reconciliation where the provider supports them

Only a release with a current human Publish approval may cross the hosted
boundary. Increment 3 consumes the exact approved immutable Increment 1 release;
hosted staging and activation do not request or record a second Publish
approval. Every remote mutation follows ADR-009. The worker commits an outbox
record before dispatch, propagates a stable scoped idempotency key when
supported, and appends the remote identity and reconciled result to the local
staging attempt. If Ghost or a fallback cannot provide idempotent mutation or
authoritative reconciliation, an uncertain side effect becomes
`blocked-awaiting-action`; it is not repeated automatically.

Compensation is explicit, bounded, and idempotent. It may remove an incomplete
staging release, revoke grants, or restore the intended release through a new
compare-and-set against the current pointer pair, but it must never reset or
reuse a pointer revision, delete, or overwrite the previously active release. A
failed compensation is durable blocked work with a creator-visible next
action.

### Activation, Rollback, and Unpublish

There is exactly one mutable active-release pointer per published book
destination. Its value is the pair
`(release_id, monotonic_pointer_revision)`. The revision begins at zero and
never decreases or resets. The hosted adapter release-state store is the
authority for this pair and its compare-and-set history. Local SQLite stores
only timestamped, append-only observations and must reconcile with the hosted
authority before every mutation. Activation is one guarded compare-and-set
after:

1. The versioned local release-candidate envelope passes every required
   validator and receives its stable SHA-256 hash.
2. The existing Increment 1 human Beta approval precedes the Publish action in
   the same guarded lifecycle.
3. The existing Increment 1 human Publish action and lifecycle guards approved
   that exact envelope hash and lifecycle version.
4. The immutable manifest binds that approval and passes its checksum check.
5. Every remote artifact matches its manifest checksum.
6. Hosted visibility, subscriber authorization, and download controls pass.
7. The current pointer still matches the caller's expected release ID and
   pointer revision.

Activation, rollback, and unpublish must compare both values in the expected
pair. Every successful pointer mutation atomically writes the target release
ID or unpublished value and increments `monotonic_pointer_revision` by one.
A mismatch in either value returns `conflict` and changes neither value. The
expected and resulting pairs are append-only audit evidence. This prevents a
stale operation that observed release A from succeeding after an A to B to A
sequence.

Uploading or staging content does not activate it. A failed upload,
verification, access check, or pointer mutation leaves the previous pair
unchanged.

Rollback verifies a retained prior release against its immutable manifest, then
compare-and-sets the expected release ID and pointer revision to the retained
target while incrementing the revision. It does not rebuild, edit, or copy the
prior bundle.

Unpublish compare-and-sets the caller's expected active release ID and pointer
revision to `null` or an explicitly disabled value while incrementing the
revision. A stale release ID or revision returns `conflict`; it does not clear
or revoke the current release, including when the current release ID has
returned to the expected value after an intervening activation. After the
pointer comparison succeeds, access revocation is scoped to the unpublished
release ID. Its sessions, grants, cache entries, and visibility are revoked
without changing another release's access state or rewriting release content.
Compensation and retry retain the original expected pair and idempotency key;
a duplicate reconciles the recorded outcome rather than issuing a new pointer
mutation.

Re-publishing uses a retained verified release or a new release ID; it never
reconstructs identity from mutable hosted state.

### Content, Access, and Retention Separation

Immutable release content and mutable operational or privacy records use
separate schemas and storage authority:

- Release bundles, manifests, and their checksums are immutable while retained.
- The active pointer, monotonic pointer revision, visibility, allowlists,
  sessions, grants, subscriber records, and access decisions are mutable and
  must not be embedded in a release manifest as current state.
- Subscriber identity is not required to verify release integrity and cannot
  enter release artifacts, checksums, or general release logs.

Retention is policy-driven per store. It covers active and superseded releases,
failed staging content, temporary files, subscriber records, access logs,
download grants, audit evidence, backups, legal holds, and provider copies. A
release under retention cannot be mutated. When policy authorizes destructive
removal, the system deletes the complete unreferenced bundle rather than
editing it and preserves only a minimal, non-content tombstone with release ID,
manifest checksum, deletion decision, time, and applicable exception.

After every successful activation, the immediately preceding active release,
when one exists, is the verified rollback target. It remains protected until
either its configured rollback window ends, which defaults to 30 days, or a
human explicitly retires it after another retained release has passed manifest,
artifact, access, and rollback verification and is recorded as the replacement
target. Before one of those conditions is satisfied, no retention schedule,
storage pressure, routine cleanup, or provider default may garbage-collect the
immediate predecessor.

A legal hold pauses deletion only for covered records. Privacy deletion,
irreversible redaction, or release garbage collection resumes when the hold is
released under the applicable schedule. Provider deletion requests and their
outcomes are recorded without claiming physical erasure that cannot be proved.

Protected PDF and EPUB downloads require current server-side authorization and
short-lived, audience-bound grants. Permanent public artifact URLs, public
buckets, directory listing, and complete signed URLs in logs are prohibited.

### Ghost Capability Spike

Ghost remains a candidate adapter until a time-boxed spike classifies the
required capabilities in an isolated staging environment. The spike may use no
more than two working days and no more than 16 human hours, and it stops earlier
when every matrix row is classified. It records the Ghost version, API and
plan, configuration, limits, observed behavior, sanitized fixtures, and
repeatable commands for this matrix:

| Capability | Required proof |
| --- | --- |
| Invitations and allowlist | Only an allowlisted email can complete the invitation and gain access; enumeration-safe failure is visible |
| Password-free access | Token expiry, replay denial, session rotation, revocation, and provider-outage behavior fail closed |
| Protected HTML | Server-side authorization protects every page and cache behavior cannot cross subscribers |
| Binary downloads | PDF and EPUB require short-lived authorization; revoked, expired, replayed, and copied grants are denied as designed |
| Search | Results contain only releases visible to the current subscriber and do not disclose private metadata |
| Staging | A release ID can be uploaded and verified without becoming active or overwriting another release |
| Activation | One guarded operation changes the active release or provides an authoritative primitive for the adapter to do so |
| Rollback and unpublish | A retained prior release can be restored and current access can be revoked without rebuilding content |
| API limits and failures | Rate limits, payload ceilings, partial uploads, timeouts, retries, and uncertain outcomes have bounded recovery |
| Webhooks and reconciliation | Events are authenticated and deduplicated where available; authoritative reads detect drift without trusting event bodies |

Each row receives `direct`, `fallback-required`, or `infeasible` with evidence.
`direct` requires both the successful path and its denial or failure cases. An
unavailable webhook may be `fallback-required` when polling supplies bounded,
authoritative reconciliation. At either time limit, every unresolved row is
classified `infeasible` with evidence that it was not proved within the spike;
the spike does not silently extend. A security invariant, protected-access
requirement, or safe activation requirement cannot be waived.

No production Ghost adapter is accepted while a required row is `infeasible`
or until every other row is proved either `direct` or through a documented
fallback behind the same adapter contract.

### Sidecar and Object-Storage Fallback

The approved fallback boundary is a minimal sidecar and private object storage,
used only for capabilities the spike marks `fallback-required`. Ghost may
provide membership and protected HTML while the sidecar authorizes binary
downloads, maintains the active pointer, or supplies reconciliation. The
fallback must:

- Implement the same release IDs, manifests, adapter operations, and audit
  contract
- Use private storage, least-privilege identities, short-lived grants, and
  server-side authorization
- Receive only manifest-allowlisted release data and minimum subscriber state
- Preserve staging, verification, activation, rollback, unpublish, retention,
  deletion, and idempotent recovery semantics
- Be selected explicitly from spike evidence rather than as a silent runtime
  downgrade

Adding a broader hosted application, a second publication authority, or a
general cloud workspace is outside this decision and requires governance
review.

## Implementation Acceptance Criteria

- Contract tests prove release IDs and manifest payloads cannot be reused or
  mutated and detect every artifact or manifest checksum mismatch.
- Candidate-envelope tests prove Publish binds the exact versioned envelope
  hash and that the final manifest preserves every material field while adding
  only the permitted approval and staging references.
- A fixture of at least 512 MiB must prove disk-backed rendering, checksum, and
  transfer with streaming chunks no larger than 8 MiB and a peak RSS
  (resident set size) increase no greater than 384 MiB above the measured idle
  aggregate for the complete process tree. Measurement includes the
  orchestrator plus every renderer, adapter, and other child process, or uses
  an equivalent container or cgroup boundary that contains them all. The test
  report records the operating system, architecture, runtime and tool versions,
  process-tree or container boundary, memory-sampling method and interval,
  aggregate idle baseline, aggregate peak RSS or equivalent peak, and fixture
  composition.

This 384 MiB complete-process ceiling is the recorded 2026-07-28 replacement
for the provisional 128 MiB aggregate target after selecting Typst plus the
pinned Java veraPDF validator. Individual disk-backed streaming stages retain
the 128 MiB increase ceiling.

- Multi-format failure tests keep the complete release inactive and preserve
  the previous pointer.
- Duplicate, interrupted, timed-out, and uncertain remote operations prove
  idempotent resume, authoritative reconciliation, or safe manual blocking.
- Staging-attempt tests prove an Increment 1 future-staging reference is
  deterministic but unreserved and cannot authorize hosted work. Increment 3
  transactionally reserves the authoritative attempt ID with the reconciled
  expected pointer revision before dispatch, appends immutable observations and
  one terminal record, and creates a new linked attempt for retry. Optional
  exports are reproducible copies, not an operational authority.
- Activation, rollback, and unpublish tests cover stale pointers, two
  concurrent operators, partial uploads, access-check failures, and crashes at
  every durable boundary. Unpublish fixtures prove compare-and-set conflict
  behavior and release-scoped access revocation. An A to B to A fixture proves
  that activation and unpublish commands holding A's old pointer revision both
  return `conflict` without mutation or revocation.
- Pointer tests prove the hosted adapter release-state store, not local SQLite,
  owns the active pair and monotonic revision. A stale or divergent local
  observation is reconciled and cannot authorize a compare-and-set.
- Authorization tests deny non-allowlisted, revoked, expired, replayed, and
  cross-subscriber HTML and download access.
- Retention tests distinguish immutable content from mutable privacy records
  and cover legal hold, destructive deletion, tombstones, the default 30-day
  rollback window, configured windows, replacement-target verification, human
  retirement, and blocked early garbage collection.
- The Ghost spike matrix and selected fallback architecture are recorded before
  a production Ghost implementation is accepted.

## Consequences

- A failed publication or rollback cannot silently replace the last verified
  active edition.
- Checksummed immutable bundles make local and hosted state independently
  verifiable.
- Subscriber privacy operations can proceed without rewriting publication
  content.
- Disk-backed streaming supports books larger than the application's memory
  budget.
- Ghost integration remains conditional and may require a narrowly scoped
  sidecar and object-storage deployment.
- Retained prior releases and durable audit evidence require explicit storage
  and deletion budgets.

## Rejected Alternatives

### Treat the Hosted Adapter as Publication Content Authority

Rejected. Ghost content and metadata are mutable hosted state and cannot
replace canonical Markdown, Git, or the local immutable manifest. This does
not change the hosted release-state store's narrow authority for its active
pointer and monotonic revision.

### Overwrite the Current Edition

Rejected. In-place replacement prevents reliable verification, rollback,
concurrent activation control, and incident reconstruction.

### Permanent Public Download URLs

Rejected. A reusable URL bypasses current subscriber authorization, revocation,
and private retention controls.

### Keep Complete Bundles in Process Memory

Rejected. Memory-backed publication scales with book size and makes resource
exhaustion and crash recovery harder to bound.
