# ADR-008 — Markdown, SQLite Authority, and Mutations

## Status

Accepted

## Context

The research-to-book Creator Studio combines portable authored content with
transactional workflow state. Markdown and Git must remain authoritative for
publication content, while jobs, proposals, locks, and checkpoints need durable
local transactions. Allowing either store to become an unbounded second source
of truth would make recovery, conflict handling, and releases unverifiable.

ADR-005 made the local interface read-only and allowed jobs to invoke existing
CLI workflows. RFC-006 now permits approved Creator Studio actions to make
canonical changes through a narrow local service. That change requires explicit
field ownership and a recoverable mutation protocol.

## Decision

### Authority Matrix

Each entity and field has exactly one authority. A new field must receive an
authority assignment before implementation.

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
| Release staging attempts and evidence | Local SQLite append-only ledger | Operational authority; immutable export is optional |
| Active release pointer and monotonic revision | Hosted adapter release-state store | Local SQLite is a derived observation only |
| Subscriber identity and sessions | Configured hosted identity adapter | Minimum hosted operational state |

SQLite may store hashes, paths, summaries, and indexes that point to canonical
files. Those values are derived locators, not an alternate manuscript or
configuration authority. Search, FTS, and artifact dependency indexes must be
rebuildable from canonical files and manifests. Where the matrix requires an
immutable audit export, SQLite owns the active record and the export is its
append-only evidence copy, not a second mutable authority.

### Versioned Core-Record Envelope

Before first use, every `BookProject`, `BookBlueprint`, `Source`, `Evidence`,
`Claim`, `Contradiction`, `RightsRecord`, `ReviewProposal`,
`EditorialDecision`, `MemoryRule`, `WorkflowRun`, `WorkflowStageAttempt`,
`QualityFinding`, `Artifact`, `ReleaseManifest`, and `ReleaseStagingAttempt`
must have a versioned schema.

Every core record includes:

- A stable ID
- `schema_version`
- Creation and update timestamps
- The actor or producer
- Validation rules

Content-bearing and derived records also include input and output hashes.
Schema changes require forward migrations, fixture coverage, and documented
rollback limits.

### Authorized Mutation Contract

The authorized local mutation service is the only path by which a Creator
Studio action may change canonical files. Before validating expected hashes,
it must acquire one per-project OS/filesystem exclusive writer lock shared by
every process that can invoke the mutation service. The lock does not expire
while its owning process lives. While holding that lock, the service atomically
acquires an SQLite-backed mutation lease for durable owner, operation, and
fencing-token identity. No two mutation commands may overlap the protected
interval for one project.

Lifecycle transitions and canonical mutations use this same writer lock.
After acquiring it, every mutation revalidates its expected lifecycle version
and guard. It repeats that check immediately before the canonical root-pointer
change and uses a guarded lifecycle-version comparison in the SQLite commit.
Every lifecycle transition holds the lock from its expected-version check
through its durable append-only transition commit. A stale mutation or
transition returns `conflict` before canonical visibility changes. An
unexpected guarded-commit mismatch fails closed and enters recovery; it never
authorizes the new snapshot.

Every canonical reader resolves the current versioned snapshot root once at
the start of an operation and reads only immutable files below that root.
Readers never combine paths resolved from different root versions. The prior
snapshot remains readable while any reader may hold it. A multi-file mutation
becomes visible only through one atomic, same-filesystem replacement of the
current root pointer; replacing individual live files is prohibited.

While holding both the writer lock and lease, each command performs these
durable phases:

1. **Validate:** Validate the fixed command, authenticated actor, expected
   content hashes, expected lifecycle version, and lifecycle guard; calculate
   all file and SQLite effects without changing canonical state.
2. **Preserve:** Materialize every affected preimage as durable,
   content-addressed bytes or verify that the exact bytes already exist in the
   prior immutable snapshot. Record their paths and hashes in a durable
   mutation journal intent.
3. **Prepare:** Build a complete next immutable snapshot in a same-filesystem
   temporary root, verify all hashes and validators, and durably record the
   next snapshot hash.
4. **Publish files:** Atomically compare and replace the current root pointer
   from the expected prior snapshot and pointer version to the next snapshot
   and pointer version.
5. **Commit state:** In one SQLite transaction, compare the lease fencing
   token and lifecycle version, append the operational and audit effects, and
   record the `state_committed` journal phase.
6. **Complete:** Verify the visible root, snapshot hashes, and SQLite effects,
   then mark the journal complete. Release the SQLite lease and writer lock
   only after this phase is durable.

Durability ordering is normative. Preimage and next-snapshot files are fully
written and `fsync`ed before their containing directories are `fsync`ed.
The journal intent and prepared phase use SQLite full-durability settings and
are committed before the root pointer can change. After atomic pointer
replacement, the pointer file and its parent directory are `fsync`ed before
the SQLite state commit. Journal completion is committed and the database file
and required write-ahead-log state are durable before cleanup. A platform that
cannot prove equivalent file-and-directory durability may not enable canonical
mutation.

Expected content hashes provide optimistic concurrency. A stale expected hash
must return a proposal conflict and preserve both versions; it must never
overwrite the current canonical snapshot. Content-addressed preimages, the
prior snapshot, and the next snapshot remain physically available until
journal completion and the configured reader/recovery retention condition both
permit collection.

