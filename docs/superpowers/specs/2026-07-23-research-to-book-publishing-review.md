# Research-to-Book Specification Review

**Reviewed:** 2026-07-23
**Specification:** `2026-07-23-research-to-book-publishing-design.md`
**Mode:** Full review with scope restructuring
**Result:** Clear for implementation planning

## Scope Result

The complete Stages A-G vision remains approved. Delivery is restructured into
three independently releasable increments:

1. YC migration and publishing foundation
2. Short-book evidence-to-beta
3. Subscriber delivery

This preserves the product vision without making the first usable release
depend on every later integration.

## Decisions Applied

- Ghost-first hosted-library adapter with an early capability spike
- Markdown/Git authority for authored content and SQLite for operations
- HTML, PDF, and EPUB release formats; DOCX removed
- Proposal-only Notion import with normalized-AST three-way merge
- Formal pivot RFC, focused ADRs, publishing RFC, and threat model
- Evidence Gateway with classified provider egress and an operational rights
  ledger
- Governed layered Editorial Memory
- Blueprint, Beta, and Publish lifecycle gates
- Immutable release bundles with one activation pointer
- Versioned record schemas and migration policy
- Durable, idempotent workflow jobs
- Task-specific provider capability contracts
- One lifecycle state machine and one quality-policy registry
- Journaled Markdown/SQLite mutations
- Versioned AI evaluations, integration tiers, crash E2E, and a YC migration
  oracle
- Resource budgets, content-addressed dependencies, FTS5, and disk-backed
  release processing

## Coverage Map

```text
CODE AND INTEGRATION PATHS                         USER AND QUALITY FLOWS
[EXISTING] Research graph validation               [PLAN -> E2E] Blueprint approval
[EXISTING] Governed proposal approval              [PLAN -> E2E] Evidence to Notion beta
[EXISTING] Basic job persistence/recovery          [PLAN -> E2E] Notion proposal merge
[EXISTING] File/path and prompt checks             [PLAN -> E2E] Publish and activate
[PARTIAL]  OpenAI structured-output adapter        [PLAN -> E2E] Cancel and restart
[PLAN] Versioned record migrations                 [PLAN -> E2E] Stale and duplicate actions
[PLAN] Idempotency and retry classes               [PLAN -> EVAL] Evidence faithfulness
[PLAN] Evidence Gateway threat controls            [PLAN -> EVAL] Chapter usefulness
[PLAN] Provider capability negotiation             [PLAN -> EVAL] Memory adherence
[PLAN] Three-way Notion reconciliation             [PLAN -> EVAL] Visual purpose
[PLAN] PDF generation and validation               [PLAN] YC semantic migration
[PLAN] Ghost staging and rollback                  [PLAN] Pilot stop/go scorecards
```

## Production Failure Modes

| Flow | Realistic failure | Test | Error handling | Creator experience |
| --- | --- | --- | --- | --- |
| Source ingestion | Redirect reaches a private address | SSRF contract test | Reject before download | Blocked with source reason |
| PDF or media ingestion | Oversized or malformed file | Limit and sandbox tests | Quarantine and preserve metadata | Retry with manual fallback |
| Provider call | Timeout after billed request | Idempotency and replay test | Reconcile by run ID; bounded retry | Cost and recovery shown |
| Mutation | Crash after Markdown replace | Crash-injection test | Journal completes or repairs SQLite | Recovery banner and audit |
| Lifecycle approval | Stale tab approves old beta | Concurrency E2E | Expected-version rejection | Refresh-and-review action |
| Notion import | Local and Notion edit same block | Three-way merge fixture | Preserve base and both variants | Explicit conflict proposal |
| Rights | Permission expires before publish | Policy and clock test | Invalidate dependent artifacts | Rights blocker and rebuild |
| Rendering | PDF succeeds but EPUB fails | Multi-format E2E | Release remains staged | Format-specific remediation |
| Upload | Network stops mid-artifact | Staging adapter test | Idempotent resume or replacement | Retry without republishing |
| Activation | Pointer update fails | Rollback E2E | Previous release remains active | Safe failure with retry |
| Authentication | Invite or session expires | Ghost staging E2E | Deny without exposing files | Sign-in or owner action |
| Memory | One-off edit becomes a global rule | Promotion evaluation | Insufficient evidence blocks rule | Memory proposal remains reviewable |

No reviewed production path remains both silently failing and without a planned
test or recovery action.

## Review Counts

- Scope challenge: complete vision retained; delivery scope restructured
- Architecture review: 4 issues found and resolved
- Code-quality review: 4 issues found and resolved
- Test review: 4 issues found and resolved; coverage map produced
- Performance review: 4 issues found and resolved
- Outside voice: 15 findings reviewed and resolved
- Deferred TODO proposals: 0; all accepted work is represented in the
  specification's implementation tasks
- Critical unhandled gaps: 0 after the approved corrections
- Parallelization: 6 lanes, 4 conditionally parallel after core contracts
- Completeness score: 16/16 engineering findings chose the complete option

## Remaining Review Chain

A design review is recommended before Creator Studio UI implementation. A
developer-experience review is useful after Increment 1 establishes the new
project and publishing commands.
