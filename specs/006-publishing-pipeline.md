# Publishing Pipeline Specification

## Purpose

Define the M1 path from canonical book Markdown to validated release artifacts.

## Inputs

- A book directory under `books/`
- A `book.md` file containing YAML metadata
- Ordered Markdown chapters under `chapters/`
- Source-first diagrams embedded as Mermaid blocks or referenced assets
- Project publishing styles under `publishing/`

## Pipeline

```text
Canonical Markdown
  -> prerequisite validation
  -> content quality gates
  -> Mermaid rendering
  -> combined build document
  -> Pandoc conversion
  -> output verification
  -> release artifacts
```

## Commands

- `pnpm check` runs every required M1 quality gate.
- `pnpm build` generates and verifies all M1 output profiles.
- `pnpm preview` serves the generated HTML locally.
- `pnpm clean` removes generated and intermediate files.

These commands are the public interface. Internal scripts may change without
changing the command contract.

## Outputs

For `books/volume-01-yc-playbook`, the pipeline writes:

```text
dist/books/volume-01-yc-playbook/
├── index.html
├── rtb-publishing-playbook.epub
└── rtb-publishing-playbook.docx
```

Intermediate documents and rendered diagrams live under `build/`.

## Failure Rules

- A missing required tool fails before content processing begins.
- A failed quality gate prevents artifact generation.
- A failed conversion removes incomplete output for that format.
- A missing, empty, or structurally invalid artifact fails the build.
- Confirmed broken internal or external links fail; transient remote failures
  are reported separately.

## Reproducibility

M1 reproducibility means that the same canonical source and pinned toolchain
produce equivalent content, deterministic filenames, and the same output
structure. Byte-identical EPUB and DOCX archives are not required because
archive metadata may contain timestamps.

## Acceptance Criteria

- A fresh clone can run the public commands without private services.
- HTML, EPUB, and DOCX are produced from the sample book.
- All generated files remain outside canonical source directories.
- Quality failures return a nonzero exit code.
- The local and CI workflows use the same pnpm commands.
