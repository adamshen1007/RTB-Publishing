# WP92 — PDF Profile and Toolchain Decision Report

## Result

Completed. RFC-008 now selects Typst 0.15.0, an Apache-2.0 open-source
renderer, for the explicit combined `PDF/A-2a+PDF/UA-1` profile. This replaces
the prior Prince decision and removes its paid proprietary licence dependency.

The semantic compatibility fixture was rendered locally on macOS x86_64 with
only the lock-owned Noto Serif font. qpdf 12.3.2 passed, and veraPDF Greenfield
1.28.2 passed both `2a` and `ua1` with zero failed rules/checks. This is
machine prototype evidence, not a completed screen-reader or content-rights
review.

## Sources Consulted

- [Typst PDF reference](https://typst.app/docs/reference/pdf/) for compatible
  combined PDF/A + PDF/UA export, tagging, CLI options, and automatic checks.
- [Typst accessibility guide](https://typst.app/docs/guides/accessibility/),
  [0.15.0 release notes](https://typst.app/docs/changelog/0.15.0/), and its
  [Apache-2.0 source licence](https://github.com/typst/typst).
- [WeasyPrint API reference](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html)
  and [LibreOffice PDF/UA help](https://help.libreoffice.org/latest/gu/text/shared/01/ref_pdf_export_universal_accessibility.html)
  for alternatives not selected.
- [veraPDF validation](https://docs.verapdf.org/validation/) and its
  [1.28 archive](https://software.verapdf.org/releases/1.28), plus the locked
  [Temurin](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.11%2B10)
  and [qpdf](https://github.com/qpdf/qpdf/releases/tag/v12.3.2) releases.
- [GitHub-hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
  for the existing `macos-14` ARM64 CI boundary.

## Decisions and Evidence

- Locked Typst 0.15.0 macOS x86_64 and ARM64 release artifacts by SHA-256,
  with the exact upstream repository tag and Apache-2.0 licence evidence.
- Locked the validator, Java runtime, parser, visual-regression method, and
  Noto Serif font. Every binary artifact has a SHA-256; ImageMagick has its
  exact upstream release lock.
- Selected `macos-x86_64` as the only current release-producing platform and
  removed Ubuntu from the acceptance matrix. `macos-14` ARM64 is locked as the
  existing CI boundary but is expressly not release-capable until an actual
  compatibility run is recorded.
- Compiled `semantic-book.typ` with `--ignore-system-fonts`,
  `--ignore-embedded-fonts`, a lock-owned font path, fixed creation timestamp,
  and `--pdf-standard a-2a,ua-1`.
- The produced PDF hash is
  `43d7f5bc60ed8ab7cdd84fd74d16e8955cbfae50f8e8778bb91bcac9429d03f5`.
  qpdf reported PDF 1.7, no encryption, and no syntax/stream errors. veraPDF
  passed `2a` (153 rules, 7,174 checks) and `ua1` (106 rules, 1,642 checks).
- Rendered the one-page PDF to PNG and inspected it for clipping, overlap, and
  missing glyphs; none were found. This is a prototype inspection, not the
  locked Ghostscript/ImageMagick regression baseline.

## Files

- `governance/RFC/RFC-008-PDF-Publication-Profile.md`
- `publishing/pdf/toolchain.lock.json`
- `docs/05-operations/pdf-accessibility-review.md`
- `tests/fixtures/publishing/pdf/semantic-book.typ`
- `tests/fixtures/publishing/pdf/compatibility-matrix.json`
- `tests/fixtures/publishing/pdf/evidence/macos-x86_64-2026-07-28.json`
- `tests/pdf-toolchain.test.mjs`

## Remaining Gates

- Record a passing `macos-14` ARM64 compatibility run before GitHub Actions can
  generate a release candidate.
- Complete the versioned human VoiceOver and visual review for a specific
  candidate.
- Confirm rights for actual release content and fonts. The renderer itself has
  no paid licence requirement.

## Verification

- Passed: focused `node --test tests/pdf-toolchain.test.mjs`.
- Passed: actual Typst fixture render, qpdf integrity check, veraPDF `2a`,
  veraPDF `ua1`, and prototype visual rasterization documented in evidence.
