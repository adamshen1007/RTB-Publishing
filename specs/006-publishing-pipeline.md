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

For each project, the generic pipeline writes one private generation containing
both intermediate build material and rendered output, then atomically selects
it with a small current pointer:

```text
dist/books/
├── .current/<project-id>.json
└── .generations/<project-id>/<generation-id>/
    ├── build/
    │   ├── combined.md
    │   └── diagrams/
    └── output-root/<project-id>/
        ├── index.html
        └── <declared downloadable formats>
```

The pointer is internal metadata, not a user-editable interface. `pnpm preview`
resolves it for every request while holding the workspace output lock. It opens
the selected regular file without following symbolic links, pins the descriptor
identity, reads only from that descriptor, then rechecks the descriptor, path,
and pointer before returning bytes. A successful build retains the current
generation and two complete predecessors; retention runs only under the
workspace and project locks. It writes a project-and-token-scoped closed-schema
version 3 transaction bound to the exact pointer bytes and hash, and rechecks
that pointer before every move, before each `delete_pending` transition, and
immediately before each removal. A pointer change restores still-owned
quarantine, including a generation newly selected after quarantine. Atomic
journal-temp recovery and per-entry `move_pending`/`delete_pending` states close
journal-write, rename, and removal crash windows. After bounded deletion, the
transaction is durably renamed to a terminal tombstone before removal; recovery
completes either side of that terminal boundary without touching another
project.

The generic `buildProject` API has no separate `buildRoot`: build intermediates
are deliberately co-located with their rendered files so a pointer can never
select a mixed pair. Release-candidate rendering continues to use its separate,
canonical `build/publishing` workspace.

## Failure Rules

- A missing required tool fails before content processing begins.
- A failed quality gate prevents artifact generation.
- A failed conversion removes incomplete output for that format.
- A missing, empty, or structurally invalid artifact fails the build.
- A missing, malformed, replaced, or concurrently edited current pointer fails
  preview rather than serving a conventional or stale output directory.
- Staging drift, destination collision, or a generation path replacement fails
  before pointer publication. Publication exclusively reserves the UUID
  directory and materializes every child with no-replace creation; it never
  removes an unverified destination or colliding successor. A failed owned
  unpublished reservation is removed only after its inode and complete partial
  inventory are revalidated.
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
