# ADR-002 — Deterministic Engineering Kit Generation

## Status

Accepted

## Context

RTB Publishing needs to generate starter documentation repeatedly without overwriting
human work or making output depend on the clock, network, or machine.

## Decision

Use a versioned YAML manifest validated by JSON Schema. Render a fixed mapping of
repository-owned templates to Markdown output. Store only generator version and
content hashes in `.rtb-publishing/generation-state.json`.

On regeneration, overwrite only files whose current hash matches the prior
generated hash. Treat new, unowned, or user-modified files as conflicts unless a
human supplies `--force`. Reject output outside the repository.

## Consequences

- Equal manifests and template versions produce byte-identical output.
- User changes cannot be merged automatically; conflicts require review.
- Template evolution is safe for unchanged generated files.
- State is portable because it contains no timestamps or absolute paths.

## Alternatives Considered

- In-place marker regions were rejected because partial document ownership is
  harder for beginners to understand.
- Silent full-file replacement was rejected because it risks data loss.
- Timestamped output was rejected because it prevents deterministic snapshots.
