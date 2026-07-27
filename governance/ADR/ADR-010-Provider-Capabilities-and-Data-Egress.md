# ADR-010 — Provider Capabilities and Data Egress

## Status

Accepted

## Context

The research-to-book workflow uses external processing for several different
tasks. A generic text-generation interface would hide differences in input
classification, output verification, rights, cost, and provider behavior. It
could also allow an adapter to change models or send more project data than the
creator approved.

RFC-006 keeps canonical manuscripts, research records, drafts, rejected
proposals, credentials, and Editorial Memory local. ADR-004 requires model
output to remain proposal-only. This decision defines the capability and egress
contracts that enforce those boundaries.

## Decision

### Capability Contracts

Every provider operation implements one versioned, task-specific capability
contract. The contract defines its input schema, output schema, allowed tools
and destinations, verification rules, limits, and failure behavior.

The initial contracts are:

| Capability | Minimized input | Required output and verification |
| --- | --- | --- |
| Research synthesis | Approved evidence, claim IDs, locators, and task instructions | Structured synthesis linked to supplied evidence; schema, citation, and claim-support checks |
| Structured drafting | Approved outline, chapter contract, evidence, style rules, and scoped memory rules | Structured claims, outline, or evidence-grounded draft with evidence IDs; schema, required-element, and unsupported-claim checks |
| Embeddings | Approved, bounded text chunks and stable local record IDs | Vectors with dimensions and source-chunk hashes; shape, count, and input-binding checks |
| Image generation | Approved prompt, permitted reference assets, visual brief, and disclosure requirements | Media plus generation and rights metadata; file-type, size, safety, provenance, and accessibility checks |
| Transcription | Lawfully processable media or bounded audio segments and language hints | Timestamped transcript segments and confidence metadata; duration, alignment, file, and schema checks |
| Tool use | A task plan and the minimum arguments for an explicit tool allowlist | Structured tool results and per-call evidence; argument, destination, result, side-effect, and budget checks |

Research synthesis and structured drafting receive evidence selected for the
task, not unrestricted project directories. Embedding records use local IDs so
provider output cannot become an authority for manuscript or evidence content.
Image and transcription contracts must carry the applicable rights decision.
Tool use is denied by default and cannot include arbitrary shell, Git,
filesystem, network, approval, or publication access. Each permitted tool and
destination requires a contract amendment, threat review, and adversarial
tests.

Provider output is untrusted. It cannot approve a lifecycle gate, apply a
proposal, change canonical content, publish, or expand its own capabilities.
Schema and policy validation must succeed before output can enter a proposal or
derived-artifact workflow.

### Provider Implementations

OpenAI is the first live provider implementation. Its adapter has no special
authority: it must implement the same versioned capability contracts,
classification, consent, budget, evidence, and failure rules required of every
provider. It may expose only the capabilities and contract versions that it can
prove it supports. Selecting OpenAI does not make its models, responses, terms,
or capability names canonical and does not prevent a later compatible adapter.

The fake provider remains the deterministic baseline for tests and continuous
integration. It implements controlled fixtures behind the same contracts but
is not represented as live processing. Neither the OpenAI adapter nor the fake
provider may silently substitute for the other or select an unapproved model,
region, prompt, or capability version.

### AI and Media Provider-Processing Classification

Every field considered for an AI, embedding, image, transcription, or other
media-processing provider receives one of these classifications before
dispatch:

- `public`: already approved for public disclosure.
- `internal`: non-public project material that is permitted for the named
  processing purpose under the approved project egress policy.
- `sensitive`: private material requiring explicit, informed creator consent
  for the exact provider, purpose, and dispatch.
- `prohibited`: secrets, credentials, subscriber email, identity,
  authentication, session, access, or reading data, or material whose rights or
  policy prohibit this external processing.

Unclassified input fails closed. Prohibited data never crosses an AI or media
provider-processing boundary. Subscriber personal data is outside these
provider capabilities and cannot be included in model, embedding, image,
transcription, synthesis, drafting, or tool-use requests.

Before a request is dispatched, the runtime must:

1. Resolve the capability contract and provider adapter versions.
2. Classify every input field and reject prohibited or unclassified data.
3. Select only fields required by the contract and apply declared redaction,
   chunking, and minimization rules.
4. Verify rights, lifecycle guards, provider-egress policy, destination, region,
   retention, training, deletion, and consent requirements.
5. Show and enforce token, cost, request-rate, time, and output-size budgets.
6. Commit the durable dispatch record required by ADR-009.

