# WP92 — PDF Profile and Toolchain Decision Report

## Result

Blocked on the external first remote CI evidence run. The local/code remediation
uses RFC-008's Typst
0.15.0 under Apache-2.0 for the explicit combined `PDF/A-2a+PDF/UA-1`
profile. Canonical Markdown and Git remain the source authority; Typst is a
derived build intermediate in the immutable, disk-backed snapshot.

## Re-review remediation

- Added a canonical Markdown fixture, a fixture SVG asset, and the versioned
  deterministic `scripts/pdf-compatibility.mjs` Markdown-to-derived-Typst
  transformation. The generated Typst file stays inside the evidence staging
  snapshot and cannot become authored content.
- The common command verifies the exact Typst, Temurin Java, veraPDF launcher
  and main JAR, and Noto Serif executable/font hashes before rendering. It uses
  a clean disk-backed staging root, the exact `pnpm-lock.yaml` PDF.js parser,
  and both veraPDF profiles.
- Retained sanitized, inspectable evidence in
  `tests/fixtures/publishing/pdf/evidence/artifacts/`: PDF, the retained
  PDF.js parse/semantic report, veraPDF `2a`/`ua1` JSON reports, the
  source/derived snapshot, and a SHA-256 freshness manifest.
- Tests recalculate every retained artifact hash and inspect parser/profile
  evidence for title, `en-US`, tags, table/figure roles, alternative text,
  links, bookmarks, API-exposed font identifiers/families, and one page.
- Removed unused Ghostscript/ImageMagick locks. `pdfjs-dist` 5.4.624 records
  the exact pnpm integrity value and full lockfile SHA-256 provenance.
- GitHub Actions now uses the official `macos-15-intel` label and implements
  the identical `node scripts/pdf-compatibility.mjs` command after verified
  tool setup. It has no GHCR token/download dependency and uploads compatibility
  evidence with `always()` even when a validator fails. A remote workflow run remains to be recorded before
  remote CI evidence is considered complete.
- Restored an executed visual-regression check using Typst's locked native PNG
  raster at 144 PPI. The command retains its raster, baseline equality result,
  1191x1684 A4 geometry, one-page sample, and 40x20 SVG image-resolution
  evidence. The test suite checks overflow/clipping proxy fields and baseline
  equality.

## Exact local evidence command and result

```text
PDF_TYPST=/tmp/.../typst PDF_JAVA=/tmp/.../java PDF_VERAPDF=/tmp/.../verapdf \
PDF_VERAPDF_JAR=/tmp/.../greenfield-apps-1.28.2.jar \
PDF_FONT=/tmp/.../NotoSerif.ttf \
node scripts/pdf-compatibility.mjs
```

The command regenerates the retained manifest, parses with lockfile-pinned
`pdfjs-dist` 5.4.624, and passes veraPDF `2a` (153 rules, 7,201 checks) and
veraPDF `ua1` (106 rules, 1,642 checks), with
zero failed rules/checks. `node --test tests/pdf-toolchain.test.mjs` passes all
six tests; an earlier `pnpm test` passed 69 tests. Markdown, spelling, style, citation,
and link checks pass, with only the repository's existing transient external
network warnings from the link checker.

The latest full-suite attempt ran 71 tests: 69 passed; two pre-existing local
platform-server tests could not bind `127.0.0.1` in this sandbox (`EPERM`).
The focused PDF suite passed all six tests.

## Remaining gates

- Record the first remote `macos-15-intel` workflow compatibility run.
- Complete the named human VoiceOver and visual review for a release candidate.
- Confirm rights for actual release content and fonts.

## Third re-review remediation — 2026-07-28

- Hardened compatibility-output containment: every safe root is checked for
  symlinks, the environment root must be a child of an explicit trusted parent,
  and tests cover root, parent, traversal, nested symlink, and root-symlink
  rejection before deletion.
- Bound the fixed repository visual baseline path and SHA-256 into the retained
  manifest; tests recompute it and compare it to the visual report. CI has no
  baseline override.
- Added versioned JSON Schemas for the manifest, visual report, parser report,
  and veraPDF reports. The focused suite validates retained JSON before semantic
  assertions and includes a malformed visual-report negative case.
- Added a renderer-derived A5 negative raster fixture. Its retained dimensions
  differ from the production A4 baseline and the test asserts that the visual
  gate detects the geometry/overflow-clipping regression.

## Fourth re-review visual remediation — 2026-07-28

- Added a renderer-produced clipping fixture: a 200pt red rectangle is rendered
  onto a 100pt page and the retained PNG pixel scan proves its red bounds touch
  the rendered right edge (`maxX: 199`), which is the clipping detection.
- Added a renderer-produced altered-image fixture: a 4x2 red SVG is rendered
  and the retained PNG pixel scan measures a 6x3 rendered bound. The test
  rejects the production-size threshold, proving altered image dimensions are
  detected from rendered pixels rather than from a preset boolean.
- Added a strict schema for the retained pixel-measurement artifact and a
  rejecting negative test for missing derived bounds before semantic checks.

## PDF.js remediation — 2026-07-28

- Replaced the failed Homebrew qpdf 12.3.2 bottle with Apache-2.0
  `pdfjs-dist` 5.4.624, pinned by the pnpm lockfile integrity
  (`sha512-sm6TxKTtWv1Oh6n3C6J6a8odejb5uO4A4zo/2dgkHuC0iu8ZMAXOezEODkVaoVp8nX1Xzr+0WxFJJmUr45hQzg==`).
- The parser report retains successful parsing, page count, metadata/language,
  bookmarks, internal/external link annotations, tag/structure tree including
  table roles and figure alternative text, plus font identifiers and families
  where PDF.js exposes them. veraPDF remains the authoritative PDF/A/PDF/UA
  validator.
- Remote run `30323389374` failed only because the extracted qpdf dynamically
  linked Homebrew OpenSSL and could not resolve `_ERR_clear_error`; evidence
  artifact upload still succeeded. The next run is expected to avoid that
  native-library boundary because the common parser is the pnpm-installed
  package.
- On the replacement change, the retained evidence was regenerated locally;
  `node --test tests/pdf-toolchain.test.mjs` passed 6/6 and `pnpm test` passed
  71/71. Markdown lint and spelling checks also passed.
