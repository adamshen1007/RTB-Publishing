# ADR-004 — Proposal-only Agent Architecture

## Status

Accepted

## Context

RTB Publishing needs useful AI assistance without allowing probabilistic output to
replace Markdown, YAML, governance records, or deterministic validators as the
source of truth.

## Decision

Agents are declarative, proposal-only roles. They exchange versioned artifacts,
not private messages. The runtime owns provider transport, enforcement, and run
records. A separate human approval artifact binds exact hashes before a narrow
apply operation can edit canonical files.

The first implementation reviews M3 research. The fake provider is the
reproducible baseline; real providers are adapters behind the same proposal
schema.

## Consequences

- Agent output remains inspectable, portable, and testable without a model key.
- Human intent is explicit and stale approvals fail closed.
- Canonical validators remain authoritative after an applied proposal.
- Agents cannot perform broad refactors or arbitrary patches.
- More capable roles require new schemas or RFCs instead of hidden prompt
  changes.

## Alternatives Considered

- Direct model writes were rejected because they bypass review and provenance.
- Free-form chat handoffs were rejected because they are difficult to validate.
- A provider-specific runtime was rejected because governance should not depend
  on one vendor.
- Live-provider CI was rejected because it is nondeterministic and requires a
  secret and variable spend.