Consent binds the project, input fingerprint, classifications, purpose,
provider, model, region, capability version, and retention and training terms.
A material change invalidates consent. Sensitive input requires explicit
consent for each dispatch or for a narrowly bounded batch whose membership and
expiry are recorded. General acceptance of terms is not sensitive-data
consent.

### Hosted Identity Adapter Data

The configured hosted identity adapter is a distinct operational boundary, not
an AI or media provider capability. It may receive only the minimum fields
needed for allowlisted subscriber access, such as normalized email, invitation
status, provider subject ID, authentication state, session or revocation
identifiers, and release-specific access decisions. Reading history, analytics,
profile enrichment, manuscript text, research, prompts, and provider inputs are
denied unless a later governance decision separately names and justifies them.

Before any hosted identity field is transmitted, the adapter contract must
record its exact schema, destination, purpose, consent or other documented
legal basis, collection notice, retention period, deletion and revocation
procedure, backup handling, regional constraints, and minimization rationale.
The adapter must reject extra and unclassified fields. A change to purpose,
legal basis, field set, destination, or retention requires renewed review and,
where the recorded basis requires it, renewed consent before dispatch.

Hosted identity records follow their declared per-store retention and deletion
schedule. RTB Publishing records deletion requests, observed outcomes, and
exceptions without claiming physical erasure that the adapter cannot prove.
This narrow allowance does not permit subscriber data to enter AI or media
provider calls.

The runtime records policy and consent evidence without copying prohibited
values or unnecessary prompt content into logs. Provider policies are recorded
as observed metadata, not assumed guarantees.

### Run Evidence and Budgets

Every attempt records:

- Provider, adapter, model, prompt, and capability-contract versions
- Input classifications, minimized-field manifest, consent reference, and
  approved destination and purpose
- Region plus declared retention, training, and deletion metadata
- Input fingerprint and request hash without secret values
- Parameters, context and output token counts, media duration where applicable,
  cost estimate, reported cost, and budget result
- Provider request identity, timestamps, retry lineage, and reconciliation
  outcome
- Raw-response hash, normalized-output hash, validation result, and final
  proposal or artifact ID

Raw provider payload retention follows the project's data policy and the
shortest applicable retention period. A hash and sanitized operational record
may outlive a deleted payload when needed for audit. Logs and user-visible
errors must redact prompts, source text, credentials, signed links, subscriber
data, and provider secrets.

The project declares cost and token budgets at the Blueprint Gate, bounded by
application ceilings. The runtime checks them before dispatch and at durable
checkpoints. A reached or uncertain budget produces visible blocked work; the
runtime does not exceed a ceiling or hide already incurred cost.

### Capability Negotiation and Fallback

An adapter must prove support for the exact contract version and required
features before dispatch. Missing structured output, region, retention,
training, deletion, idempotency, reconciliation, or tool restrictions is a
capability failure, not permission to degrade behavior.

RTB Publishing never silently changes a provider, model, region, prompt, capability
version, or capability level. A fallback is allowed only when the project
policy names it in advance or the creator approves a new dispatch after seeing
the changed destination, terms, capability, cost, and expected quality. The
fallback receives a new attempt and dispatch record and repeats classification,
consent, rights, budget, and lifecycle checks. Fake providers remain the
deterministic test baseline and are never represented as a live fallback.

Timeouts and uncertain billed requests follow ADR-009's reconciliation and
idempotency rules. If the provider cannot establish whether an uncertain
request ran, the operation becomes `blocked-awaiting-action`; it is not
automatically repeated.

## Consequences

- Provider replacement remains possible without reducing task-specific safety
  or evidence.
- Creators can see exactly what leaves the local environment, why, and under
  which provider terms.
- Proposal-only authority and deterministic validators remain intact after
  external processing.
- New providers and capabilities require explicit contract, policy, fixture,
  and adversarial-test work.
- Strong consent, minimization, and run evidence add setup and operational
  overhead.

## Rejected Alternatives

### One Generic Generation Interface

Rejected. It would conceal task-specific rights, verification, tool, media,
budget, and retention requirements.

### Provider-Selected Fallback

Rejected. Silent provider or model substitution can change egress, rights,
cost, quality, and retention without creator consent.

### Store Complete Prompts for Convenience

Rejected. Full prompts can duplicate private research, sensitive prose, or
secrets in long-lived operational records. Fingerprints, minimized manifests,
and policy-bound retention provide audit evidence with less exposure.
