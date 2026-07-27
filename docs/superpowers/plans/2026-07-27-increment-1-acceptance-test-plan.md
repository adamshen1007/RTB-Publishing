# Increment 1 Acceptance Test Plan

**Status:** Approved for implementation
**Date:** 2026-07-27
**Applies to:** WP91-WP98
**Release under test:** YC Migration and Publishing Foundation

**Implementation authorization:** The user authorized execution on 2026-07-27.
This approval does not grant Blueprint, Beta, Publish, legal, accessibility,
Ghost-compatibility, or public-publication approval; all remain explicit human
evidence gates.

## Purpose

This plan defines the evidence required to accept Increment 1. Passing a test
does not grant a human approval, legal clearance, accessibility approval,
Ghost compatibility, or publication authorization. Human gates and manual
reviews remain explicit evidence records.

## Test Principles

- Test from one immutable canonical source snapshot.
- Run the same public commands locally and in CI.
- Prefer deterministic fixtures and machine-readable reports.
- Fail closed on missing, stale, extra, changed, corrupt, or unclassified data.
- Inject crashes, retries, concurrency, cancellation, and malformed inputs.
- Keep secrets, private Notion identifiers, real subscribers, and unpublished
  private content out of fixtures and logs.
- Preserve each failing artifact long enough to diagnose it, while keeping
  generated reports outside Git unless a sanitized summary is approved.
- Require a named human for Blueprint, Beta, Publish, visual, screen-reader,
  and Ghost capability decisions.

All tests listed in this plan are P1 release requirements unless an accepted
RFC amendment explicitly changes their priority or applicability.

## Evidence Locations

| Evidence | Location | Git policy |
| --- | --- | --- |
| Machine test reports | `build/acceptance/increment-1/<run-id>/` | Ignored generated output |
| Release candidates | `build/releases/<candidate-id>/` | Ignored until approved |
| Approved release bundle | `dist/releases/<release-id>/` | Generated, immutable by process, not committed |
| Migration review | `books/volume-01-yc-playbook/migrations/` | Commit sanitized report and human decision |
| Ghost spike | `spikes/ghost/` | Commit synthetic fixtures and sanitized evidence |
| Final acceptance summary | `docs/05-operations/increment-1-acceptance-report.md` | Commit human-readable decision |

Every machine report records the repository commit, dirty-state flag, platform,
tool versions, start and finish times, command, input hashes, configuration
hashes, result, and report-schema version. WP91 produces its sanitized baseline
with `pnpm baseline:increment-1`; it fails unless the Git worktree is clean and
it records successful `pnpm check`, `pnpm build`, and `pnpm verify:outputs`
results before writing `build/acceptance/increment-1/baseline/baseline.json`.

## Acceptance Environments

| Environment | Purpose | Requirement |
| --- | --- | --- |
| Clean local clone | Beginner and creator workflow | No undeclared private dependency |
| GitHub Actions | Reproducible integration gate | Same public commands and pinned profiles |
| Supported macOS filesystem | Mutation durability and local studio | File and directory durability proven |
| CI Linux filesystem | Portability and release generation | Equivalent durability or mutation disabled with explicit reason |
| Disposable Ghost environment | Capability spike only | Synthetic content and identities |

The PDF profile decision in WP92 must name any additional supported platforms
and record platform-specific limitations before PDF implementation begins.

## Requirement Traceability

