# ADR-001 — M1 Publishing Toolchain

## Status

Accepted

## Context

M1 must prove that canonical Markdown can pass repeatable quality gates and
produce useful release artifacts without a proprietary service. The workflow
must be understandable to a beginner, runnable on a fresh clone, and suitable
for continuous integration.

## Decision

- Node.js 24 and pnpm 11 provide the stable user-facing command interface.
- Pandoc 3 converts canonical Markdown into standalone HTML, EPUB 3, and DOCX.
- `markdownlint-cli2`, CSpell, Vale, and Mermaid CLI provide automated quality
  checks.
- Small Node.js scripts coordinate tool execution and implement RTB Publishing-
  specific checks for links, citations, diagrams, outputs, and previewing.
- Generated and intermediate files live under `dist/` and `build/`; neither is
  a canonical source.
- M1 publishes one representative book before generalizing the pipeline.
- PDF, Notion synchronization, public hosting, and a general orchestration
  runtime remain outside M1.

## Rationale

Pandoc directly supports the required M1 formats and preserves Markdown as the
source of truth. Node and pnpm provide one familiar command surface across
macOS and CI. The individual tools are replaceable because their behavior is
wrapped by project-owned commands and specifications.

## Consequences

Benefits:

- A small, inspectable toolchain
- No database or private service dependency
- The same commands run locally and in CI
- Generated formats remain replaceable outputs

Trade-offs:

- Contributors must install Pandoc and Vale in addition to Node and pnpm.
- Mermaid rendering installs a browser runtime through its CLI dependency.
- DOCX and EPUB archives may contain timestamp metadata, so M1 reproducibility
  is functional rather than byte-for-byte.
- A later publishing engine may replace individual tools while preserving the
  command and artifact contracts.

## Verification

This decision is validated when a clean clone can run `pnpm check`,
`pnpm build`, and `pnpm preview`, and CI uploads verified HTML, EPUB, and DOCX
artifacts.
