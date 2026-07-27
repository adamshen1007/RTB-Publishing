# Specification 017 — Engineering Kit Generator

## Purpose

Define the M2 contract for creating and regenerating standard engineering kits.

## Inputs

- A `rtb-publishing.project.yaml` manifest conforming to schema version 1
- The canonical `default` templates under `templates/engineering-kit/`
- Optional CLI safety flags

## Commands

### `create <slug>`

Collect required project values, write the manifest, and generate the first kit.
Missing values may be prompted in an interactive terminal. Non-interactive use
must provide every required value.

### `validate [manifest]`

Validate schema, supported values, and the repository output boundary without
writing files.

### `generate [manifest]`

Plan and apply deterministic template output. `--dry-run` reports actions,
`--check` fails on drift, and `--force` permits reviewed replacement.

### `doctor`

Check the schema, template directory, and supported Node.js runtime.

## Standard Output

The default kit contains:

- Project README
- Vision manifesto
- Worthiness review
- Product requirements
- Foundational ADR
- Milestone plan
- Verification plan
- Changelog

## Ownership Rules

- The YAML manifest is user-owned.
- Generated Markdown begins with the RTB Publishing ownership marker.
- Generation state contains deterministic hashes, not user content.
- A modified generated file is protected as user-owned work.
- `--force` is the only supported destructive override.

## Path Rules

- Output is relative to the manifest.
- Output must resolve inside the RTB Publishing repository.
- Repository-root and absolute output are invalid.
- Existing symbolic-link path segments are invalid.
- Template output paths are fixed by the selected template.

## Exit Codes

- `0`: command completed or check found no drift
- `1`: invalid arguments, manifest, unsafe path, conflict, drift, or setup failure

## Acceptance Criteria

- A beginner can create a complete kit with one documented command.
- Identical input produces byte-identical Markdown and state.
- Regeneration is idempotent.
- Modified and unowned files are protected.
- Invalid schema and unsafe paths fail with actionable messages.
- The committed example passes snapshot and CI drift checks.