| Governing clause | Requirement | Owner | Test IDs |
| --- | --- | --- | --- |
| RFC-006: Governance Prerequisites and Implementation Plan | Frozen boundary, reproducible baseline, and approval-ready traceability | WP91 | BAS-001-BAS-006 |
| RFC-006: Product Boundary and Canonical Delivery Sequence | Reusable Book Projects and Blueprints | WP94 | SCH-001-SCH-008 |
| ADR-008: Authority Matrix, Authorized Mutation Contract, and Mutation Recovery | Markdown/SQLite authority and recovery | WP95 | MUT-001-MUT-014 |
| RFC-007: YC Semantic Migration Oracle | Generic discovery and YC migration | WP96 | MIG-001-MIG-012 |
| ADR-009: One Guarded Lifecycle | Blueprint, Beta, and Publish gates | WP97 | LIF-001-LIF-014 |
| ADR-009: Durable Run and Attempt Contract | Durable jobs and operation states | WP97 | JOB-001-JOB-010 |
| RFC-007: Required Output Set, PDF Profile, and Validation and Test Contract | Verified HTML, PDF, and EPUB | WP92 and WP98 | PDF-001-PDF-010, PUB-001-PUB-016 |
| ADR-012: Immutable Release Identity and Manifest | Immutable Publish-bound manifest | WP98 | REL-001-REL-012 |
| ADR-012: Ghost Capability Spike and Sidecar and Object-Storage Fallback | Ghost capability spike | WP93 | GHO-001-GHO-008 |
| Research-to-Book Threat Model: all trust-boundary controls | Cross-cutting security | WP94-WP98 | SEC-001-SEC-012 |
| ADR-012: Disk-Backed Preparation and Streaming | Performance and disk-backed processing | WP98 | PER-001-PER-004 |

## WP91 Baseline Tests

| ID | Test | Expected Result |
| --- | --- | --- |
| BAS-001 | Run `pnpm check` from a clean clone | All current quality gates and tests pass |
| BAS-002 | Run `pnpm build` and `pnpm verify:outputs` | Existing HTML, EPUB, and legacy DOCX outputs pass before replacement |
| BAS-003 | Hash canonical YC inputs and source registry | Deterministic machine-readable baseline is written |
| BAS-004 | Capture normalized HTML and EPUB semantics | Oracle fixture is stable across two runs |
| BAS-005 | Inspect generated reports for secrets and local paths | No credential, token, private ID, or unsafe absolute path is present |
| BAS-006 | Run the complete suite repeatedly under configured concurrency | No test observes another test's temporary canonical-file mutation |

## WP92 PDF Decision Tests

| ID | Test | Expected Result |
| --- | --- | --- |
| PDF-001 | Validate RFC-008 structure and links | Accepted amendment names the profile, renderer, validators, fonts, and procedure |
| PDF-002 | Verify toolchain lock checksums | Every executable, container, font, and configuration resolves to pinned data |
| PDF-003 | Run compatibility fixture on every supported platform | Toolchain produces a parseable fixture or the platform is explicitly unsupported |
| PDF-004 | Validate tagged headings, lists, tables, figures, and alternative text | Machine validator reports zero blocking structure findings |
| PDF-005 | Inspect logical reading order and language | Machine checks and manual procedure agree |
| PDF-006 | Validate fonts and glyph coverage | Fonts are embedded or approved; no missing glyph is present |
| PDF-007 | Validate metadata, bookmarks, destinations, and links | Required fields and link targets are correct |
| PDF-008 | Run visual overflow and clipping fixtures | Blocking geometry errors fail validation |
| PDF-009 | Run the versioned screen-reader procedure | Named reviewer records pass, fail, or explicit blocking findings |
| PDF-010 | Search claims for unversioned accessibility language | No unsupported “accessible PDF” claim remains |

## WP93 Ghost Spike Tests

| ID | Test | Expected Result |
| --- | --- | --- |
| GHO-001 | Validate the results record against its schema | Every ADR-012 row has one classification and evidence reference |
| GHO-002 | Exercise authentication and minimum scopes | Spike works with least privilege or records a blocker |
| GHO-003 | Create and update synthetic publication content | Direct and unsupported fields are documented without private data |
| GHO-004 | Exercise retry and idempotency behavior | Repeated requests do not silently duplicate a release action |
| GHO-005 | Exercise rate, payload, and attachment limits | Limits and required fallbacks are recorded |
| GHO-006 | Exercise removal, retention, and rollback primitives | Direct support or fallback is proven for every required behavior |
| GHO-007 | Scan spike output and Git diff | No credential, real subscriber, private page ID, or secret is present |
| GHO-008 | Evaluate the stop condition | No required row is unknown; any `infeasible` row produces a blocked decision |

## WP94 Schema and Migration Tests

