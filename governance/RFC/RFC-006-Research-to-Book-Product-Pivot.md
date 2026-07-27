# RFC-006 — Research-to-Book Product Pivot

## Status

Accepted for Increment 1 planning

## Summary

RTB Publishing changes from a general founder workspace into a local-first
research-to-book Creator Studio with a private subscriber library. Markdown and
Git remain authoritative for authored publication content. The Creator Studio
coordinates research, composition, review, and release work locally; only
approved release artifacts and the minimum allowlisted subscriber data cross
the bounded publishing boundary.

Delivery must follow three independently releasable increments after M5A.3:
YC migration and publishing foundation, short-book evidence-to-beta, and
subscriber delivery. This RFC accepts that product boundary and sequence. It
does not accept teams, billing, general cloud workspaces, or autonomous final
publication.

## Motivation

RTB Publishing already has validated Markdown publishing, research automation,
governed agents, a local founder workspace, and a private Notion editorial
surface. The reviewed research-to-book design combines those capabilities into
one reusable product rather than extending the paused general hosted workspace.

The existing YC Playbook supplies a concrete migration oracle, but RTB Publishing
must not hard-code one topic, volume, or chapter count. A second short pilot is
needed to test whether the system can carry a different bounded topic from
evidence to an accepted beta. A staged delivery program keeps the first
increment independently useful while preserving explicit human decisions at
the highest-risk transitions.

## Proposal

### Product Boundary

RTB Publishing must provide a private, local-first Creator Studio for reusable Book
Projects and a private hosted subscriber library for approved editions.
Canonical manuscripts, research records, drafts, rejected proposals,
credentials, and Editorial Memory stay local. Hosted services must receive
only the minimum data permitted by an explicit adapter and egress policy.

Ghost is the first hosted-library adapter, subject to an early, time-boxed
capability spike. The adapter must be bounded and allowlisted. A documented
fallback behind the same adapter contract may supply a capability that Ghost
cannot safely provide.

The release contract must produce HTML, PDF, and EPUB from canonical Markdown.
PDF replaces DOCX for this product direction. Generated release artifacts are
derived and must not become a competing source of truth.

### Canonical Delivery Sequence

The following increments are the canonical sequence after M5A.3:

1. **Increment 1 — YC Migration and Publishing Foundation.** Introduce
   versioned Book Projects and Blueprints, generalize project and chapter
   discovery, establish safe local mutations and operational state, replace
   DOCX with verified PDF, produce HTML, PDF, and EPUB locally, migrate the YC
   Playbook through a semantic comparison, complete the Ghost capability
   spike, implement the minimum guarded Blueprint, Beta, and Publish approvals,
   move the YC migration through them in that order, and create the
   Publish-bound immutable final manifest.
2. **Increment 2 — Short-Book Evidence-to-Beta.** Add the Tier 1 Evidence
   Gateway, research planning, evidence and claim relationships, composition,
   visual enrichment, provider contracts, governed Editorial Memory, Notion
   proposal reconciliation, deeper and more automated beta-quality evaluation
   through the existing Beta Gate, and a complete short second pilot through
   accepted canonical proposals. This increment does not introduce a lifecycle
   gate.
3. **Increment 3 — Subscriber Delivery.** Consume an approved immutable
   Increment 1 release through the Ghost adapter and proven fallbacks, add
   allowlisted subscriber access, protected HTML, PDF, and EPUB, activation and
   rollback controls, and the final end-to-end pilot scorecard. Hosted staging
   and activation verify the existing approval; they do not add another
   Publish gate.

Each increment must have its own implementation plan, test artifact, acceptance
report, and release decision. A later increment must not redefine an earlier
contract without a migration and a recorded architectural decision.

### Approval Gates and Evaluation

The product has exactly three lifecycle approval gates:

1. **Blueprint Gate:** a human approves the brief, research plan, source policy,
   initial architecture hypothesis, budgets, and provider-egress policy before
   research or other expensive work. A later material reader, scope, thesis, or
   chapter-contract change invalidates approval and requires a human to approve
   the revised Blueprint before composition.
2. **Beta Gate:** a human approves a complete beta before export to Notion.
3. **Publish Gate:** a human explicitly approves publication after all blocking
   proposals and quality policies pass. In Increment 1 this decision binds the
   exact local candidate and authorizes its immutable final manifest.
   Increment 3 consumes that release for hosted staging and activation without
   recording a second Publish approval.

Source, claim, chapter, and visual decisions are review decisions inside the
lifecycle, not additional gates. No agent, provider, connector, or adapter may
bypass a gate, and final publication always requires the human Publish action.
Increment 1 must implement the minimum guarded state, durable approval records,
and human action for Blueprint, Beta, and Publish in that order. The Publish
action fails closed unless the same lifecycle has a current Beta approval.
Increment 2 may deepen or automate beta preparation and evaluation, but it
reuses the existing Beta Gate and cannot introduce or defer it.

Thresholds must be declared before the YC migration and the short second pilot.
The scorecard must cover evidence quality, unsupported claims and publication
defects, proposal acceptance and edit distance, editorial quality,
time-to-beta, creator intervention, cost, and Editorial Memory performance.
Failure to meet a stop/go threshold blocks the affected promotion or release
decision and must inform the next stage plan.

### Governance Prerequisites

