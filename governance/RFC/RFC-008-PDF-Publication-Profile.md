# RFC-008 — PDF Publication Profile

<!-- cspell:words PDF UA verapdf qpdf Ghostscript ImageMagick Noto YesLogic -->

## Status

Accepted for Increment 1 implementation on 2026-07-27. This acceptance is the
technical decision required by RFC-007. It does not record an accessibility
conformance determination, legal clearance, or a completed human review.

## Summary

This RFC amends [RFC-007](RFC-007-Research-to-Book-Publishing.md). Increment 1
PDF output targets the combined, versioned **PDF/A-2a + PDF/UA-1** profile:

- PDF/A-2a: ISO 19005-2:2011 archival conformance level a.
- PDF/UA-1: ISO 14289-1:2014 universal-accessibility profile.

The renderer is YesLogic Prince 16.2. The build requests
`PDF/A-2a+PDF/UA-1`; it does not infer a profile from defaults. The machine
gate separately runs veraPDF Greenfield 1.28.2 for `2a` and `ua1`, and uses
qpdf 12.3.2 to reject unreadable, encrypted, or malformed PDFs. Ghostscript
10.07.1 rasterizes selected pages and ImageMagick 7.1.2-24 compares the
resulting PNGs against reviewed visual baselines.

veraPDF runs only on the lock-owned Eclipse Temurin JRE 21.0.11+10. The lock
contains distinct verified JRE artifacts for macOS Intel, macOS Apple silicon,
and Ubuntu 24.04 x86_64; an ambient `java` command is not an accepted runtime.

The full, checksum-pinned input is
[toolchain.lock.json](../../publishing/pdf/toolchain.lock.json). That lock is
the only supported toolchain selection for Increment 1.

## Motivation

RFC-007 requires a named, versioned PDF accessibility and archival profile,
machine validation, fixtures, and a manual procedure before PDF renderer code
begins. A renderer's ability to emit tagged PDF is not a conformance result.
In particular, veraPDF states that its PDF/UA checks cover only machine
verifiable requirements; the human checks remain necessary.

The workflow must be usable by a beginner on a local Mac while remaining
repeatable in CI. It must also avoid silently changing layouts because a local
system has a different font or a missing glyph.

## Proposal

### Profile and renderer

Prince 16.2 is the selected local executable renderer. Its published profile
list includes `PDF/A-2a+PDF/UA-1`; the profile turns on tagged PDF, and its
documentation describes the related tag, font-embedding, Unicode-mapping, and
alternative-text requirements. The production invocation must be an argument
array equivalent to:

```text
prince input.html --output output.pdf --pdf-profile=PDF/A-2a+PDF/UA-1 \
  --pdf-lang=en-US --no-system-fonts --no-artificial-fonts \
  --fail-safe --structured-log=buffered
```

The future renderer wrapper adds the input stylesheet and fixed, lock-owned
font paths. It may not enable network fetches or substitute an executable,
profile, stylesheet, font, or command option without a lock and RFC update.
It renders only from a clean disk-backed staging directory, writes only to its
allocated output directory, and records the complete command (with no secrets)
and its structured log.

`--fail-safe` is deliberately required: it stops conversion for profile, tag,
missing-glyph, missing-resource, incorrect-reference, dropped-content, and
invalid-license failures. A build also fails on any warning in the structured
log; an allowlisted warning needs an approved, time-limited waiver.

### Supported platform boundary

Only these platforms are supported for a release-producing PDF run:

| ID | Role | Required artifact |
| --- | --- | --- |
| `macos-universal` | local creator workflow on Apple silicon or Intel Mac | Prince 16.2 macOS Universal ZIP |
| `ubuntu-24.04-x86_64` | GitHub Actions / CI workflow | Prince 16.2 Ubuntu 24.04 AMD64 DEB |

Each platform must pass the corresponding named compatibility fixture before
being used for a release. Windows, FreeBSD, other Linux distributions,
Linux ARM64, and macOS versions or architectures not covered by a passing
compatibility run are explicitly unsupported for Increment 1 release builds.
Their vendor packages, if any, are not acceptance evidence.

