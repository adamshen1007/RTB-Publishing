# Verified release candidate

RTB Publishing builds HTML, PDF, and EPUB from one disk-backed immutable source
snapshot. Pandoc produces HTML, EPUB, and derived Typst; pinned Typst 0.15.0
produces the PDF. Prince is not used.

## One-time local setup

Install Pandoc and download the exact Typst, veraPDF, W3C EPUBCheck, Java, and
Noto Serif artifacts listed in the PDF and EPUB toolchain locks under
`publishing/`. Set these variables to the verified local files:

- `PDF_TYPST`
- `PDF_JAVA`
- `PDF_VERAPDF`
- `PDF_VERAPDF_JAR`
- `PDF_FONT`
- `EPUBCHECK_ARCHIVE`
- `EPUBCHECK_JAR`
- `JAVA_HOME`

The command fails before rendering if a file is absent or its hash differs from
the lock.

## Build and check

Run `pnpm release:candidate`. Then check:

1. `dist/releases/<book-id>/` contains one HTML, PDF, and EPUB file plus the
   retained `source-snapshot/` audit bundle.
2. `verification.json` says `passed`, EPUBCheck has no messages, both veraPDF
   profiles are compliant, and semantic parity passed.
3. `candidate.json` records the three artifact hashes and says
   `releaseEligible: false` while named manual reviews remain unfinished.
4. No `manifest.json` exists yet. This is correct before Publish approval.

Run `pnpm release:resource-proof` to repeat the 512 MiB, 8 MiB-chunk memory
bound test.

## Human review and Publish

Follow the
[beginner publication approval procedure](beginner-publication-approval.md)
for the complete do-this, verify-this, and check sequence.

Review representative and high-risk pages in all three formats. A named
reviewer must record the PDF screen-reader/visual decision and the YC migration
decision. Rebuild after any change. Beta approval advances the lifecycle
version, so rebuild at that post-Beta version and repeat all three exact
candidate reviews before Publish. The Creator then approves the exact final
candidate hash through the lifecycle Publish gate.

After the three exact, hash-bound review records make the candidate eligible,
use the exact manifest command Creator Studio displays with
`--approval-id <stored-approval-id>`. RTB reads that approval from its durable
lifecycle ledger; a browser-authored JSON file is not accepted. Finalization
persists one exact pending manifest, atomically writes and verifies it, then
marks its identity completed. An identical retry safely resumes a pending
record. Only completed durable finalization verifies as a release. RTB
Publishing does not claim hosted activation or subscriber delivery in
Increment 1.

The build first holds the workspace output lock and then the nested project
writer lock. It uses a unique staging directory and does not remove the
existing promoted release. After registration and finalization, it verifies
staging, records a durable promotion marker, and atomically renames staging.
The prior release backup remains until the promoted directory passes exact
verification again. Failure or restart restores that backup before retrying.
`pnpm clean` and other build output writers take the same workspace lock, so a
clean at repository root cannot race a build under a nested book directory.

An older `reserved` identity is adopted only when its exact candidate, current
real approval and policy, current Beta, and existing manifest all reproduce.
Otherwise preserve the evidence and obtain a new Publish approval. Verification
of a completed release proves its approval and bytes were valid at completion;
a later Blueprint invalidation does not rewrite that history. Current delivery
eligibility or revocation is a separate product decision.

When upgrading a database created before completion-time approval facts were
stored, verification backfills those facts only if the completed identity,
candidate source/artifacts/lifecycle, manifest JSON/checksum, historical review
policy, exact human approval bindings, required Beta binding, and timestamps
all prove the approval was current at completion. If any redundant field
differs, stop and preserve the directory and database. The explicit
reconciliation error means a human must review the old evidence or create a
new candidate and approval; do not delete the old release.
