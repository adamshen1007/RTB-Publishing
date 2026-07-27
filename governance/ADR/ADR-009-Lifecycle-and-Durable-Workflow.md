# ADR-009 — Lifecycle and Durable Workflow

## Status

Accepted

## Context

Research-to-book production contains human approval boundaries, granular
editorial decisions, long-running provider work, and recoverable local
mutations. If modules own independent status fields, they can disagree about
whether expensive work, export, or publication is allowed. If jobs exist only
in process memory, a restart can lose attempts, repeat side effects, or leave
canonical state and the interface out of sync.

RFC-006 establishes exactly three human approval gates. The workflow
architecture must enforce those gates while making concurrency, retries,
cancellation, budgets, and recovery observable and deterministic.

## Decision

### One Guarded Lifecycle

Each Book Project uses one versioned, guarded lifecycle state machine. Its
append-only transition history records:

- The project and lifecycle version
- The prior and requested states
- The actor and reason
- The caller's expected version
- Guard and policy results
- The resulting version and timestamp

Every transition command supplies the expected lifecycle version. A stale
version fails with a conflict and does not mutate lifecycle or canonical state.
Guards fail closed when required policy results, approvals, or records are
missing. State-machine definitions are versioned; changing states, guards, or
transition meaning requires an explicit migration.

The lifecycle proceeds through:

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

The only lifecycle approval gates are:

1. **Blueprint Gate:** a human approves the brief, research plan, source
   policy, initial architecture hypothesis, budgets, and provider-egress policy
   before research or other expensive work.
2. **Beta Gate:** a human approves a complete beta before export to Notion.
3. **Publish Gate:** a human explicitly performs the Publish action after all
   blocking proposals and quality policies pass and the same lifecycle has a
   current Beta approval. The action approves the exact local
   release-candidate envelope and authorizes creation of its final immutable
   manifest; later hosted staging and activation consume that approved release
   and do not create a second Publish gate.

Source, claim, chapter, visual, proposal, and Editorial Memory decisions are
granular review decisions within lifecycle stages. They may satisfy or block a
guard, but they do not create additional lifecycle gates. No agent, provider,
connector, or adapter may record or bypass a gate approval.

Increment 1 implements the minimum guarded transitions, durable human approval
records, and interface actions for Blueprint, Beta, and Publish, and the YC
migration must traverse them in that order. Increment 2 may add evidence,
automation, and stronger beta-quality policies around the existing Beta Gate,
but it cannot introduce, duplicate, or defer that gate. No increment may expose
Publish while its prerequisite Beta transition is unavailable.

The architecture approved at the Blueprint Gate is an initial hypothesis, not
a claim that evidence collection is complete. Evidence may refine parts,
ordering, and individual chapter details as granular revisions. A change to
the target reader, promised outcome, scope boundary, thesis, or any chapter
contract that materially changes research or composition obligations
invalidates the current Blueprint approval. The lifecycle returns to Blueprint
review and composition cannot begin or resume until a human reapproves the new
version. Non-material refinements remain append-only review decisions and do
not create another gate.

### Lifecycle and Mutation Serialization

Lifecycle transitions and canonical mutations share ADR-008's per-project
writer lock. A transition holds the lock from its expected-version and guard
checks through its durable append-only transition commit. A canonical mutation
holds it from expected-hash and lifecycle checks through root-pointer
publication, the guarded SQLite commit, and durable journal completion.

After lock acquisition, a mutation revalidates its expected lifecycle version
and guard immediately before root-pointer publication and compares that
version again in its SQLite commit. A transition or mutation with a stale
expected version returns user-visible `conflict` without changing lifecycle or
canonical visibility. If an injected or corrupt guarded-commit mismatch occurs
after pointer publication, ADR-008 recovery restores the verified prior
snapshot before the project accepts another command. A transition may not
overtake a durable mutation, and a mutation may not rely on a lifecycle guard
checked before it acquired the lock.

### Durable Run and Attempt Contract

SQLite stores the durable job ledger. A workflow is represented by a stable run
ID and durable stage and attempt records. Every run and stage attempt records:

- Run, stage, and attempt IDs
- Parent and retry lineage
- Input fingerprint and idempotency key
- Provider, model, prompt, and capability versions when applicable
- Status, timestamps, progress, and verification result
- Retry classification and attempt limit
- Checkpoint and recovery action
- Sanitized error and user-visible message

The idempotency key identifies the logical operation, while an attempt ID
identifies one execution. Repeating a submission with the same key must return
or resume the existing logical operation rather than duplicate records or
side effects. A retry creates a new attempt linked to its predecessor and
preserves the run and stage lineage.

SQLite enforces one logical run with a scoped `UNIQUE` constraint on
`(project_id, operation_kind, idempotency_key)`. Submission uses one
transactional insert-or-return-existing operation: it inserts one queued run,
or, on uniqueness conflict, returns the existing run without creating a second
run or attempt. If the existing key has a different input fingerprint, the
submission returns `conflict` rather than reusing it.

Worker claims use an atomic guarded update from a claimable status and record
the owner in the same transaction. Only the worker whose update succeeds may
execute the attempt. Concurrent duplicate submissions or worker claims
therefore cannot create or execute two runs for one scoped idempotency key.