The same profile, fixtures, fonts, validation commands, and visual baselines
run locally and in CI. Platform-specific Prince package bytes are individually
locked because identical tool *versions* do not make package bytes identical.
PDF bytes are not required to be identical across the two supported platforms;
the normalized semantic and validation evidence must agree. A differing visual
baseline is a blocker unless a new reviewed baseline and a compatibility result
are committed with a toolchain change.

### Licensing and installation boundary

Prince is a proprietary renderer. Its vendor documents a free non-commercial
mode that adds a logo and a separate commercial site licence for commercial
server use. A human owner must obtain and document the licence that applies to
the intended use before a non-watermarked or CI release build runs. The licence
file is a secret: it is never committed, logged, copied into a fixture, or
included in a manifest. CI mounts it from its secret store into an ephemeral
path. This RFC makes no conclusion about licence sufficiency or font rights.

The beginner local setup downloads the exact macOS artifact, checks its SHA-256
against the lock, installs it in a user-writable directory, and runs `prince
--version`. CI checks the exact Ubuntu artifact before installation. veraPDF,
qpdf, Ghostscript, ImageMagick, and the Java runtime are similarly installed
from the lock-owned artifact or repository reference; package-manager `latest`
or an unpinned system copy fails the toolchain check.

### Validation roles

| Role | Tool and fixed version | Blocking result |
| --- | --- | --- |
| renderer | Prince 16.2 | non-zero exit or any structured-log warning |
| Java runtime | Eclipse Temurin JRE 21.0.11+10 | missing, wrong-version, or checksum-mismatched runtime |
| structural validator | veraPDF Greenfield 1.28.2, `--flavour ua1` | any machine-verifiable PDF/UA-1 failure |
| archival-profile validator | veraPDF Greenfield 1.28.2, `--flavour 2a` | any PDF/A-2a failure |
| parser / integrity check | qpdf 12.3.2 | failed `--check`, encryption, bad signature, or unreadable page tree |
| visual regression | Ghostscript 10.07.1 plus ImageMagick 7.1.2-24 | changed selected-page PNG outside an approved baseline |

The validator reports are retained in the ignored release evidence directory
and their SHA-256 values enter the candidate envelope. A validator passing does
not mark the PDF as conformant or replace the manual review.

### Content contract

The renderer input is semantic HTML with one document language. Increment 1
supports `en-US` only; a project that declares another language or contains a
language override fails before rendering until this RFC and the font coverage
matrix are extended.

- The HTML `lang`, the fixed `--pdf-lang`, title, author, subject, keywords,
  creator, and profile metadata must agree with the project metadata. Creation
  and modification dates follow RFC-007 reproducibility policy and are
  normalized in comparisons rather than invented.
- Semantic headings map to H1–H6 in source order. Lists, paragraphs, tables,
  captions, notes, links, and figures retain their native semantic HTML. CSS
  role overrides are permitted only where the fixture proves the result.
- A meaningful figure needs non-empty author-supplied alternative text; a
  decorative figure is explicitly marked as an artifact. Images without one of
  those classifications fail. The PDF structure order follows source order;
  visual positioning must not be used to imply reading order.
- Data tables require a caption and scoped header cells. Complex tables that
  cannot be expressed with this contract are blocked pending a tested semantic
  mapping and human review.
- Internal links resolve to existing IDs, external links use allowed URLs, and
  all headings at configured levels produce linked bookmarks. The fixture
  checks bookmarks, destinations, and both link types.
- The only permitted body face is the locked Noto Serif variable TTF loaded by
  `@font-face`. System fonts and artificial bold/italic are disabled. CSS uses
  `prince-no-fallback`; missing glyph, missing font, or substitution warnings
  fail the build. The rendered PDF must embed the approved font and map text to
  Unicode.

### Waivers

A waiver never turns a failed PDF into a passing PDF automatically. It is
valid only for a precisely named non-profile warning or visual comparison that
has no PDF/UA-1, PDF/A-2a, integrity, security, missing-glyph, or unresolved
accessibility finding. Every waiver must be a versioned record containing:

- the release candidate hash, fixture or page scope, validator/tool version,
  exact finding, risk, and proposed mitigation;
- a named human approver and approval date;
- an expiry date no more than 30 calendar days after approval; and
- a remediation owner and issue/reference.

