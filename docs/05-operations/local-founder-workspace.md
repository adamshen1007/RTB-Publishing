# Local Founder Workspace

## Start in Three Commands

```bash
pnpm install
pnpm rtb-publishing platform doctor
pnpm platform:start
```

Open <http://127.0.0.1:4310>. The server is intentionally unavailable to other
devices. Press `Ctrl+C` to stop it.

## What You Are Seeing

The workspace reads `workspace/rtb-publishing.workspace.yaml` and derives project
summaries from canonical repository files. It does not copy project content
into a database. Refreshing the page rereads the in-memory index created at
startup; restart after changing the workspace manifest.

The committed example registers RTB Publishing itself and AI Launch Copilot.
Repository-contained projects use the committed registry. External repositories
use a separate local overlay that Git ignores.

## Register Projects

```bash
pnpm rtb-publishing platform project list
pnpm rtb-publishing platform project add examples/my-project --dry-run
pnpm rtb-publishing platform project add examples/my-project
pnpm rtb-publishing platform project inspect my-project
```

RTB Publishing detects a kit from `rtb-publishing.project.yaml` or a repository from
`package.json`.

## Import an External Repository

Use the repository directory itself as the allowed root. Replace the example
path with an absolute path on your computer.

First, inspect eligibility without writing anything:

```bash
pnpm rtb-publishing platform project onboard "/absolute/path/to/project"
```

Then review and add the explicit local permission:

```bash
pnpm rtb-publishing platform root allow "/absolute/path/to/project" --dry-run
pnpm rtb-publishing platform root allow "/absolute/path/to/project" --confirm
```

Finally, preview and perform the import:

```bash
pnpm rtb-publishing platform project import "/absolute/path/to/project" --dry-run
pnpm rtb-publishing platform project import "/absolute/path/to/project"
pnpm rtb-publishing platform project list
```

External imports require `package.json`. They appear in the dashboard as local,
read-only projects. RTB Publishing does not run their scripts or grant workflows.
Removing an import or allowed root never deletes external files.

### Optional Cleanup — Do Not Run During Onboarding

Stop after `project list` if you want the project to remain registered. Run the
following only when you intentionally want to remove a project from RTB Publishing:

```bash
pnpm rtb-publishing platform project remove my-project --dry-run
pnpm rtb-publishing platform project remove my-project --confirm
```

For an external project, remove its project registration before removing its
allowed root. Removal changes only RTB Publishing local state and never deletes the
project directory.

## Run a Workflow

Choose an action on a project dossier and confirm it. RTB Publishing creates a local
job, runs one fixed existing command, and records bounded output under
`.rtb-publishing/platform/jobs/`.

Available actions are deliberately narrow:

- Run all repository checks.
- Validate the example research graph.
- Create a fake-provider research review proposal.
- Check the generated engineering kit for drift.

The workspace cannot approve an agent proposal, commit, push, publish, or run
an arbitrary command.

## Canonical Local Mutations

The dashboard never receives repository paths or writes files directly. The
only registered mutation policy currently applies to the RTB Publishing book's
declared chapter and worksheet Markdown paths. It writes immutable canonical
Markdown/YAML snapshots and the durable current-root pointer under the
Git-visible `.rtb-content/` directory. SQLite, locks, preimages, and temporary
files live only under ignored `.rtb-state/`; deleting that directory does not
delete manuscript content and the operational index can be rebuilt.

Existing build commands still read the legacy working-tree manuscript path.
They do not project a snapshot back into that path. The `.rtb-content/current.json`
pointer is the canonical read boundary for WP96 discovery and assembly: a reader
pins it once, then reads only below that immutable snapshot. Until every existing
Book Project has a pointer, generic discovery makes an explicit, read-only
`legacy-working-tree` fallback; it never copies a snapshot back into the legacy
path. The fallback is a transition state, not a second canonical authority, and
is retired project-by-project once a current-root pointer exists.

Snapshots are selected from the reviewed project policy and exclude Git
metadata, local state, dependency and generated output directories, and
secret-shaped files. A local request must reach the exact
loopback listener origin with a short-lived session-bound CSRF/capability pair.
Every accepted mutation rotates that pair. Unregistered and local-overlay
projects remain read-only.

Running or queued jobs can be cancelled. Terminal jobs can be run again as a
new record with a parent-job reference; history is never rewritten.

## Diagnostics and Retention

```bash
pnpm rtb-publishing platform diagnose --output .tmp/platform-diagnostics.json
pnpm rtb-publishing platform jobs export --output .tmp/platform-jobs.json
pnpm rtb-publishing platform jobs clean --older-than 30d --dry-run
pnpm rtb-publishing platform jobs clean --older-than 30d
pnpm rtb-publishing platform pilot check
pnpm rtb-publishing platform pilot status
pnpm rtb-publishing platform pilot status --json
```

Diagnostics and exports contain status metadata but omit commands, logs,
environment values, and canonical content.

`pilot check` validates committed session records. `pilot status` reports
progress toward the automated session, project, date-span, and task-coverage
thresholds. Even when those criteria pass, a human security, accessibility, and
product-need review remains required.

## Recovery

If the server stops during a job, the next start marks that job failed with an
interruption message. Inspect the log, correct the cause, and start a new job.
RTB Publishing does not retry writes automatically.

The dashboard shows whether a job is queued, executing, or recorded. Failed and
cancelled jobs include a recovery hint. A rerun always creates a new job with a
lineage reference.

## Back Up and Restore the Local Registry

Backups contain the ignored allowlist and external-project pointers only. They
do not copy canonical content, job logs, environment variables, or secrets.

```bash
pnpm rtb-publishing platform backup create --dry-run
pnpm rtb-publishing platform backup create
pnpm rtb-publishing platform backup inspect .rtb-publishing/platform/backups/<backup-file>.json
pnpm rtb-publishing platform backup restore .rtb-publishing/platform/backups/<backup-file>.json --dry-run
pnpm rtb-publishing platform backup restore .rtb-publishing/platform/backups/<backup-file>.json --confirm
```

Restore replaces only the ignored local registry after validating that every
allowed root and imported project still exists.

To remove local history, stop the server and delete the individual files under
`.rtb-publishing/platform/jobs/`. This does not delete canonical project content.

## Troubleshooting

- **Port already in use:** run `pnpm rtb-publishing platform start --port 4311`.
- **Project path denied:** use `project add` for repository-contained projects;
  use the inspect, allow, and import sequence for an external repository.
- **Workflow unavailable:** only actions declared for that project are allowed.
- **Page cannot connect:** confirm the terminal process is still running and
  open the exact loopback URL it printed.
- **Showing last valid index:** correct the reported manifest or project error;
  the last valid view remains available until indexing succeeds.

## Verification

```bash
pnpm test:platform
pnpm check:platform
pnpm check
```