| ID | Test | Expected Result |
| --- | --- | --- |
| SCH-001 | Validate minimal one-chapter Book Project | Record passes without YC-specific defaults |
| SCH-002 | Validate the 23-chapter YC Book Project | Record passes and preserves stable IDs |
| SCH-003 | Validate two books with different parts, chapters, locales, and outputs | Discovery contracts remain data-driven |
| SCH-004 | Submit missing, extra, malformed, unsafe, and unknown-version fields | Validation fails with problem, cause, and repair guidance |
| SCH-005 | Submit traversal, absolute, escaped, and symlink paths | Every unsafe path fails before file access |
| SCH-006 | Run each forward migration twice | First run migrates; second run is byte-stable and reports unchanged |
| SCH-007 | Interrupt or fail a migration before apply | Canonical source remains unchanged and recovery is explicit |
| SCH-008 | Run existing commands through the compatibility adapter | Current YC workflow remains green until WP96 removal |

## WP95 Mutation and Recovery Tests

| ID | Test | Expected Result |
| --- | --- | --- |
| MUT-001 | Apply a valid single-file mutation | One new immutable snapshot and journal completion are recorded |
| MUT-002 | Apply a valid multi-file mutation while readers run | Each reader sees the complete old or complete new snapshot |
| MUT-003 | Submit a stale content hash | Conflict preserves current and proposed versions |
| MUT-004 | Submit a stale lifecycle version | Conflict occurs before canonical visibility changes |
| MUT-005 | Run two writers concurrently | One writer commits; the other waits or returns conflict |
| MUT-006 | Replay a command ID | No duplicate mutation or audit effect occurs |
| MUT-007 | Inject a crash before durable intent | Prior snapshot remains current; temporary data is safely collectable |
| MUT-008 | Inject a crash after durable intent | Recovery verifies preimages and safely resumes or abandons |
| MUT-009 | Inject a crash after snapshot preparation | Recovery verifies both roots and applies the recorded policy |
| MUT-010 | Inject a crash after pointer publication | Recovery restores prior visibility unless state commit is proven |
| MUT-011 | Inject a crash after state commit | Recovery verifies effects and completes or freezes the project |
| MUT-012 | Corrupt a preimage, snapshot, journal, or fencing token | Project freezes with incident evidence; no guessed recovery occurs |
| MUT-013 | Delete derived SQLite indexes and rebuild | Canonical Markdown is unchanged and indexes reproduce |
| MUT-014 | Trace file, directory, pointer, database, and WAL durability calls | Ordering matches ADR-008 on each enabled platform |

## WP96 Discovery and YC Migration Tests

| ID | Test | Expected Result |
| --- | --- | --- |
| MIG-001 | Discover fixture books recursively through declared manifests | Only valid declared projects are returned in deterministic order |
| MIG-002 | Discover empty, missing, duplicate, cyclic, and inaccessible projects | Actionable failures do not escape the workspace boundary |
| MIG-003 | Build books with 1, 23, and non-23 chapter counts | No fixed chapter or part count is required |
| MIG-004 | Compare YC metadata before and after migration | Required identity, version, status, language, and rights fields match or have approved differences |
| MIG-005 | Compare parts, chapters, headings, paragraphs, lists, and tables | Ordering and normalized semantic content are preserved |
| MIG-006 | Compare links, footnotes, citations, sources, and worksheets | All references remain resolvable and complete |
| MIG-007 | Compare callouts, diagrams, assets, and alternative text | Every meaningful visual and callout is preserved or explicitly classified |
| MIG-008 | Introduce a missing or reordered chapter | Oracle reports a blocking difference |
| MIG-009 | Introduce a normalization-only difference | Oracle reports normalized equivalence, not content loss |
| MIG-010 | Run migration and oracle twice | Reports and canonical output are deterministic |
| MIG-011 | Run generic Notion export for the YC project | Exactly 23 chapters and 23 worksheets remain traceable by path and hash |
| MIG-012 | Perform representative-page human visual review | Named reviewer classifies every finding and records the decision |

## WP97 Lifecycle and Job Tests

