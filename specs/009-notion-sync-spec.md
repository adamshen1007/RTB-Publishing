# Notion Editorial Workspace Spec

## Purpose

Notion is a private editorial, worksheet, and release-coordination layer for
*The RTB Publishing Playbook for AI Founders*. Markdown in Git remains canonical.
Notion is never an alternate publication source.

## Ownership Boundary

| Record | Canonical owner | Notion role |
| --- | --- | --- |
| Chapter prose and citations | `chapters/*.md` | Derived review copy |
| Worksheets | Each chapter's `## Worksheet` section | Derived, fillable working copy |
| Source registration | `references/source-registry.md` | Searchable reference catalog |
| Release gates | `release-readiness-checklist.md` | Operational tracking view |
| Review findings | Notion during review | Proposal that must be resolved in Markdown |
| Publication approval | Git release record signed by a human | Coordination and evidence link |

Manual prose edits in Notion do not become publishable until a human applies
and reviews the correction in Markdown. A future two-way sync requires a new
accepted RFC because conflict resolution would change this boundary.

## Workspace Model

One private **RTB Publishing Book Headquarters** page owns five databases:

1. Chapters — one derived page for each of the 23 canonical chapters.
2. Worksheets — one working page for each chapter worksheet.
3. Sources — one record for every entry in the source registry.
4. Review Findings — proposals linked to a source path and chapter number.
5. Release Readiness — one record for every checklist action.

Every chapter and worksheet record carries its source path, SHA-256 source
hash, book version, and sync date. Private Notion identifiers live only in
`.rtb-publishing/notion/sync-state.json`, which is Git-ignored.

## Direction and Conflict Rules

The supported direction is **Markdown to Notion**. Before overwriting a Notion
chapter, the operator must compare its stored source hash with the current Git
hash and inspect unresolved review findings. Content is stale when those hashes
differ. The operator must not silently overwrite unsaved reviewer work.

Reviewers record proposed changes in Review Findings rather than editing the
derived chapter as the only copy. After a proposal is accepted:

1. Apply the change to the canonical Markdown chapter.
2. Run the repository quality checks.
3. Export and republish that chapter and worksheet.
4. Update their Notion source hashes and close the finding with Git evidence.

## Formatting Contract

Sync preserves headings, paragraphs, lists, task lists, blockquotes, tables,
links, footnotes, and fenced code as supported by Notion-flavored Markdown.
The chapter title is stored as the page title and removed from page content to
avoid duplication. Mermaid source remains a fenced code block; rendered book
diagrams remain owned by the publishing build.

## Safety and Release Rules

- Never place secrets, private company data, reader identities, or unpublished
  interview details in the shared editorial databases.
- Notion status does not satisfy a human approval gate by itself.
- Do not publish the Notion headquarters or databases to the public web.
- Never store private Notion URLs or page IDs in committed files.
- `pnpm notion:check` must cover exactly the canonical 23 chapters and report
  missing worksheet, source, or release records before a sync is accepted.

## Guided Beta Preparation

Creator Studio prepares Beta material only from the fixed private receipt at
`.rtb-publishing/notion/sync-state.json`. The server compares every discovered
canonical chapter ID and source hash with that receipt. A missing record, stale
hash, malformed receipt, or missing receipt blocks preparation with repair
guidance.

The server hashes a normalized snapshot containing canonical chapter identity,
path, and source hashes; private Notion page and workspace IDs are excluded. It
also hashes the deterministic passed policy result and creates the reviewer
identity from the confirmed local human session. The browser sends none of
those hashes or identity fields.

Registration re-derives that material inside the durable binding transaction
and rejects an earlier inspection if canonical Markdown or the receipt changed.
The Beta gate then re-derives the complete current snapshot again while the
lifecycle approval transaction is held. A missing or stale receipt, or hashes
that differ from the registered binding, makes the gate unavailable and cannot
create an approval. A prepared Beta binding is therefore evidence for one exact
canonical/Notion state, not a standing authorization.

Beta registration and lifecycle approval share the project writer lock with
canonical mutations and publication finalization. The required lock order is
project lock before SQLite transaction. Registration rechecks the same
canonical/receipt hashes immediately before commit and rolls back on mismatch.
Any future app-controlled receipt writer must write a complete temporary file,
flush it, and atomically rename it under this lock. Direct edits by an external
editor are not prevented by SQLite; a change visible to the stability recheck
is rejected rather than approved.
