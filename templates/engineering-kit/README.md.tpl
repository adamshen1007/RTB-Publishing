# {{project.name}}

{{project.description}}

## Project Snapshot

| Field | Value |
|---|---|
| Owner | {{project.owner}} |
| Stage | {{product.stage}} |
| Target audience | {{product.audience}} |
| Project slug | `{{project.slug}}` |

## Problem

{{product.problem}}

## Start Here

1. Review `docs/strategy/vision-manifesto.md`.
2. Challenge the assumptions in `docs/strategy/worthiness-review.md`.
3. Turn accepted scope into `docs/strategy/product-requirements.md`.
4. Record architecture decisions in `governance/ADR/`.
5. Track delivery and evidence in `planning/`.

## Source of Truth

`rtb-publishing.project.yaml` controls generated content. Edit the manifest and run
`pnpm rtb-publishing generate path/to/rtb-publishing.project.yaml`. User edits to generated
files are protected and require explicit review before replacement.
