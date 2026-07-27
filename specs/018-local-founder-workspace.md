# Local Founder Workspace Specification

## Source of Truth

The workspace manifest registers projects but does not duplicate their content.
Project summaries and job records are derived artifacts. Canonical Markdown,
YAML, JSON, and existing validators remain authoritative.

## Components

```mermaid
flowchart LR
    A["Committed workspace manifest"] --> B["Safe indexer"]
    H["Ignored local allowlist overlay"] --> B
    C["Canonical project files"] --> B
    B --> D["Local API"]
    D --> E["Founder dashboard"]
    E --> F["Allowlisted job request"]
    F --> G["Existing RTB Publishing CLI"]
    G --> C
```

## Security Invariants

- The server binds only to `127.0.0.1` or `::1`.
- Committed project paths remain inside the repository and cannot traverse
  symbolic links.
- External repositories require an explicit local allowlist, remain read-only,
  and receive no workflows by default.
- API writes require JSON, same-origin requests, a CSRF token, and confirmation.
- Only predefined command arrays may execute; request data never becomes a shell
  command.
- One job executes at a time. Logs are bounded and secret-shaped values redacted.
- Git, push, publication, remote access, and approval are not platform jobs.

## Acceptance Criteria

- All platform artifacts validate against versioned schemas.
- The index snapshot is deterministic for equal canonical inputs.
- API errors are structured and actionable.
- Interrupted running jobs recover as failed after restart.
- Equal canonical state retains one index generation; changed state increments
  it, while invalid state preserves the last valid view with an error.
- Cancellation terminates the tracked child process and reruns create lineage
  instead of rewriting history.
- The dashboard is keyboard accessible, responsive, and honors reduced motion.
- Candidate inspection and dry-run occur before external registry mutation.
- Local registry backups exclude canonical content and restore only after
  validation and explicit confirmation.
- Failed and cancelled jobs expose actionable recovery guidance without
  automatic retry.
- Pilot status counts only schema-valid session records and reports project,
  date-span, task, and outcome coverage independently of local job history.
- Automated pilot criteria never bypass the manual security, accessibility, and
  hosted-need decision gate.
