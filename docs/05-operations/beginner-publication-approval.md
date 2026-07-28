# Beginner Publication Approval

This procedure takes one reviewed book from a verified candidate to an
immutable local release manifest. It does not publish to a hosted subscriber
library. Markdown remains the publication source of truth; Notion is a derived
private review copy.

The three review buttons and the Beta and Publish gates record real human
decisions. Use **Record rejection** whenever the displayed material is not
ready. Never invent a hash, approval, reviewer identity, Notion receipt, or
qualified role to make a button available.

## Before You Start

1. Run `pnpm platform:start`.
2. Open the local Creator Studio URL shown in the terminal.
3. Select **Confirm human review session**.
4. Find the canonical book project under **Guided release review**.

Verify that Creator Studio shows a lifecycle version and does not report a
stale workspace. If a page has been open while a build, sync, or approval
changed, select **Refresh** before making a decision.

## 1. Approve the Blueprint

Do this:

1. Read the brief, reader promise, scope, source policy, budgets, and provider
   egress policy.
2. Select **Approve Blueprint** only when those exact inputs are correct.

Verify this:

- Creator Studio advances from lifecycle `0` to lifecycle `1`.
- The Blueprint gate shows a durable current approval.

Check:

- If the approval is unavailable, follow the message under the gate.
- A later material Blueprint change invalidates this approval. Review and
  approve the changed Blueprint again instead of bypassing the guard.

## 2. Build and Review the Lifecycle 1 Candidate

Do this:

1. Build the candidate for the version now displayed in Creator Studio:

   ```sh
   pnpm release:candidate -- --lifecycle-version 1
   ```

2. Open the generated HTML, PDF, and EPUB from
   `dist/releases/<book-id>/`.
3. Complete the three genuine reviews described below.

Verify this:

- `verification.json` reports a passed automated result.
- `candidate.json` records lifecycle version `1` and exact HTML, PDF, and EPUB
  hashes.
- Creator Studio shows the same displayed candidate identity for all three
  review controls.

Check:

- If any source or artifact changes, rebuild first. A new candidate identity
  means all three decisions must be made again.
- Do not copy hashes from `candidate.json` into a form. The local server reads
  the registered candidate and binds the evidence itself.

### Migration Visual Review

Review the HTML, PDF, and EPUB against the canonical Markdown. Check the cover,
title, table of contents, first/middle/last chapters, diagrams, images, tables,
callouts, checklists, worksheets, links, and sources. Look for missing,
duplicated, reordered, clipped, or incorrectly styled content introduced by
the migration.

In Creator Studio, select **Record approval** only if the displayed candidate
passes. Otherwise select **Record rejection**, record the finding in the
canonical review log, fix the Markdown or renderer, rebuild, and repeat all
candidate-bound reviews.

### PDF Screen-Reader and Visual Review

Follow the complete
[PDF Accessibility Review Procedure](pdf-accessibility-review.md). Use
VoiceOver and the required page sample, then inspect the same PDF visually at
the specified zoom levels. A machine validation pass does not replace this
human review.

In Creator Studio, record approval only when the procedure result is `pass`.
Record rejection for a `fail` or unresolved `blocked` result.

### Rights and Brand Review

Review the title, subtitle, cover, metadata, independence statement, source
use, quotations, paraphrases, rights statement, and launch copy. Resolve every
blocking rights or brand finding.

Before approval, enter your truthful qualified role in **Declaration: my
qualified rights-review role**. This field is a human declaration, not a
server-verified credential. If you are not qualified to make the decision,
record rejection or leave it pending and ask the appropriate reviewer.

## 3. Complete the Private Notion Review

Do this:

1. Reconcile accepted Notion edits and comments back into canonical Markdown.
2. Re-run the relevant book and citation checks.
3. Refresh every derived chapter in the connected private Notion workspace.
4. Make sure the real sync process updates the local, Git-ignored receipt at
   `.rtb-publishing/notion/sync-state.json`.
5. Run:

   ```sh
   node scripts/notion-publication.mjs check \
     --state .rtb-publishing/notion/sync-state.json
   ```

