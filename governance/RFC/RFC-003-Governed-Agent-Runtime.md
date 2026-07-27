# RFC-003 — Governed Agent Runtime

## Status

Accepted for M4 implementation

## Summary

RTB Publishing will add a local, provider-neutral runtime for bounded AI assistance.
Agents consume canonical artifacts and emit schema-valid proposals into a run
package. They do not edit, commit, push, publish, browse, or execute commands.

## Motivation

M3 created a validated research workflow. AI can help review that graph, but an
unbounded assistant would introduce a second source of truth and could bypass
the deterministic checks already protecting publication.

## Proposal

Implement one enabled `research-reviewer` agent and reserve five contract-only
roles. Every run records its definition, input hashes, provider and model,
limits, proposal, verification results, token use, estimated cost, and status.

The runtime supports a deterministic fake provider for tests and examples. A
real OpenAI adapter is optional, uses the Responses API with strict structured
outputs, disables response storage, and receives no tools. Operators must
explicitly supply the model and current token prices; RTB Publishing does not embed
pricing assumptions that will become stale.

## Approval Protocol

1. `agent run` creates a proposal but cannot modify canonical content.
2. A human inspects the proposal and uses `agent review` to approve or reject.
3. Approval binds the exact proposal SHA-256 and every target file SHA-256.
4. `agent apply` rejects missing, rejected, modified, or stale approvals.
5. An approved edit is schema-validated and the full M3 graph is revalidated.
6. Failed validation restores original files.

## Safety Boundaries

- Declarative read and proposal allowlists are deny-by-default.
- Sensitive paths, repository escape, and symbolic-link traversal are denied.
- Shell, model network tools, Git, and publication are unavailable.
- Untrusted input is delimited and scanned for common prompt-injection markers.
- Time, file, token, output, and cost limits are explicit.
- Live provider calls are excluded from CI.

Provider API transport is not model network permission. Selecting a live
provider is an explicit operator action and grants only access to that provider
endpoint for that run.

## Data and Retention

Local run packages may contain canonical input content in transit to a
provider. Only hashes and metadata are retained in `request.json`; prompts are
not persisted. Unsanitized local runs remain ignored under
`.rtb-publishing/agent-runs/`. A deliberately sanitized example may be committed.

## Deferred Work

Autonomous browsing, multi-agent conversation, background execution, automatic
publication, a hosted control plane, and implementation of contract-only roles
are deferred. Each material expansion requires an RFC and threat-model update.

## Acceptance

M4 is accepted when the research reviewer runs through the fake provider in CI,
the optional real adapter has mocked contract tests, adversarial controls pass,
and no canonical change can occur without exact human approval.
