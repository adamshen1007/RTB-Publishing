# ADR-011 — Notion Three-Way Proposal Reconciliation

## Status

Accepted for implementation after RFC-006

## Context

ADR-007 keeps Markdown and Git canonical and makes Notion a private derived
review surface. Its manual-only return path prevents Notion from becoming a
second source of truth, but it cannot reliably distinguish a Notion edit from
a concurrent local edit or preserve both when reviewers and authors work at
the same time.

RFC-006 accepts proposal-only Notion reconciliation after the Beta Gate. This
decision defines that reconciliation without granting Notion direct mutation
authority.

## Decision

### Export Identity and Immutable Base

Each Beta Gate export creates an immutable, content-addressed export base. It
contains:

- Project, beta, export, schema, and converter versions
- Canonical source paths and content hashes
- A normalized abstract syntax tree for every exported document
- Stable section and block IDs that persist across compatible exports
- The mapping to Notion page and block IDs
- Notion revision IDs or equivalent observed revision evidence
- Export timestamps, parent export ID, and lifecycle version
- A report of omitted, unsupported, or lossy conversions

Stable section and block IDs identify semantic units independently of text
position and Notion's private identifiers. New content receives new IDs;
deletion does not recycle an ID. Splits, joins, and moves record predecessor or
parent relationships where deterministic identity cannot be preserved.

The normalized abstract syntax tree is produced by a versioned, deterministic
converter. It normalizes semantically equivalent formatting while retaining
meaningful text, structure, ordering, links, annotations, and supported
comments. The export base is never updated in place. A later export creates a
new base and lineage.

The bridge reads a consistent Notion snapshot. It records revision evidence
before and after retrieval and rejects or retries the import if the page
changes during that interval. Private Notion identifiers and credentials remain
in ignored local state; the immutable audit export contains only the minimum
identifiers needed for reconciliation.

### Three-Way Comparison

Import converts the current Notion representation into the same normalized
tree, then compares:

1. The immutable export base
2. Current canonical Markdown
3. The consistently read Notion snapshot

Comparison is by stable identity and normalized semantics, not line number or
Notion block position alone. It detects edits, deletions, additions, moves,
splits, joins, formatting changes, and supported comments.

A change present only in Notion becomes a proposal. A change present only in
Markdown remains canonical and does not become a reverse Notion mutation. The
same normalized change on both sides is already resolved. Incompatible changes
to the same semantic unit become an explicit conflict. Ambiguous identity,
converter-version incompatibility, or missing revision evidence also fails
closed as a conflict or blocked import.

Every imported change becomes an individual, immutable proposal at the
smallest safe semantic unit. Each proposal has a stable proposal ID and an
immutable payload whose proposal hash binds:

- Proposal type and stable affected IDs
- Export-base, current-Markdown, and current-Notion values and hashes
- Source path, parent and ordering context, and converter versions
- Notion page, block, and revision evidence
- Author or reviewer identity when the connector supplies it
- Import run and idempotency identities
- Creation-time conflict, dependency, and unsupported-content classification
- Creation timestamp and proposal schema version

Comments are review proposals or evidence attached to a proposal; they never
become publication text automatically. Proposal dependencies make structural
changes, such as a parent deletion and child edits, reviewable without unsafe
application order. Reimporting the same revisions and hashes returns the
existing proposals instead of duplicating them. Proposal payloads and hashes
are never updated, including after a decision, retry, conflict resolution, or
canonical application.

Human decisions are separate append-only records linked by proposal ID and
proposal hash. Each decision record contains a decision ID, accept, reject,
defer, or revised-resolution choice, actor, rationale, timestamp, expected
canonical hash and lifecycle version, and the selected or revised normalized
result and hash. Each proposal's decision stream assigns a monotonically
increasing `proposal_decision_revision` in the same transaction that appends a
decision. The append command supplies the expected current revision; a stale
revision cannot create a competing decision. A later decision may explicitly
supersede an earlier decision by decision ID, but it cannot edit or erase that
decision or the proposal.

Application attempts are a third append-only record type. Each attempt links
the proposal ID and hash, decision ID and hash, expected
`proposal_decision_revision`, expected canonical and lifecycle versions,
mutation command and journal identity, timestamps, observed decision revisions,
validator results, outcome, and resulting canonical hash when successful. A
retry creates a new attempt linked to its predecessor. Current review state is
a derived view over the immutable proposal and append-only decision and
application records; it is not stored by mutating the proposal.

### Unsupported Blocks and Conflicts

Every export and import produces a conversion report. Unsupported or lossy
Notion blocks retain their page, block, type, position, revision evidence, and
a sanitized preview or hash when safe. They are never silently dropped or
flattened into canonical prose.

An unsupported block that could affect meaning is blocking until a human
excludes it, converts it manually, or a compatible converter handles it. The
original Notion content remains untouched. Malformed, oversized, inaccessible,
or permission-denied blocks produce visible, bounded failures.

A conflict preserves the export base, current Markdown, and current Notion
versions. The creator may append a decision containing an explicit revised
resolution, rejection, or deferral, or produce a new beta export after
resolving canonical content. The bridge never chooses a side by timestamp, last
writer, provider output, or Notion revision order.

### Human Decision and Authorized Mutation

