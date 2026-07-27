# RTB Publishing Agent Contracts

Agent definitions are declarative capability contracts. An enabled agent may
read only its allowlist and may return only a schema-valid proposal. It never
receives shell, Git, publishing, or network tools. Provider API transport is a
runtime concern and does not grant the model network tools.

`research-reviewer` is the only M4 implementation. The other role definitions
reserve stable contracts for later milestones; `contract-only` agents cannot
run.