### Mutation Recovery

At startup, the mutation service acquires the same per-project writer lock and
recovers every incomplete journal entry before accepting a new mutation. It
must prove that the prior writer terminated or completed explicit
cancellation, fence the abandoned SQLite lease, claim recovery ownership
atomically, and then apply this table:

| Last durable phase | Canonical visibility | Required recovery |
| --- | --- | --- |
| No journal intent | Prior snapshot | Remove only unreferenced temporary data; no canonical action |
| `intent_durable` | Prior snapshot | Verify the content-addressed preimages, discard or resume preparation, and append the outcome |
| `snapshot_prepared` | Prior snapshot | Verify both snapshots; either resume the guarded pointer change or abandon the next snapshot |
| `pointer_published` | Next snapshot | If state was not committed, atomically restore the pointer to the verified prior snapshot and `fsync` the pointer directory; otherwise advance to state verification |
| `state_committed` | Next snapshot | Verify the guarded SQLite effects and all next-snapshot hashes, then durably complete; any mismatch freezes the project for incident recovery |
| `complete` | Next snapshot | Verify invariants, release retained recovery data only when policy permits, and accept new work |

Rollback is permitted only to the journal-bound, hash-verified preimage
snapshot and uses a new monotonic root-pointer version. Recovery never rewrites
the old snapshot, guesses missing bytes, or reconstructs a preimage from the
partially published state. If the prior snapshot or any required preimage
cannot be verified, the project is `blocked` and canonical mutation remains
disabled until explicit incident recovery supplies verified bytes.

A live but hung writer continues to own the lock and blocks takeover. Recovery
must wait for explicit termination or successful cancellation of that owner;
lease expiry alone must never permit a competing file replacement.

SQLite transactions cannot make filesystem writes atomic. The durable journal,
verified temporary files, atomic replacement, and startup recovery together
provide the cross-store recovery boundary. Best-effort dual writes are not
permitted.

### Local Request Security

The browser reaches the mutation service only through the local platform
boundary. The service must:

- Bind only to IPv4 or IPv6 loopback and reject LAN or wildcard binding.
- Enforce a strict allowlist of loopback `Host` values and ports before
  routing, rejecting DNS-rebinding and forwarded-host ambiguity.
- Accept mutation requests only from the configured same origin with valid
  Origin and Fetch Metadata checks, a session-bound CSRF token, and an
  authenticated, short-lived local capability or session.
- Require JSON with an exact supported content type, schema validation, and
  bounded header, body, field, and batch sizes.
- Apply per-session and per-operation rate limits and reject replayed command
  identities.
- Keep credentials and capability tokens out of URLs, query strings,
  fragments, redirects, logs, and browser history.

These controls add to the Local Platform Security Policy; they do not authorize
remote access, user accounts, or a wider command allowlist. The browser still
cannot write files or supply arbitrary paths or commands.

### Amendment to ADR-005

ADR-005 is amended only at its write boundary. Its statement:

> The UI never writes canonical content directly; jobs invoke existing CLI
> workflows through a fixed allowlist.

is replaced by:

> The browser never writes canonical content directly. Approved Creator Studio
> actions invoke an authorized local mutation service through a fixed
> allowlist; that service is the sole writer for canonical local changes.

ADR-005 remains active in all other respects: the local application remains
dependency-light, indexes and summaries remain derived, and arbitrary external
execution remains deferred.

## Implementation Acceptance Criteria

- Crash injection at every phase proves that durable, hash-verified preimages
  exist before pointer replacement and that rollback remains physically
  possible after partial publication.
- Durability fixtures verify file and directory `fsync` ordering, root-pointer
  atomicity, monotonic pointer versions, and recovery on every supported
  filesystem and operating system.
- Concurrent readers of a multi-file mutation observe either the complete
  prior snapshot or the complete next snapshot, never a mixed set.
- Lifecycle-transition and canonical-mutation races use the same project writer
  lock. Stale lifecycle versions fail before pointer replacement, and injected
  guarded-commit mismatches restore the verified prior snapshot before new
  work.
- Startup recovery follows the phase table in an idempotent way and blocks when
  a required preimage, snapshot, lifecycle guard, lease, or hash cannot be
  verified.
- Browser tests cover non-loopback binding, malicious `Host` values, DNS
  rebinding, cross-origin and missing-origin requests, CSRF, expired local
  capabilities, wrong content types, oversized bodies, rate limits, replay,
  and credentials in URLs.

## Consequences

- Authored content stays portable, inspectable, and reproducible from Markdown
  and Git.
- Transactional state can use SQLite without making it a competing manuscript
  authority.
- Expected hashes reject stale tabs, concurrent edits, and proposal conflicts
  without data loss.
- Cross-store changes require journal management and startup recovery tests.
- Derived indexes can be discarded and rebuilt without changing canonical
  records.

## Rejected Alternatives

### Direct Browser Writes

Rejected. Browser filesystem writes would bypass the command allowlist,
validation, lifecycle guards, optimistic hashes, and recovery journal.

### Best-Effort Dual Writes

Rejected. Independently writing files and SQLite without a durable intent
record leaves ambiguous partial state after a crash.

### Database-First Manuscripts

Rejected. Making SQLite or a hosted system authoritative for manuscript prose
would conflict with the accepted Markdown and Git publishing model and weaken
portable, reviewable releases.
