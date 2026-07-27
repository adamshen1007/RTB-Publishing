# RFC-005 — Notion Editorial Workspace

## Status

Accepted for the Volume 1 publication-preparation track

## Evidence and Assumptions

Volume 1 has 23 canonical Markdown chapters, a source registry, a release
checklist, and reproducible publishing outputs. The repository had a short
one-way Notion sync rule but no workspace model, conflict policy, or freshness
evidence.

No claim is made that Notion improves the manuscript by itself. This RFC assumes
a structured private workspace can reduce review coordination cost. Actual
editorial quality still depends on qualified human review and resolved findings.

## Decision

Create a private Notion editorial workspace containing derived chapter and
worksheet pages plus source, finding, and release-readiness databases. Apply the
same contract to all 23 chapters rather than piloting a different content model
on only one chapter.

Git Markdown remains canonical. Notion review findings are proposals. Accepted
changes must be applied to Markdown, pass repository checks, and be synced back
to Notion with a new source hash before they can enter a release.

## Included

- One Book Headquarters page and five linked editorial databases
- A chapter and worksheet record for every canonical chapter
- Searchable source and release-readiness records
- Deterministic export, SHA-256 freshness metadata, and local sync state
- A verified review-finding workflow that does not claim human approval
- Operator guidance for export, review, reconciliation, and resync

## Deferred

Automatic two-way sync, public Notion publishing, reviewer identity collection,
Notion API credentials in the repository, automatic acceptance of edits, and
publication approval are excluded. Each would require additional evidence and,
where it changes authority or privacy, a new RFC.

## Success Measures

- The exporter discovers exactly 23 ordered chapters from the canonical table
  of contents and produces one worksheet for each.
- Every derived record carries a source path and source hash.
- Every registered source and release checklist action is represented.
- A reviewer can file a proposal, trace it to Markdown, and close it only after
  the canonical change is verified.
- Private Notion identifiers stay outside version control.

## Exit Criteria

WP79–WP86 complete when the accepted boundary is documented, the local exporter
passes, the private workspace is populated for all 23 chapters, the workflow is
exercised without claiming editorial approval, and the delivery record contains
verifiable counts and any remaining human gates.
