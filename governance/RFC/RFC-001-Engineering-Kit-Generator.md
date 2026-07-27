# RFC-001 — Engineering Kit Generator

## Status

Accepted for M2 implementation

## Summary

RTB Publishing will provide a local, deterministic CLI that generates a standard
engineering documentation kit from one validated YAML manifest.

## Motivation

The repository contains useful templates but copying them manually creates
inconsistent names, missing documents, and uncertain ownership. A generator can
make the supported path repeatable without introducing a hosted service or a
second source of truth.

## Proposal

The `rtb-publishing` CLI will support four commands:

- `create` creates a manifest and its first engineering kit.
- `validate` validates a manifest and its output boundary.
- `generate` renders or checks a kit.
- `doctor` checks local generator prerequisites.

The manifest remains user-owned. Generated files contain an ownership marker,
while a deterministic state file records the hash of each last generated file.
Regeneration may update an unchanged generated file, but it must stop when a
user has modified a generated file. `--force` is an explicit human override.

## Compatibility

The first schema version supports the `default` template. Future incompatible
manifest changes require a schema-version migration rather than silent
reinterpretation.

## Security and Safety

- Output must remain inside the RTB Publishing repository.
- Absolute paths and repository-root output are rejected.
- Symbolic-link path segments are rejected before files are read or written.
- Existing unowned or user-modified files are never silently replaced.
- The CLI makes no network calls and reads no secrets.

## Alternatives

- Manual template copying was rejected because it cannot verify completeness.
- A hosted generator was deferred because M2 does not require private services.
- A general plug-in system was deferred until multiple proven templates exist.

## Acceptance

M2 is accepted when the example kit passes validation, snapshot tests,
idempotency tests, drift detection, and clean-environment generation.