Before every side-effecting provider or adapter request, the worker commits a
durable dispatch/outbox record containing the run, stage, attempt, destination,
operation, input fingerprint, and stable scoped idempotency key. Only a worker
that owns the attempt and its committed dispatch record may send the request.
When the external capability supports idempotency, the adapter must propagate
that stable key unchanged on every reconciliation or retry for the logical
request.

After a crash, timeout, or lost response leaves the result uncertain, the
worker must query or reconcile the provider or adapter's external state before
deciding whether another request is safe. The outbox records the reconciled
external identity and outcome before the attempt advances. If an adapter
supports neither idempotent requests nor authoritative reconciliation, an
uncertain dispatch becomes `blocked-awaiting-action` for manual recovery; the
system must not repeat an unprovable side effect.

Failures use these explicit retry classes:

- `retryable`: the recorded policy permits another bounded attempt.
- `blocked-awaiting-action`: work may resume only after the stated user or
  policy action.
- `cancelled`: no automatic retry; a new explicit command is required.
- `terminal`: the stage cannot retry without changed inputs, configuration, or
  implementation.

Attempt limits and retry policy are recorded before execution. Retries and
restarts revalidate input fingerprints, expected versions, lifecycle guards,
budgets, and idempotency before any side effect.

The retry class maps normatively to user-visible operation state:

| Durable retry classification or condition | User-visible operation state | Required next action |
| --- | --- | --- |
| `retryable` attempt failed and no successor is queued | `failed-retryable` | Retry within the recorded limit or change inputs |
| Linked retry attempt has been reserved but not claimed | `queued` | Wait or cancel the new attempt |
| `blocked-awaiting-action` | `blocked` | Complete the recorded user or policy action |
| `cancelled` | `cancelled` | Submit a new explicit command with a new attempt |
| `terminal` | `failed-terminal` | Change inputs, configuration, or implementation before a new command |
| Ownership expired and reconciliation is incomplete | `stale` | Reconcile before choosing another terminal or retry state |
| Expected content, lifecycle, or pointer version mismatched | `conflict` | Refresh current state and submit a new guarded command |

`partial` is allowed only while an owned operation has a verified durable
checkpoint and remaining work; it is not a retry classification. `failed`,
`error`, or `blocked` may not be used as lossy aliases for
`failed-retryable`, `failed-terminal`, `stale`, or `conflict`. Creating a
retry always reserves a new linked attempt and changes the visible state to
`queued`; it never rewrites the failed attempt.

### Cancellation and Recovery

Cancellation is a durable requested transition, not only an in-memory signal.
Workers checkpoint at safe boundaries, stop scheduling new side effects, and
record whether the active attempt reached `cancelled` or needs recovery.

Workers maintain durable progress and ownership timestamps. On startup and
during reconciliation, an expired ownership record marks an unfinished
operation `stale`. Recovery then resumes from a verified checkpoint, creates a
linked retry attempt, moves to a blocked or terminal outcome, or compensates an
idempotent side effect. Crash and stale-job recovery must not duplicate records
or corrupt canonical state.

### Resource Budgets

Each project declares budgets bounded by safe application ceilings for:

- Source count and per-source bytes
- Total project and temporary storage
- Transcript duration and extracted text
- Context and output tokens
- Per-run and per-project model cost
- Concurrent jobs and provider request rate
- Stage and request timeouts

The Creator Studio shows an estimate before expensive execution. Workers check
budgets before dispatch and at durable checkpoints. Reaching a limit pauses
cleanly as blocked work with the exceeded budget and available next action
recorded; it must not silently exceed a ceiling.

### User-Visible Operation States

Every long-running operation exposes the same state vocabulary:

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

Each state includes a clear next action. Interfaces must also define loading,
empty, offline, permission, stale-data, and recovery behavior. The
user-visible state is derived from the durable run and attempt records; it is
not a separate authority. Idempotency keys reject double submission, and
expected versions reject stale-tab actions.

## Implementation Acceptance Criteria

- Blueprint fixtures allow evidence-refined granular architecture revisions,
  but material reader, outcome, scope, thesis, or chapter-contract changes
  invalidate approval and block composition until a human approves the revised
  Blueprint.
- Two-tab and concurrent-worker tests prove lifecycle transitions and canonical
  mutations share the project writer lock through durable commit. Every stale
  transition or mutation fails as `conflict` without lifecycle or canonical
  change.
- Crash injection after root-pointer publication proves a lifecycle guarded
  commit mismatch restores ADR-008's verified prior snapshot before new work.
- Retry fixtures prove each durable classification and condition maps to the
  exact user-visible state and next action in the normative table.
- Retry, cancellation, and stale recovery fixtures preserve old attempts,
  reserve a new linked attempt when work is retried, and never infer success
  from an uncertain side effect.

## Consequences

- One transition history determines whether work, export, or publication is
  allowed.
- Human approval remains mandatory at the three accepted gates, while granular
  review can evolve without redefining the lifecycle.
- Restarts, retries, and cancellations remain inspectable and recoverable.
- Durable records and idempotency add storage, reconciliation, and test
  requirements.
- A consistent operation vocabulary gives every screen the same recovery
  semantics.

## Rejected Alternatives

### Module-Owned Status Fields

Rejected. Independent research, chapter, review, and release statuses can
contradict one another and permit a module to bypass lifecycle guards.

### In-Memory-Only Jobs

Rejected. Process memory cannot preserve attempt lineage, checkpoints,
idempotency, cancellation, or recovery after a crash.
