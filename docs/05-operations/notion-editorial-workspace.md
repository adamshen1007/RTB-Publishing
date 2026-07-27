# Notion Editorial Workspace

## Purpose

The private RTB Publishing Book Headquarters makes the 23-chapter manuscript easier
to review, search, and use as a workbook. It does not replace Git or authorize a
release. The ownership and conflict rules are defined by RFC-005, ADR-007, and
the Notion editorial workspace specification.

## Export and Verify

Run:

```sh
pnpm notion:check
pnpm notion:export > /tmp/rtb-publishing-notion-export.json
```

The first command must report 23 chapters and 23 worksheets. The export contains
chapter prose, worksheet sections, source records, release actions, source
paths, and SHA-256 hashes. It contains no Notion credentials or private page IDs.

## Review a Chapter

1. Open **RTB Publishing Book Headquarters**, then **Chapters**.
2. Filter or search for the two-digit chapter number.
3. Read the derived copy and open its linked worksheet when useful.
4. Record each proposed correction in **Review Findings**. Include the chapter
   number, exact source path, finding type, severity, and proposed change.
5. Do not mark the chapter approved merely because the Notion copy reads well.

## Reconcile a Finding

1. A human decides whether to accept, revise, or reject the proposal.
2. Apply an accepted change to the chapter Markdown, not only to Notion.
3. Run `pnpm check:book`, `pnpm check:citations`, and the relevant full checks.
4. Re-export the record and compare its source hash with the Notion value.
5. Update the derived chapter and worksheet, then close the finding with the
   Git commit or pull-request evidence. Publication approval remains separate.

## Freshness Check

The local sync receipt is stored at `.rtb-publishing/notion/sync-state.json`. Run:

```sh
node scripts/notion-publication.mjs check \
  --state .rtb-publishing/notion/sync-state.json
```

Any missing chapter or hash mismatch is stale. Inspect unresolved findings
before resyncing so reviewer work is not overwritten. The receipt is local and
Git-ignored because it contains private workspace identifiers.

## Privacy and Recovery

- Keep the headquarters and all databases private.
- Do not store secrets, reader identities, interview transcripts, or private
  company details in the shared book workspace.
- If the Notion workspace is unavailable, continue authoring and publishing
  from Markdown. Recreate the derived records from the deterministic export.
- Never copy a private Notion URL into a committed document or public release.
