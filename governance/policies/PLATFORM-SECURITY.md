# Local Platform Security Policy

## Boundary

M5A is a single-user local tool. It is not approved for LAN, internet, shared-
host, or multi-tenant deployment.

## Controls

- Bind only to IPv4 or IPv6 loopback.
- Keep committed project roots inside the repository. External roots require an
  absolute, explicit local allowlist entry and reject symbolic links.
- Treat external projects as read-only and grant no workflows automatically.
- Deny secret-shaped paths and never expose environment values through the API.
- Require same-origin JSON requests, CSRF tokens, and explicit confirmation for
  workflow jobs.
- Execute only fixed argument arrays with `shell: false`.
- Limit execution to one job and retain bounded, redacted logs.
- Recover interrupted jobs as failed rather than silently retrying them.
- Represent human cancellation explicitly and create a new record for reruns.
- Exclude Git, approval, push, publish, and arbitrary commands from the job
  allowlist.

## Retention

Local job records under `.rtb-publishing/platform/jobs/` are ignored by Git. Delete
terminal records after 30 days unless an incident or active audit requires them.
Committed examples must be sanitized and must not originate from private logs.

The local external-project overlay and registry backups under
`.rtb-publishing/platform/` are also ignored. A backup contains registry pointers,
not project content, and restore requires explicit confirmation.

Remote access, user accounts, and collaboration require a new threat model and
RFC before implementation.
