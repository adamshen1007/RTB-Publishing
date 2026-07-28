# Ghost Capability Matrix

## Scope and classification

This matrix closes the WP93 time box at the safe method boundary: no disposable
Ghost credential was in scope, so no live provider behavior was exercised. All
ten required ADR-012 rows are classified `fallback-required`. This permits
Increment 3 planning for the explicit fallback only; it does not claim that
Ghost satisfies a production adapter contract.

`Direct` would require live success plus the applicable live denial or failure
case. `Fallback-required` means the deterministic sidecar/object-storage
contract exercised the requirement locally, while Ghost itself is either not
documented for the exact primitive or is not live verified. `Infeasible` would
block the decision. No row is unknown.

| ADR-012 capability | GHO coverage | Classification | Provider evidence status | Selected fallback and live exit criterion |
| --- | --- | --- | --- | --- |
| Invitations and allowlist | GHO-002, GHO-003 | `fallback-required` | Ghost documents an invite-only setting; invitation completion and enumeration-safe denial are not live verified. | Sidecar allowlist plus opaque invitation flow. Live run must prove allowlisted success and indistinguishable denied/unknown responses. |
| Password-free access | GHO-002, GHO-004 | `fallback-required` | Ghost documents password-free email links; expiry, replay, session rotation, revocation, and outage behavior are not live verified. | Sidecar opaque sessions fail closed. Live run must exercise each of those failure cases. |
| Protected HTML | GHO-002, GHO-003 | `fallback-required` | Ghost documents server-level member/tier post protection; authenticated cache isolation is not live verified. | Sidecar authorization gateway emits member-and-release-scoped private cache keys. Live run must prove denial and cache separation. |
| Binary downloads | GHO-003, GHO-004, GHO-006 | `fallback-required` | The documented Admin API does not prove short-lived, audience-bound release-binary grants. | Private storage and sidecar single-use grant. Live run must deny revoked, expired, replayed, and copied grants. |
| Search | GHO-003 | `fallback-required` | The documented Content API is read-only and public-facing; it does not prove subscriber-isolated search. | Sidecar index filters before search. Live run must prove that another subscriber receives no private metadata. |
| Staging | GHO-003, GHO-004, GHO-005 | `fallback-required` | Ghost documents content mutation, not immutable release-ID/checksum staging and reconciliation. | Private immutable release prefix plus manifest verification. Live run must prove inactive staging, duplicate handling, partial failure, and a remote read-back. |
| Activation | GHO-004, GHO-006 | `fallback-required` | No documented Ghost primitive proves guarded release-ID plus monotonic-revision compare-and-set. | Sidecar release-state store is authoritative. Live run must prove stale-pair conflict and no unintended mutation. |
| Rollback and unpublish | GHO-004, GHO-006 | `fallback-required` | Ghost content mutation does not prove retained rollback, release-scoped revocation, or guarded unpublish. | Sidecar pointer and grant store perform guarded operations. Live run must cover A-to-B-to-A stale commands and access revocation scope. |
| API limits and failures | GHO-004, GHO-005 | `fallback-required` | No current observed Ghost rate, payload, attachment, timeout, or retry behavior exists in this spike. | Sidecar enforces limits, idempotency, outbox, and `blocked-awaiting-reconciliation` after uncertainty. Live run must record actual limits and failure responses. |
| Webhooks and reconciliation | GHO-004, GHO-006 | `fallback-required` | Ghost documents webhook mutation but not live authentication, ordering, retry, or deduplication evidence here. | Webhooks remain advisory; sidecar deduplicates events and authoritative state reads detect drift. Live run must verify event authenticity or retain polling-only reconciliation. |

## Locally exercised behavior

The deterministic harness proves the chosen fallback's behavior with only
synthetic data:

- Generic allowlist responses prevent address enumeration.
- Opaque links expire, deny replay, rotate sessions, permit revocation, and
  fail closed if the identity service is unavailable.
- HTML authorization and search filter by the current session. Binary grants
  expire, bind to one audience and release, and are single-use.
- Staging is inactive, release IDs cannot be replaced, duplicate idempotency
  keys reconcile, oversized and partial uploads fail, and uncertain timeouts
  become blocked work.
- The active pointer only changes through exact compare-and-set, increments its
  revision, preserves stale-pair conflicts after A-to-B-to-A, supports guarded
  unpublish, and protects retained releases from early deletion or legal-hold
  deletion.
- Advisory events deduplicate while a separate state read remains the
  reconciliation authority.

See [the result record](results.sanitized.json) for row-level evidence IDs and
[the harness](../../scripts/ghost-capability-spike.mjs) for executable cases.

## Limits and required next proof

The recorded `1 MiB` payload ceiling and two-request window are synthetic test
limits. They are not Ghost limits. Ghost version, plan, API behavior, scopes,
rate limits, payload limits, attachment behavior, provider deletion, and
webhook delivery behavior all remain unverified live-provider behavior.

Before a production decision, an authorized isolated run must add a new result
record with exact Ghost version, plan, configured API version, scoped
credential type, sanitized response status/classes, and both success and
denial/failure evidence. The implementation must remain blocked if any
required capability is then `infeasible`.
