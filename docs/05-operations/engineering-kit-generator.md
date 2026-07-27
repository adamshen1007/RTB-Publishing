# Engineering Kit Generator

## What It Does

The RTB Publishing generator turns one small YAML manifest into a consistent starter
kit. It creates Markdown for strategy, product requirements, architecture,
milestones, verification, and changes. It does not invent research evidence or
approve product decisions.

## Before You Start

Complete the repository setup in [local development](local-development.md),
then check the generator:

```bash
pnpm rtb-publishing doctor
```

## Create Your First Project

Run this command from the RTB Publishing repository root and replace the example
values:

```bash
pnpm rtb-publishing create customer-interview-copilot \
  --name "Customer Interview Copilot" \
  --description "A workspace for planning and reviewing customer interviews." \
  --owner "Your Name" \
  --audience "Early-stage founders conducting customer discovery" \
  --problem "Founders lose important evidence across inconsistent interview notes"
```

This creates `projects/customer-interview-copilot/` with:

```text
rtb-publishing.project.yaml
README.md
CHANGELOG.md
docs/strategy/
governance/ADR/
planning/
.rtb-publishing/generation-state.json
```

The YAML manifest is yours to edit. The generated Markdown begins with an
ownership marker. The state file contains only content hashes used to detect
human changes.

## Validate Before Generating

```bash
pnpm rtb-publishing validate projects/customer-interview-copilot/rtb-publishing.project.yaml
```

Validation checks required values, the project slug, supported stage, template,
and output path. It writes nothing.

## Preview Regeneration

After changing the manifest, preview the plan:

```bash
pnpm rtb-publishing generate \
  projects/customer-interview-copilot/rtb-publishing.project.yaml \
  --dry-run
```

Then apply it:

```bash
pnpm rtb-publishing generate projects/customer-interview-copilot/rtb-publishing.project.yaml
```

Actions are reported as `create`, `update`, `replace`, or `unchanged`.

## Understand Conflict Protection

If you edit a generated document, RTB Publishing treats it as human-owned work and
stops. Review the changed file and choose one of these approaches:

1. Preserve the human change by moving it into the manifest or a user-owned
   document, then reconcile the generated file deliberately.
2. Keep the generated file unchanged and continue working without regeneration.
3. Replace the change only after review by adding `--force`.

```bash
pnpm rtb-publishing generate projects/customer-interview-copilot/rtb-publishing.project.yaml --force
```

`--force` replaces every conflicting standard output. Commit or back up valuable
work before using it.

## CI Drift Check

The committed example uses:

```bash
pnpm check:example
```

This command exits with status 1 if templates, the manifest, or generated files
are out of sync. `pnpm check` includes the same check.

## Command Reference

```text
pnpm rtb-publishing create <slug> [options]
pnpm rtb-publishing validate [manifest]
pnpm rtb-publishing generate [manifest] [--dry-run] [--check] [--force]
pnpm rtb-publishing doctor
```

Run `pnpm rtb-publishing --help` for create options and supported product stages.
