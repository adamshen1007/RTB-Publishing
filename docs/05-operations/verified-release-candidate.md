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

Review representative and high-risk pages in all three formats. A named
reviewer must record the PDF screen-reader/visual decision and the YC migration
decision. Rebuild after any change. The Creator then approves the exact final
candidate hash through the lifecycle Publish gate.

After the three exact, hash-bound review records make the candidate eligible,
use `--approval-id <stored-approval-id>`. RTB reads that approval from its
durable lifecycle ledger; a browser-authored JSON file is not accepted. The
resulting manifest consumes its release ID and approval permanently. RTB
Publishing does not claim hosted activation or subscriber delivery in
Increment 1.