| ID | Test | Expected Result |
| --- | --- | --- |
| LIF-001 | Approve a valid Blueprint | Approval binds exact Blueprint and policy hashes |
| LIF-002 | Attempt work before Blueprint approval | Guard fails closed with a visible repair action |
| LIF-003 | Make a non-material Blueprint refinement | Approval remains valid and decision is append-only |
| LIF-004 | Change reader, outcome, scope, thesis, or chapter contract materially | Blueprint approval invalidates and dependent work blocks |
| LIF-005 | Approve a complete Beta | Approval binds exact beta snapshot and policy results |
| LIF-006 | Attempt Publish without Beta approval | Publish is unavailable and service rejects the command |
| LIF-007 | Attempt Publish with stale, rejected, or invalidated Beta approval | Publish fails closed without a manifest |
| LIF-008 | Approve Publish for an exact candidate | Approval binds candidate hash and current lifecycle version |
| LIF-009 | Change candidate content after approval | Final-manifest generation rejects the stale approval |
| LIF-010 | Submit a stale transition from a second tab | One transition wins; stale tab receives `conflict` |
| LIF-011 | Attempt an agent or connector approval | Contract rejects non-human gate actor |
| LIF-012 | Inspect transition history | History is append-only, ordered, versioned, and attributable |
| LIF-013 | Exercise keyboard-only gate review | Actions, guards, errors, and confirmation are reachable and understandable |
| LIF-014 | Traverse YC Blueprint, Beta, and Publish in order | One lifecycle records the complete mandatory sequence |

| ID | Test | Expected Result |
| --- | --- | --- |
| JOB-001 | Submit identical scoped idempotency keys concurrently | One logical run is created and returned |
| JOB-002 | Restart during a running stage | Stale attempt is recovered according to its retry class |
| JOB-003 | Cancel before external side effect | Attempt becomes cancelled and no side effect occurs |
| JOB-004 | Cancel after non-reversible boundary | Operation exposes the truthful partial state and required review |
| JOB-005 | Retry a retryable failure | New linked attempt preserves prior evidence |
| JOB-006 | Retry a terminal policy failure | Retry is rejected until inputs or policy change |
| JOB-007 | Lose heartbeat while owner is alive | Competing writer cannot seize the protected mutation interval |
| JOB-008 | Inspect local API and Creator Studio states | State is one of the accepted visible operation states |
| JOB-009 | Inspect diagnostics and logs | Secrets, manuscript content, and unsafe paths are absent or redacted |
| JOB-010 | Rebuild the read model from durable records | UI and CLI report the same lifecycle and run truth |

## WP98 Publishing and Release Tests

| ID | Test | Expected Result |
| --- | --- | --- |
| PUB-001 | Build HTML, PDF, and EPUB from one snapshot | All outputs record the same source fingerprint |
| PUB-002 | Fail one renderer intentionally | No partial release candidate is accepted |
| PUB-003 | Validate HTML semantics, assets, navigation, links, and sanitization | Zero blocking HTML findings |
| PUB-004 | Validate EPUB package, navigation, metadata, semantics, links, and assets | Zero blocking EPUB findings |
| PUB-005 | Run the complete pinned PDF validation profile | Zero blocking PDF findings and human procedure recorded |
| PUB-006 | Compare normalized headings, text, links, notes, tables, and figures across formats | All required semantic dimensions agree |
| PUB-007 | Build twice from identical inputs | Normalized outputs and manifest material fields reproduce |
| PUB-008 | Change a template, tool, font, policy, or configuration | Source/configuration fingerprint changes and stale result is rejected |
| PUB-009 | Corrupt or truncate each output | Verification fails before candidate creation |
| PUB-010 | Add an unexpected output file | Candidate and manifest verification reject extra material artifacts |
| PUB-011 | Verify output filenames and media types | Names are deterministic and profile-correct |
| PUB-012 | Run local and CI public commands | Commands and profiles are equivalent |
| PUB-013 | Build a non-YC fixture book | Pipeline contains no YC-only behavior |
| PUB-014 | Run rights and source checks | Expired, missing, or blocking rights records fail publication |
| PUB-015 | Run visual regression samples | Overflow, clipping, broken media, and layout regressions block release |
| PUB-016 | Inspect future-staging reference | Value is deterministic, unreserved, and explicitly non-authoritative |

