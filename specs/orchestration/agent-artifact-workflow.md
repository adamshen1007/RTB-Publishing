# Agent Artifact Workflow

## Rule

RTB Publishing roles coordinate only through canonical or run-package artifacts.
Free-form private agent-to-agent messages are not an accepted interface.

## Handoff Contract

```text
validated domain artifact
  -> run request with hashes
  -> schema-valid proposal
  -> deterministic verification
  -> human approval or rejection
  -> validated canonical change or no change
```

The research reviewer is implemented in M4. Authoring, editorial, diagram, QA,
and publisher contracts are present but cannot run. Activating a role requires
an accepted RFC that defines its input artifact, output schema, validators,
permissions, evaluation set, and approval point.

## Failure Semantics

- Provider or timeout failure: retain only already-written request evidence;
  make no canonical change.
- Invalid proposal: write verification evidence and stop.
- Rejection: close the run without a change.
- Stale approval: stop and require a fresh review.
- Domain-validation failure: restore every touched file and report failure.
