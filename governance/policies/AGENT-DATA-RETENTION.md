# Agent Data Retention Policy

## Classification

Agent definitions, prompts, schemas, fake fixtures, and sanitized examples are
repository artifacts. Live run packages are local operational data and may
contain provider, model, reviewer, usage, filenames, and content-derived hashes.

## Rules

- Unsanitized runs are stored under `.rtb-publishing/agent-runs/` and ignored by Git.
- The runtime does not persist the combined prompt or full input file content.
- Requests retain file paths, byte counts, and SHA-256 hashes for auditability.
- OpenAI requests set `store: false`; provider-side legal or abuse retention is
  governed by the operator's provider agreement.
- Provider keys must remain in environment variables and must never enter a run
  artifact, fixture, command example, or commit.
- Only deliberately reviewed, synthetic, or public sanitized runs may be copied
  into `examples/agent-runs/`.
- Local run packages should be deleted within 30 days after review unless an
  active incident, audit, or accepted governance record requires longer.
- Rejected runs need not be retained after their review rationale is captured.

## Deletion

Delete the individual local run directory. Do not delete canonical research or
Git history as part of agent-run cleanup. If a secret was exposed, rotate it
first and follow `SECURITY.md`; deletion alone is not remediation.