| ID | Test | Expected Result |
| --- | --- | --- |
| REL-001 | Create a candidate envelope before Publish | Envelope is deterministic and contains every material hash |
| REL-002 | Omit or alter one material candidate field | Schema or verifier fails closed |
| REL-003 | Approve Publish for the exact candidate | Approval records candidate and lifecycle versions |
| REL-004 | Generate final manifest before approval | Operation is rejected |
| REL-005 | Generate final manifest after exact approval | One immutable manifest and release ID are created |
| REL-006 | Reuse approval for a changed candidate | Operation is rejected as stale |
| REL-007 | Reuse release ID after failure or deletion | Operation is rejected; a new release ID is required |
| REL-008 | Verify bundle checksums against manifest | Every artifact and validator report matches |
| REL-009 | Remove, add, rename, or change an artifact | Manifest verification fails |
| REL-010 | Reconstruct release from manifest and canonical snapshot | Equivalent verified artifacts are produced under reproducibility rules |
| REL-011 | Inspect audit chain from manifest to approvals and transitions | All references resolve and hashes agree |
| REL-012 | Inspect hosted-state claims | No activation, subscriber delivery, or production Ghost publication is claimed |

## Security Tests

| ID | Test | Expected Result |
| --- | --- | --- |
| SEC-001 | Submit traversal, absolute, encoded, and symlink paths | Request fails before read or write |
| SEC-002 | Submit wrong origin, missing CSRF, replayed token, or invalid capability | Local API rejects the mutation or gate action |
| SEC-003 | Submit oversized headers, bodies, fields, batches, and archives | Bounded failure occurs without resource exhaustion |
| SEC-004 | Submit HTML/script payloads through book content and metadata | HTML output is sanitized under the accepted profile |
| SEC-005 | Submit malformed images, fonts, EPUB resources, and PDFs | Validators fail safely without executing embedded content |
| SEC-006 | Attempt arbitrary command or renderer argument injection | Fixed allowlists reject the input |
| SEC-007 | Attempt direct browser file writes | No supported route bypasses the mutation service |
| SEC-008 | Scan logs, reports, diagnostics, and errors | Secrets and sensitive content are absent or redacted |
| SEC-009 | Attempt gate approval as agent, provider, Notion, or Ghost | Approval contract rejects the actor |
| SEC-010 | Attempt stale-hash and stale-version mutations | Canonical and lifecycle state remain unchanged |
| SEC-011 | Attempt Ghost spike with excessive scopes | Least-privilege test fails and blocks acceptance |
| SEC-012 | Run dependency and lockfile policy checks | Supply-chain policy passes with pinned production tools |

## Performance and Resource Tests

| ID | Test | Expected Result |
| --- | --- | --- |
| PER-001 | Process a fixture of at least 512 MiB | Complete release succeeds using disk-backed stages |
| PER-002 | Trace read, write, checksum, validation, and transfer chunk sizes | No chunk exceeds 8 MiB |
| PER-003 | Measure aggregate process-tree RSS above idle | Peak increase is no greater than 128 MiB using the recorded method |
| PER-004 | Cancel and recover the large run | Temporary data is bounded, recoverable, and safely collectable |

## Manual Review Protocols

| Review | Required Owner | Blocking Evidence |
| --- | --- | --- |
| Blueprint Gate | Creator | Exact Blueprint hash, policies, budgets, date, and explicit decision |
| YC visual migration review | Editor/creator | Compared pages, findings, classifications, resolutions, and decision |
| Beta Gate | Creator | Exact beta snapshot, policy results, open findings, and explicit decision |
| PDF screen-reader and visual review | Named reviewer | Procedure version, environment, pages, findings, and decision |
| Ghost spike decision | Creator/engineer | Capability matrix, fallbacks, blockers, and go/no-go decision |
| Publish Gate | Creator | Exact candidate hash, lifecycle version, current Beta approval, and explicit action |

