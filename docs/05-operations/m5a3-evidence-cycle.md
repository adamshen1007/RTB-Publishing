# M5A.3 Evidence Cycle — WP55 to WP62

## Purpose

M5A.3 converts repeated internal use into reviewable evidence. It does not use
automated tests, local job history, requests, or implementation activity as a
substitute for pilot sessions.

## Work-Package Status

| Work package | Status | Evidence boundary |
| --- | --- | --- |
| WP55 | Ready locally | Restore and validate a three-project operator baseline |
| WP56 | Awaiting real session | Record an observed inspection task after it occurs |
| WP57 | Awaiting real project | Confirm three genuinely active projects manually |
| WP58 | Awaiting real sessions | Cover registration, inspection, and workflow tasks |
| WP59 | Awaiting real sessions | Cover cancellation and recovery tasks |
| WP60 | Time-gated | Ten sessions must span at least fourteen days |
| WP61 | In progress | Fix only problems supported by observed evidence |
| WP62 | Blocked by protocol | Manual review follows the automated threshold |

## Status Command

```bash
pnpm rtb-publishing platform pilot status
pnpm rtb-publishing platform pilot status --json
```

The report distinguishes observed values from required values and lists missing
task categories. `manual-review-required` means automated arithmetic passed; it
does not approve M5B.

## Current Source-Control Evidence

The repository begins this cycle with no committed pilot session files. Create
each `PILOT-NNN.yaml` only after its task occurs, using sanitized observed facts.
Do not backfill records from job metadata or automated tests.
