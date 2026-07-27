# Contributing to RTB Publishing

Thank you for helping improve RTB Publishing. The project is currently focused on
small, milestone-scoped documentation and publishing changes.

## Before You Start

1. Read [README.md](README.md), [CONSTITUTION.md](CONSTITUTION.md), and
   [ROADMAP.md](ROADMAP.md).
2. Search existing issues, RFCs, and ADRs before proposing overlapping work.
3. Confirm that the change belongs to the current milestone or clearly explain
   why it should be considered earlier.

## Change Types

- Small corrections and clarifications may use a normal pull request.
- Major workflow, capability, or cross-domain proposals require an RFC under
  [`governance/RFC`](governance/RFC).
- Accepted architectural decisions require an ADR under
  [`governance/ADR`](governance/ADR).
- Constitution, licensing, source-of-truth, and strategic-positioning changes
  require explicit maintainer approval.

## Contribution Workflow

1. Fork or clone the repository.
2. Create a focused branch from `main`.
3. Make the smallest complete change that satisfies the stated goal.
4. Update affected specifications and documentation together.
5. Run the available quality checks. During M0, run `vale .` if Vale is
   installed and review Markdown rendering on GitHub.
6. Commit with a concise, descriptive message.
7. Open a pull request describing the motivation, scope, verification, and any
   assumptions or follow-up work.

## Documentation Standards

- Markdown is the canonical format.
- Distinguish sourced facts, synthesis, and assumptions.
- Do not introduce unsupported claims or private information.
- Keep headings descriptive and use one sentence per line where practical.
- Use relative links for files within this repository.
- Do not commit generated publishing outputs unless a release process
  explicitly requires them.

Book chapters must follow the required elements in [AGENTS.md](AGENTS.md).

## Licensing of Contributions

The repository is not currently released under an open-source license. By
submitting a contribution, you represent that you have the right to submit it
and allow the project maintainers to store, review, modify, and publish it as
part of this repository under the current project terms. Do not submit content
that requires incompatible third-party licensing.