No reviewer may mark an item complete solely because the automated suite is
green. A blocking finding remains blocking until its resolution is recorded
and the affected tests are rerun.

## Failure Injection Matrix

| Boundary | Injection | Required Rescue Behavior |
| --- | --- | --- |
| Schema migration | Unsupported or interrupted migration | Preserve source; show supported repair or rollback limit |
| Snapshot preparation | Process termination or disk-full | Prior root remains visible; incomplete data is recoverable |
| Root publication | Termination after pointer change | Restore verified prior root unless state commit is proven |
| SQLite commit | Busy, corrupt, or fencing mismatch | No guessed commit; restore or freeze with incident evidence |
| Renderer | Crash, timeout, malformed input, or missing tool | Fail entire release and retain bounded diagnostic evidence |
| Validator | Crash, timeout, or conflicting report | Treat format as unverified and block candidate creation |
| Lifecycle transition | Stale tab or concurrent command | One version wins; stale action returns conflict |
| Workflow stage | Restart, cancellation, or retry | Preserve run/stage/attempt lineage and truthful visible state |
| Publish | Candidate drift after approval | Reject manifest generation and require a new explicit Publish action |
| Ghost spike | Rate limit, auth loss, or unsupported feature | Record evidence and fallback/blocker; never claim production success |

## Required Public Commands

WP98 may refine names, but the final command surface must provide equivalents
for:

```sh
pnpm rtb-publishing book validate <book-project>
pnpm rtb-publishing book migrate <book-project> --check
pnpm rtb-publishing book build <book-project>
pnpm rtb-publishing book verify <book-project>
pnpm rtb-publishing lifecycle status <book-project>
pnpm rtb-publishing lifecycle approve <blueprint|beta|publish> <book-project>
pnpm rtb-publishing release verify <release-manifest>
```

Commands that can mutate canonical or lifecycle state require a dry run where
meaningful, an expected version/hash, explicit confirmation, and actionable
failure text.

## Acceptance Run Order

1. Verify a clean tree, commit identity, pinned tools, and baseline.
2. Run schema, migration, path, and security tests.
3. Run mutation, concurrency, crash, and recovery tests.
4. Run generic discovery and YC semantic migration tests.
5. Perform and record the YC visual review.
6. Run lifecycle, gate, job, retry, cancellation, and restart tests.
7. Run HTML, PDF, EPUB, parity, corruption, and all-or-nothing tests.
8. Perform and record the PDF manual procedure.
9. Run performance and disk-backed processing tests.
10. Complete the Ghost spike decision evidence.
11. Traverse the YC Blueprint and Beta gates.
12. Generate the exact release candidate and run all pre-Publish checks.
13. Require the creator's explicit Publish action.
14. Generate and verify the immutable final manifest.
15. Write the acceptance report and record go, conditional-go, or no-go.

## Acceptance Report Checklist

- [ ] Repository commit and clean-tree status recorded
- [ ] Local and CI environments recorded
- [ ] Tool, font, configuration, policy, and schema versions recorded
- [ ] Every acceptance test ID has pass, fail, blocked, or not-applicable state
- [ ] Every not-applicable state has an accepted reason
- [ ] Every manual review has a named human and evidence reference
- [ ] Every failure and waiver has owner, scope, expiry, and follow-up
- [ ] YC semantic migration report is complete
- [ ] Blueprint, Beta, and Publish approvals resolve to exact hashes
- [ ] HTML, PDF, and EPUB checksums match the manifest
- [ ] Large-fixture resource limits pass
- [ ] Ghost spike has no unknown required matrix rows
- [ ] No hosted activation or subscriber-delivery claim is present
- [ ] Final release decision is explicit

## Increment 1 Acceptance Rule

Increment 1 is accepted only when all P1 tests pass, every required human
review is complete, no blocking finding remains open, the immutable manifest
verifies, and the acceptance report records an explicit go decision. A
conditional-go may authorize corrective work but does not authorize Increment
2 to redefine or bypass an unmet Increment 1 contract.
