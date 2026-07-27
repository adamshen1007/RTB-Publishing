# ADR-006 — Local External Project Overlay

## Status

Accepted

## Context

The internal pilot needs to inspect real projects that are not nested inside
RTB Publishing. Adding machine-specific absolute paths to the committed workspace
would leak local details and make clones non-portable. Automatically trusting
external project scripts would expand the execution boundary without evidence.

## Decision

Keep the committed workspace repository-contained. Store external root
permissions and project pointers in a Git-ignored local overlay. Require an
absolute path, candidate inspection, explicit root confirmation, and import as
separate observable steps. Index imported repositories as read-only and assign
no executable workflows.

Back up and restore only the local overlay. Never copy or replace canonical
project content through the backup workflow.

## Consequences

- A founder can inspect real local repositories without moving or copying them.
- Machine-specific paths and permissions do not enter version control.
- External projects cannot execute arbitrary package scripts through RTB Publishing.
- Missing roots make validation fail closed with an actionable local error.
- Broader execution trust requires new evidence and an accepted ADR or RFC.