An expired, unscoped, unsigned, changed-candidate, or broad class waiver is
invalid. The example fixture is a schema example only, not an approval.

## Alternatives Considered

| Candidate | Decision | Reason |
| --- | --- | --- |
| Prince 16.2 with combined profile | selected | The vendor documents the exact combined profile, tagged-PDF behaviour, macOS Universal and Ubuntu 24.04 packages, and fail-safe options. |
| Browser print pipeline | not selected | It was not accepted because this RFC has no provider evidence that a chosen browser build produces and validates the selected combined profile. |
| A renderer without an explicit combined-profile claim | not selected | It was not accepted because tagged output alone is insufficient evidence for the RFC-007 prerequisite. |
| Hosted conversion service | not selected | It would add content egress and credentials to a local, offline rendering boundary; no exception was proposed. |

## Risks

- The renderer's licence is a material procurement and legal dependency. A
  missing or inappropriate licence blocks PDF release generation.
- veraPDF's PDF/UA coverage is machine-only. A passing report cannot support a
  statement that human accessibility evidence has passed.
- Font coverage is intentionally narrow. Unsupported scripts, unclassified
  figures, complex tables, and unreviewed layouts block rather than degrade.
- Rendering engines can differ across operating systems. The restricted
  platform matrix, deterministic fixture inputs, and visual baselines contain
  that risk but do not prove portability beyond those runs.

## Acceptance Criteria

- [x] The selected profile, renderer, validators, parser, fonts, visual method,
  supported platforms, and manual procedure are named and versioned.
- [x] Tool and font artifacts have a SHA-256 or exact repository-lock reference.
- [x] Compatibility fixtures exist for both supported platforms and are checked
  by the repository test suite.
- [ ] Compatibility evidence passes on both supported platforms. The recorded
  macOS demo run is blocked by its watermark and the Ubuntu 24.04 runtime was
  unavailable; see the evidence fixtures for exact findings.
- [x] The manual review procedure and waiver record fields are versioned.
- [ ] A named reviewer records a passing screen-reader and visual review for a
  specific candidate. This remains a human evidence gate.
- [ ] A named rights/licensing reviewer records the applicable Prince and font
  evidence for a specific release. This remains a human evidence gate.

## Implementation Plan

1. WP98 implements the fixed-argument, no-network, disk-backed renderer and
   verifier only from this lock.
2. The CI and local setup scripts verify artifact bytes before installation and
   run each compatibility fixture on its listed platform.
3. Each candidate captures parser, validator, font, link, bookmark, metadata,
   and visual reports; failure prevents a release candidate.
4. A named person completes
   [the PDF review procedure](../../docs/05-operations/pdf-accessibility-review.md)
   and attaches the completed record to the candidate evidence.

## Sources

- [Prince PDF output and profiles](https://www.princexml.com/doc/prince-output/) — profile combinations, tags, fonts, metadata, and links.
- [Prince 16.2 downloads](https://www.princexml.com/download/16/) — macOS Universal and Ubuntu 24.04 artifacts.
- [Prince command-line options](https://www.princexml.com/doc-refs/) — locked fail-safe and font controls.
- [Prince licence FAQ](https://www.princexml.com/purchase/license_faq/) — vendor licence descriptions; not legal advice.
- [veraPDF validation](https://docs.verapdf.org/validation/) and [CLI validation profiles](https://docs.verapdf.org/cli/validation/) — PDF/A-2a and PDF/UA-1 validation flavours and machine-only PDF/UA scope.
- [veraPDF 1.28.2 download archive](https://software.verapdf.org/releases/1.28) — locked Greenfield installer artifact.
- [Eclipse Temurin 21.0.11+10 release](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.11%2B10) — locked macOS and Ubuntu JRE artifacts.
- [qpdf 12.3.2 release](https://github.com/qpdf/qpdf/releases/tag/v12.3.2) — parser release and signed checksum manifest.
- [Ghostscript releases](https://ghostscript.com/releases/) and [Ghostscript FAQ](https://ghostscript.com/faq/index.html) — PDF rasterizer release and PNG rendering use.
- [ImageMagick compare](https://imagemagick.org/compare/) — pixel-comparison command semantics.
