# PDF Accessibility Review Procedure

<!-- cspell:words PDF UA VoiceOver verapdf -->

## Purpose and Boundary

This is the required human procedure for a candidate made with the
[RFC-008 PDF profile](../../governance/RFC/RFC-008-PDF-Publication-Profile.md).
It records review evidence; it does not make an automated or blanket
accessibility claim. The reviewer must mark the record `pass`, `fail`, or
`blocked`. A missing record is `blocked`.

Use this procedure with the pinned toolchain and its machine reports. veraPDF
only covers machine-verifiable PDF/UA requirements, so its pass is a
prerequisite, not the conclusion of this review.

## Preconditions

1. Record the exact release candidate hash, Git revision, source snapshot hash,
   PDF SHA-256, and [toolchain lock](../../publishing/pdf/toolchain.lock.json)
   SHA-256.
2. Confirm successful qpdf, veraPDF `2a`, veraPDF `ua1`, font, metadata, link,
   bookmark, and visual-regression reports with their report hashes.
3. Verify that every meaningful figure has reviewable alternative text and that
   every decorative figure is intentionally marked as an artifact.
4. Use a clean copy of the candidate, not a PDF that has been saved or altered
   by a viewer.

## Screen-reader review

The required local review uses macOS VoiceOver. Record the exact macOS version,
VoiceOver version/settings, PDF viewer name and version, hardware, and date.
Do not substitute a different screen reader without a documented procedure
revision and an accepted RFC amendment.

With VoiceOver on, review the cover, table of contents, first chapter, one
representative callout, every figure type, every table type, a chapter with
footnotes/references, and the last chapter. Include the risk-selected pages
identified by the visual fixture.

For each selected item, verify and record:

- document title and `en-US` language are announced as expected;
- heading navigation reaches headings in hierarchical reading order;
- paragraphs, lists, callouts, links, notes, and page transitions are read in
  source order without duplicated, omitted, or visually displaced content;
- each meaningful figure exposes useful author-provided alternative text and
  decorative figures do not create distracting content;
- each table exposes its caption and header/data relationship sufficiently to
  understand the cells; and
- internal links, external links, table-of-contents links, and bookmarks lead
  to the intended destination.

A confusing order, missing content, misleading alternative text, broken link,
or unusable table is a failure unless it is remediated and the candidate is
rebuilt. Record what was heard, the location, and the expected result; do not
replace evidence with only a pass checkbox.

## Visual review

Open the same candidate at 100%, 200%, and a reader-chosen large-text/zoom
setting. Inspect the cover, table of contents, selected first/middle/last
pages, pages beside every forced page break, every full-width image, long URL,
wide table, callout, footnote/reference, and all pages highlighted by visual
comparison. Check for clipping, overlap, inaccessible color-only meaning,
unreadable text, broken glyphs, unexpected font substitution, missing images,
or misleading page references.

Verify that table reading order remains understandable and that the visual
layout does not contradict the structure review. A reviewer may add pages when
the content warrants it. A visual baseline comparison is a sampling aid; it
does not replace this inspection.

## Evidence record template

Store the completed record with the candidate evidence, not in canonical book
content. Preserve findings even when they are fixed.

```yaml
schemaVersion: 1
procedure: pdf-accessibility-review-v1
candidateHash: sha256:<candidate hash>
pdfSha256: <PDF hash>
toolchainLockSha256: <lock hash>
reviewer:
  name: <named human>
  role: <role>
  reviewedAt: <RFC 3339 timestamp>
environment:
  platform: macos-x86_64
  macos: <exact version>
  hardware: <Apple silicon or Intel model>
  screenReader: VoiceOver <version/settings>
  pdfViewer: <name and version>
machineReports:
  qpdf: { result: pass, sha256: <report hash> }
  verapdf2a: { result: pass, sha256: <report hash> }
  verapdfUa1: { result: pass, sha256: <report hash> }
  visualRegression: { result: pass, sha256: <report hash> }
samples:
  - locator: chapter-01#objective
    type: heading-and-reading-order
    observed: <what the reviewer heard/saw>
    result: pass
findings:
  - id: PDF-REV-001
    severity: blocking|non-blocking
    locator: <page, semantic ID, or fixture case>
    observed: <specific evidence>
    expected: <specific expected behavior>
    disposition: remediated|waiver-requested|open
result: pass|fail|blocked
```

## Waiver and escalation

Apply the RFC-008 waiver rules exactly. The reviewer cannot waive a PDF/A-2a,
PDF/UA-1, integrity, missing-glyph, security, or unresolved accessibility
failure. A `waiver-requested` result remains blocked until a named human
approves a scoped, expiring record and the release candidate hash still
matches. A change to source, PDF, lock, or renderer invalidates the review and
requires a new record.

## Sources

- [veraPDF validation scope](https://docs.verapdf.org/validation/)
- [Typst PDF accessibility requirements](https://typst.app/docs/reference/pdf/)
