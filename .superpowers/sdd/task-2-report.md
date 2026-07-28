# WP92 — PDF Profile and Toolchain Decision Report

## Result

Completed with a pending remote CI evidence sub-gate. RFC-008 selects Typst
0.15.0 under Apache-2.0 for the explicit combined `PDF/A-2a+PDF/UA-1`
profile. Canonical Markdown and Git remain the source authority; Typst is a
derived build intermediate in the immutable, disk-backed snapshot.

## Re-review remediation

- Added a canonical Markdown fixture, a fixture SVG asset, and the versioned
  deterministic `scripts/pdf-compatibility.mjs` Markdown-to-derived-Typst
  transformation. The generated Typst file stays inside the evidence staging
  snapshot and cannot become authored content.
- The common command verifies the exact Typst, Temurin Java, veraPDF launcher
  and main JAR, qpdf, and Noto Serif executable/font hashes before rendering.
  It uses a clean disk-backed staging root, qpdf, and both veraPDF profiles.
- Retained sanitized, inspectable evidence in
  `tests/fixtures/publishing/pdf/evidence/artifacts/`: PDF, QDF parser view,
  qpdf integrity/outline/page reports, veraPDF `2a`/`ua1` JSON reports, the
  source/derived snapshot, and a SHA-256 freshness manifest.
- Tests recalculate every retained artifact hash and inspect parser/profile
  evidence for title, `en-US`, tags, table/figure roles, alternative text,
  links, bookmarks, Noto embedding, and one page.
- Removed unused Ghostscript/ImageMagick locks. qpdf now records the exact
  verified macOS bottle plus installed executable hash.
- GitHub Actions now uses the official `macos-15-intel` label and implements
  the identical `node scripts/pdf-compatibility.mjs` command after verified
  tool setup. A remote workflow run remains to be recorded before remote CI
  evidence is considered complete.

## Exact local evidence command and result

```text
PDF_TYPST=/tmp/.../typst PDF_JAVA=/tmp/.../java PDF_VERAPDF=/tmp/.../verapdf \
PDF_VERAPDF_JAR=/tmp/.../greenfield-apps-1.28.2.jar \
PDF_QPDF=/usr/local/Cellar/qpdf/12.3.2/bin/qpdf PDF_FONT=/tmp/.../NotoSerif.ttf \
node scripts/pdf-compatibility.mjs
```

The command regenerated the retained manifest and passed qpdf, veraPDF `2a`
(153 rules, 7,201 checks), and veraPDF `ua1` (106 rules, 1,642 checks), with
zero failed rules/checks. `node --test tests/pdf-toolchain.test.mjs` passes all
four tests; `pnpm test` passes 69 tests. Markdown, spelling, style, citation,
and link checks pass, with only the repository's existing transient external
network warnings from the link checker.

## Remaining gates

- Record the first remote `macos-15-intel` workflow compatibility run.
- Complete the named human VoiceOver and visual review for a release candidate.
- Confirm rights for actual release content and fonts.