Before Increment 1 code begins, the repository must accept:

- ADR-008 for Markdown and SQLite authority and authorized local mutations
- ADR-009 for lifecycle approvals and durable workflows
- ADR-010 for provider capabilities and classified egress
- ADR-011 for Notion proposal reconciliation
- ADR-012 for immutable releases and the Ghost adapter
- RFC-007 for the HTML, PDF, and EPUB publishing contract

The ingestion, connector, local-mutation, and hosted-delivery threat model must
also be updated before implementation. These records supply the detailed
contracts; this pivot RFC does not replace them.

### Superseded and Preserved Decisions

- RFC-004's pause on hosted expansion is superseded only for the bounded,
  allowlisted publishing adapter accepted here. Teams, billing, remote
  projects, general cloud workspace features, and other M5B capabilities remain
  deferred.
- RFC-005's one-way Notion rule remains active until ADR-011 is accepted and
  its implementation acceptance criteria pass. Until then, Notion suggestions
  continue through the existing manual reconciliation path.
- ADR-001's DOCX output is replaced by PDF for the new release contract. Its
  Markdown authority and repeatable local quality-gate direction remain active.
- ADR-005's prohibition on direct browser writes remains active, but its
  absolute read-only UI boundary is narrowed by ADR-008: approved Creator
  Studio actions may invoke an authorized local mutation service.
- ADR-007 remains authoritative for the rule that Markdown is canonical. Its
  manual-only return path is superseded only after ADR-011's proposal import and
  implementation acceptance criteria pass; imported Notion changes remain
  proposals and never become direct canonical writes.
- RFC-007 narrows this RFC's original increment allocation by moving the single
  Publish Gate and Publish-bound local final-manifest generation into Increment
  1. Increment 3 retains remote staging, hosted verification, activation,
  rollback, unpublish, and retention for that already approved immutable
  release.

All superseded records remain part of the decision history.

## Alternatives Considered

### Continue with a General Hosted Founder Workspace

Rejected. The M5A pilot has not authorized teams, billing, remote projects, or
general cloud workspace features. A narrow publishing adapter has a defined
data boundary and can be evaluated without reopening the entire M5B scope.

### Publish the Existing YC Playbook Without a Reusable Product Model

Rejected. It would preserve fixed-volume and fixed-chapter assumptions and
would not test a second topic from research through beta.

### Deliver the Complete Research-to-Subscriber System in One Increment

Rejected. It would couple local migration, evidence ingestion, Notion
reconciliation, and hosted subscriber delivery into one release decision.
Three increments provide smaller acceptance surfaces and preserve stop/go
evidence.

### Make Notion or Ghost Canonical

Rejected. Either choice would weaken local portability, reproducibility, and
the existing Markdown decision. Both remain replaceable boundary systems.

## Risks

- The Ghost spike may show that protected reading, downloads, activation, or
  rollback need a sidecar or object-storage fallback.
- The YC migration may preserve visible output while missing semantic
  differences; machine-readable comparison and human visual review are both
  required.
- A short pilot may not represent long-form production behavior; its
  predeclared scorecard must bound the claims that can be made.
- Local Markdown and transactional state can diverge if mutation recovery is
  underspecified; ADR-008 must define journaled, recoverable writes.
- Proposal import could be mistaken for two canonical authorities; ADR-011 must
  preserve proposal-only Notion semantics and explicit conflict handling.
- External providers and hosted subscriber systems introduce classified egress
  and privacy risk; the threat model and adapter allowlists must fail closed.

## Acceptance Criteria

This RFC is accepted when:

- The local Creator Studio and private subscriber-library boundary is explicit.
- The three increments are recorded as the canonical sequence after M5A.3.
- Blueprint, Beta, and Publish are the only lifecycle approval gates.
- The single Publish Gate and Publish-bound local final manifest occur in
  Increment 1; Increment 3 consumes the approved immutable release without
  another gate.
- The minimum Blueprint, Beta, and Publish gates all exist in Increment 1 and
  the YC migration traverses them in order; Increment 2 only deepens the
  existing Beta path.
- Ghost-first delivery, HTML/PDF/EPUB output, YC migration, the short pilot, and
  predeclared scorecard evaluation are normative requirements.
- ADR-008 through ADR-012 and RFC-007 are required before Increment 1 code.
- RFC-004, RFC-005, ADR-001, ADR-005, and ADR-007 are explicitly preserved or
  narrowly superseded without erasing their decision history.
- The root roadmap reflects this priority and keeps old M5B work deferred
  except for the bounded Ghost publishing adapter.

## Implementation Plan

1. Accept ADR-008 through ADR-012, RFC-007, and the expanded threat model.
2. Plan and deliver Increment 1 with the YC semantic migration oracle, local
   HTML/PDF/EPUB validation, Ghost capability-spike evidence, the single Publish
   Gate, its prerequisite minimum Blueprint and Beta approvals, and
   Publish-bound immutable final manifests.
3. Make a release decision for Increment 1 before planning the complete
   Increment 2 implementation.
4. Deepen the existing beta-quality workflow and run the short second pilot
   through the already implemented Blueprint and Beta gates against its
   predeclared scorecard.
5. Implement Increment 3 subscriber delivery from the approved immutable
   release, without a second Publish gate, and record the final end-to-end pilot
   scorecard and release decision.
