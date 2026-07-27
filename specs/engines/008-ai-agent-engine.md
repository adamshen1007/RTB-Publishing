# AI Agents Engine Specification

## Purpose

The AI Agents Engine provides bounded, observable assistance over validated
RTB Publishing artifacts without becoming a source of truth.

## Responsibilities

- Load versioned role definitions and enforce their permissions and limits.
- Invoke provider adapters without exposing tools to the model.
- Verify structured proposals and record observable run artifacts.
- Require exact human approval before a narrow change can be applied.

## Inputs

- Canonical research artifacts and their SHA-256 hashes
- Agent definition, prompt, run options, and provider configuration

## Outputs

- Proposal, verification, approval, and summary artifacts

## Primary Objects

- Agent definition
- Run request
- Proposal
- Verification
- Approval
- Run summary

## Events

- Receives a human-invoked run request over an existing artifact.
- Emits a proposal for human review; it does not emit hidden messages.

## Dependencies

- M3 Research Engine validators
- Governance policies and agent schemas
- Provider adapter selected explicitly by the operator

## Quality Gates

- Schema-valid and allowlisted output
- Token, time, file, and cost budgets satisfied
- Exact human approval before application
- Existing domain validation after application

## Acceptance Criteria

- The model cannot access shell, Git, browsing, publishing, or secrets.
- Deterministic fake execution passes in CI without provider credentials.
- A stale or rejected approval cannot modify canonical content.
