# WP92 — PDF Profile and Toolchain Decision Report

## Result

Blocked. RFC-008 accepts the technical PDF decision required before WP98 PDF
renderer implementation: Prince 16.2 with `PDF/A-2a+PDF/UA-1`, validated by
veraPDF Greenfield 1.28.2 (`2a` and `ua1`), qpdf 12.3.2, and a locked
Ghostscript/ImageMagick visual comparison path. The decision explicitly limits
release-producing runs to macOS Universal and Ubuntu 24.04 x86_64, and the
required compatibility gate has not passed on either platform.

## Sources Consulted

- [Prince PDF output and profiles](https://www.princexml.com/doc/prince-output/)
  for the combined profile, tagged structure, fonts, links, bookmarks, and
  metadata behaviour.
- [Prince 16.2 download page](https://www.princexml.com/download/16/) and
  [licence FAQ](https://www.princexml.com/purchase/license_faq/) for platform
  packages and vendor licence descriptions.
- [veraPDF validation](https://docs.verapdf.org/validation/),
  [CLI profiles](https://docs.verapdf.org/cli/validation/), and the
  [1.28 archive](https://software.verapdf.org/releases/1.28) for PDF/A-2a and
  PDF/UA-1 flavours and the machine-only limit of PDF/UA checks.
- [qpdf 12.3.2 release](https://github.com/qpdf/qpdf/releases/tag/v12.3.2),
  [Ghostscript releases](https://ghostscript.com/releases/), and
  [ImageMagick compare](https://imagemagick.org/compare/) for parser and
  visual-regression pins.

## Decisions and Evidence

- Calculated and recorded SHA-256 values for the official Prince macOS and
  Ubuntu artifacts, veraPDF installer, qpdf source archive, Ghostscript source
  archive, and Noto Serif font artifact. The qpdf release's signed checksum
  manifest is also recorded.
- Selected a deliberately narrow `en-US` language/font boundary. System font
  fallback and artificial faces are disabled; missing glyphs are build errors.
- Added fixed waiver fields, expiry limit, and human-approval requirement.
- Added a named macOS VoiceOver and visual review procedure with required
  machine-report hashes and reviewer evidence fields.
- Did not claim an accessibility conformance result, completed screen-reader
  review, legal clearance, licence sufficiency, or compatibility run. Those
  remain human or platform-specific evidence gates.
- Added checksum-pinned Eclipse Temurin JRE 21.0.11+10 artifacts for macOS
  Intel, macOS Apple silicon, and Ubuntu x86_64. veraPDF may run only on this
  pinned Java runtime.

## Files

- `governance/RFC/RFC-008-PDF-Publication-Profile.md`
- `governance/RFC/RFC-007-Research-to-Book-Publishing.md`
- `governance/README.md`
- `publishing/pdf/toolchain.lock.json`
- `docs/05-operations/pdf-accessibility-review.md`
- `tests/fixtures/publishing/pdf/semantic-book.html`
- `tests/fixtures/publishing/pdf/compatibility-matrix.json`
- `tests/fixtures/publishing/pdf/waiver.example.json`
- `tests/fixtures/publishing/pdf/evidence/macos-universal-2026-07-27.json`
- `tests/fixtures/publishing/pdf/evidence/ubuntu-24.04-x86_64-2026-07-27.json`
- `tests/pdf-toolchain.test.mjs`
- `cspell.json`

## Verification

- Passed: `node --test tests/pdf-toolchain.test.mjs` (5 tests).
- Passed: `pnpm check:markdown`, `pnpm check:spelling`, `pnpm check:style`,
  `pnpm check:citations`, and `pnpm check:links`. The links check completed
  successfully while reporting transient network warnings for external links.
- `pnpm test` exercised 69 repository tests: 67 passed; two existing platform
  server tests could not bind `127.0.0.1` in the sandbox (`EPERM`). The focused
  WP92 test suite passes.

### Compatibility execution

- macOS Universal (Intel host): verified the Prince 16.2, Temurin 21.0.11+10,
  veraPDF 1.28.2, qpdf 12.3.2, and Noto artifact hashes; rendered the semantic
  fixture; qpdf parsed it; and veraPDF `2a` passed. veraPDF `ua1` failed with
  two ISO 14289-1:2014 clause 7.18.1 checks. The exact cause is a Popup
  annotation added by Prince's non-commercial watermark; it has no Contents or
  Alt and is not nested in an Annot tag. The PDF is not release eligible.
- Ubuntu 24.04 x86_64: Docker Desktop 29.5.3 was reachable, but
  `ubuntu:24.04` could not be made locally available after repeated pull
  attempts. The inspected local Linux image is Debian 12, which is not an
  accepted substitute. No PDF was produced on this platform.

## Commit

Initial implementation commit: `387e66d713088b772c960a31fe3b029a9b42a55d`

## Concerns

WP92 is blocked. To unblock it, a named human must provide an appropriately
licensed Prince `license.dat` for an unwatermarked macOS fixture run and make a
real Ubuntu 24.04 x86_64 CI/container runtime reachable for the same verified
fixture. Both runs must pass qpdf and veraPDF `2a`/`ua1` before the human
accessibility-review and licence/rights gates can be considered separately.