Verify this:

- The command reports no missing or stale chapter.
- Creator Studio shows **Receipt current** beside **Prepare Beta**.

Check:

- Do not create or edit the receipt merely to make the check pass. It is
  evidence from the real private sync.
- If a chapter is missing or stale, sync that chapter again and refresh Creator
  Studio.

## 4. Prepare and Approve Beta

Do this:

1. Select **Prepare Beta**.
2. Read the now-ready Beta gate.
3. Select **Approve Beta** only when the exact prepared snapshot is the one you
   reviewed.

Verify this:

- Creator Studio advances from lifecycle `1` to lifecycle `2`.
- The Beta gate has a current durable approval.

Check:

- Beta preparation creates the snapshot and policy hashes on the local server.
  There is no manual hash-entry step.
- Beta approval checks the canonical chapters and real receipt again. If either
  changed after preparation, the gate becomes unavailable; sync, prepare, and
  review Beta again.
- If Creator Studio reports that the material changed, the page was stale.
  Refresh, inspect the current receipt and gate, then make a new decision.

## 5. Rebuild at the Post-Beta Version

This rebuild is required. Beta approval increments the lifecycle version, so a
lifecycle `1` candidate cannot be approved for Publish at lifecycle `2`.

Do this:

1. Rebuild for the exact version now displayed:

   ```sh
   pnpm release:candidate -- --lifecycle-version 2
   ```

2. Verify the new candidate and all three artifacts.
3. Complete the migration visual, PDF screen-reader/visual, and rights/brand
   reviews again for this displayed candidate.

Verify this:

- `candidate.json` records lifecycle version `2`.
- Creator Studio initially shows the three review decisions as pending for the
  new candidate.
- After the genuine re-review, all three controls show approved and the Publish
  gate becomes ready.

Check:

- Earlier reviews remain valid historical evidence for their old candidate;
  they cannot authorize this new one.
- A rejection or another rebuild keeps Publish blocked until the current exact
  candidate has three approvals.

## 6. Approve Publish and Create the Manifest

Do this:

1. Refresh Creator Studio and inspect the displayed candidate identity,
   lifecycle `2`, current Blueprint and Beta approvals, and the three approved
   reviews.
2. Select **Approve Publish**.
3. Copy the manifest command shown directly under the stored Publish approval.
   It has this shape:

   ```sh
   pnpm release:candidate -- --lifecycle-version 2 \
     --approval-id <server-stored-publish-approval-id>
   ```

4. Run the displayed command without changing its lifecycle version or approval
   ID.
5. Run `pnpm release:verify`.

Verify this:

- `dist/releases/<book-id>/manifest.json` exists.
- The manifest identifies the exact candidate, lifecycle version, artifact
  hashes, release-policy hash, and Publish approval.
- Release verification passes.

Check:

- If the final rebuild does not reproduce the approved candidate exactly, the
  command fails closed. Return to the new displayed candidate and repeat its
  reviews; do not alter the approval record.
- A Publish approval and release identity are single-use. Reusing either is
  rejected.
- The displayed command creates a durable pending record for one exact
  manifest, atomically writes and verifies its files, then marks it completed.
  Only completed records verify as releases. If writing or verification is
  interrupted, run the identical command again; it resumes the same manifest
  and identity rather than consuming a new one.
- Finalization reloads the current candidate, Beta, Publish approval, and exact
  review policy. A rejection, invalidation, newer candidate, or detected
  canonical/receipt change makes it fail closed.
- A `409` or “material changed” message means your page or command is stale.
  Refresh and inspect the current exact material before trying again.

## Completion Checklist

- [ ] Blueprint approval is current.
- [ ] Real Notion sync receipt is complete and current.
- [ ] Beta preparation and Beta approval are current.
- [ ] Final candidate uses the post-Beta lifecycle version.
- [ ] All three human reviews approve that exact final candidate.
- [ ] Publish approval binds that candidate and current policy result.
- [ ] Immutable manifest exists and release verification passes.
- [ ] No hash, receipt, reviewer identity, qualified role, or approval was
      invented.