The creator can append an acceptance, revised resolution, rejection, or
deferral decision for each proposal. The decision binds the exact immutable
proposal hash, current canonical hash, lifecycle version, actor, and intended
normalized result. A stale hash, changed dependency, unresolved blocking
conflict, or failed policy check prevents application.

The command that queues application binds the immutable proposal ID and hash,
the accepted or revised-resolution decision ID and hash, and the expected
`proposal_decision_revision`. When a decision is superseded, every queued
application bound to it is stale and cannot be retargeted to the replacement
decision.

Decision appends and decision applications serialize through the same
per-project writer lock. After acquiring that lock, the mutation service must
verify that the expected decision revision is still the latest revision and
that the referenced decision is current, has not been superseded, and is an
acceptance or revised resolution. A mismatch appends a stale
application-attempt result and fails closed before temporary-file preparation
or canonical replacement.

Only the authorized local mutation service from ADR-008 may apply an accepted
or revised-resolution decision. While retaining the writer lock through journal
completion, it revalidates the proposal hash, decision ID and hash, expected
decision revision, current canonical hash, lifecycle version, and policy
results at every durable commit boundary. This includes a check immediately
before canonical replacement and a guarded comparison in the SQLite commit
that records the application result. Because decision appends require the same
writer lock, the decision revision cannot legitimately advance between those
checks. A failed lock-time or pre-replacement check aborts before canonical
root-pointer replacement. An unexpected guarded-commit mismatch leaves the
mutation journal in ADR-008's `pointer_published` phase. Recovery must use the
journal-bound, content-addressed preimages to atomically restore the verified
prior snapshot and `fsync` the root-pointer directory before new mutations are
accepted. If those preimages cannot be verified, the project remains blocked;
recovery never reconstructs them from partially published files. The service
then appends the application attempt with the audit result. A Notion webhook,
connector, provider, browser, or import worker cannot write Markdown directly
or approve a lifecycle gate.

Acceptance does not mutate Notion automatically. A later explicit export may
update the derived review surface from canonical Markdown and creates a new
immutable base. Failed attempts and rejected, deferred, or superseded decisions
remain in the append-only decision history; their proposals remain unchanged.

### Amendment to ADR-007

This ADR supersedes only ADR-007's manual-only return path after RFC-006 and
this ADR's implementation acceptance criteria pass. The following part of
ADR-007:

> Use Review Findings as the return path. A Notion suggestion becomes effective
> only after a human accepts it, changes Markdown, runs quality checks, and
> resyncs the derived page. Do not implement automatic two-way reconciliation.

is replaced by:

> A Notion change returns as an individually reviewable proposal produced by an
> immutable-base, normalized-AST three-way comparison. It becomes effective
> only after a human appends an acceptance or revised-resolution decision and
> the authorized local mutation service validates that decision and the exact
> immutable proposal before applying it to current Markdown.

ADR-007 remains active in every other respect. Markdown is the only canonical
publication source, Notion remains private and derived, Notion identifiers
remain local, and Notion outages cannot block local authoring or publishing.
This is proposal reconciliation, not automatic two-way authority.

Until the implementation acceptance criteria pass, ADR-007's existing manual
return path remains the operational rule.

## Implementation Acceptance Criteria

- Fixtures prove stable identity across unchanged, edited, moved, added,
  deleted, split, and joined content.
- Converter fixtures prove deterministic normalized output and report every
  unsupported or lossy block.
- Three-way fixtures cover Notion-only changes, Markdown-only changes, equal
  changes, incompatible changes, comments, reorderings, and deletions.
- Concurrent Notion revisions, stale canonical hashes, duplicate imports, and
  stale decisions fail closed without data loss or duplicate proposals.
- A queued application whose decision is superseded fails as stale before
  canonical replacement; concurrent decision and application commands are
  serialized by the project writer lock.
- Crash and concurrency fixtures verify the current decision ID, hash, and
  `proposal_decision_revision` at lock acquisition, immediately before
  canonical replacement, and in the durable application-result commit.
- Post-pointer crash fixtures prove ADR-008 recovery restores the verified
  prior snapshot from durable preimages before accepting another decision or
  application.
- Accepted proposals can be applied only through ADR-008's authorized mutation
  and recovery protocol.
- Audit fixtures prove proposal payloads and hashes never change and preserve
  separate append-only human decisions and application attempts.
- Audit fixtures preserve all three compared versions, superseded decisions,
  retry lineage, and canonical application results.
- End-to-end tests show that rejected, deferred, conflicted, unsupported, or
  unapproved content cannot change Markdown.

## Consequences

- Reviewers can work in Notion while Markdown remains the only publication
  authority.
- Concurrent edits become explicit proposals or conflicts instead of
  last-writer-wins overwrites.
- Immutable bases and normalized conversion make reconciliation reproducible
  and auditable.
- Stable IDs and converter migrations add metadata and testing complexity.
- Unsupported Notion features require visible manual handling.

## Rejected Alternatives

### Last-Writer-Wins Synchronization

Rejected. Revision order cannot establish editorial intent and would discard
one side of a concurrent change.

### Direct Notion-to-Markdown Writes

Rejected. They would bypass human proposal decisions, lifecycle guards,
expected hashes, canonical validators, and mutation recovery.

### Line-Based Comparison

Rejected. Notion blocks and Markdown lines do not share stable positions, and
format-only changes would create noisy or unsafe merges.
