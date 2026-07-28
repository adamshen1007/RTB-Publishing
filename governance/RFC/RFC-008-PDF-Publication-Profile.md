# RFC-008 — PDF Publication Profile

<!-- cspell:words Typst verapdf qpdf Ghostscript ImageMagick Noto -->

## Status

Accepted for Increment 1 implementation on 2026-07-28. This supersedes the
2026-07-27 Prince selection in this RFC because it imposed a paid, proprietary
licence boundary. It is the technical decision required by RFC-007; it does
not record a legal conclusion or a completed human accessibility review.

## Summary

Increment 1 targets the combined, versioned **PDF/A-2a + PDF/UA-1** profile:

- PDF/A-2a: ISO 19005-2:2011 archival conformance level a.
- PDF/UA-1: ISO 14289-1:2014 universal-accessibility profile.

The selected renderer is **Typst 0.15.0**, an Apache-2.0 open-source compiler.
The locked command requests both standards explicitly with
`--pdf-standard=a-2a,ua-1`; it does not infer them from defaults. Typst's
official documentation states that compatible PDF/A and PDF/UA standards can
be combined, and that PDF/UA export enables additional checks.

The machine gate uses veraPDF Greenfield 1.28.2 separately for `2a` and
`ua1`, qpdf 12.3.2 to reject malformed or encrypted PDFs, and the locked
Ghostscript/ImageMagick visual comparison path. The exact artifacts, runtimes,
fonts, command arguments, checksums, and repository locks are in
[toolchain.lock.json](../../publishing/pdf/toolchain.lock.json).

## Motivation

RFC-007 requires a named, versioned archival and accessibility profile,
machine validation, semantic fixtures, and a manual procedure before PDF
renderer code begins. Tagged output is not a conformance result. In particular,
veraPDF's PDF/UA checks cover only machine-verifiable requirements; human
review remains required.

The prior selected renderer depended on a paid proprietary licence. That
licence boundary is incompatible with the requested no-paid-licence workflow.
This decision replaces it with an open-source renderer and records a passing
local prototype rather than treating vendor capability claims as sufficient.

## Proposal

### Renderer, inputs, and reproducibility

Typst 0.15.0 is the selected local executable renderer. It compiles local,
semantic Typst source in a disk-backed staging directory; rendering does not
fetch network resources. The production wrapper must invoke an argument array
equivalent to:

```text
typst compile input.typ output.pdf --root staging --font-path locked-fonts \
  --ignore-system-fonts --ignore-embedded-fonts \
  --creation-timestamp 1785196800 --pdf-standard=a-2a,ua-1 \
  --diagnostic-format=short
```

The wrapper may not substitute an executable, profile, font, package cache,
stylesheet/template, or command argument without an RFC and lock update. It
must use a clean disk-backed staging directory, an empty package cache, and an
allocated output directory; it must retain the complete secret-free command
and diagnostic output. A non-zero compiler result, an unresolved resource, or
any diagnostic is blocking. The build must run offline after explicit setup.

The fixed creation timestamp makes compatibility-fixture metadata
reproducible. Release candidates use the project-approved source-date epoch;
changing it is a release-input change, not a post-processing step. PDF bytes
are not required to be identical across architectures, but the locked source,
semantic checks, validator results, and reviewed visual baseline must agree.

### Supported platform boundary

The only current release-producing platform is `macos-x86_64`, verified by the
recorded local compatibility run on Darwin 24.6.0. Windows, Linux, and macOS
ARM64 are not currently release-producing platforms.

The repository's existing GitHub Actions label is `macos-14`, which GitHub
documents as ARM64. Its exact Typst and Temurin artifacts are checksum-pinned
in the lock so CI can exercise the same setup, but no ARM64 compatibility
evidence has been recorded. It is therefore a CI boundary, **not** a supported
release platform. A passing recorded fixture run is required before promoting
it. Ubuntu 24.04 is not retained as an aspirational platform.

### Licensing and installation boundary

Typst is Apache-2.0 and needs no paid renderer licence or secret licence file.
The lock is nevertheless not a legal conclusion about the Noto Serif font or
other content. The setup step downloads the exact architecture artifact,
recalculates its SHA-256, installs it in a user-writable directory, and checks
`typst --version`. It repeats that verification for veraPDF, the pinned Temurin
JRE, qpdf, rasterizer, comparator, and font before use. Package-manager
`latest` or an unpinned system copy is not an accepted release tool.

### Validation roles

| Role | Tool and fixed version | Blocking result |
| --- | --- | --- |
| renderer | Typst 0.15.0 | non-zero exit or any diagnostic |
| Java runtime | Eclipse Temurin JRE 21.0.11+10 | missing, wrong-version, or checksum-mismatched runtime |
| structural validator | veraPDF Greenfield 1.28.2, `--flavour ua1` | any machine-verifiable PDF/UA-1 failure |
| archival-profile validator | veraPDF Greenfield 1.28.2, `--flavour 2a` | any PDF/A-2a failure |
| parser / integrity check | qpdf 12.3.2 | failed `--check`, encryption, bad signature, or unreadable page tree |
| visual regression | Ghostscript 10.07.1 plus ImageMagick 7.1.2-24 | changed selected-page PNG outside an approved baseline |

Reports stay in the ignored candidate-evidence directory; their SHA-256 values
enter the candidate envelope. A passing report does not by itself establish
accessibility conformance.

### Content contract

Increment 1 source is semantic Typst, with document language `en-US` and
document metadata set in `#set document`. An upstream Markdown-to-Typst
transformation is outside this RFC and must be separately versioned and tested
before it becomes a release input.

- Document title, author, keywords, language, and fixed date must agree with
  project metadata. Headings, lists, paragraphs, figures, tables, captions,
  and links must use Typst's semantic elements in source order.
- Meaningful figures require non-empty author-supplied alternative text.
  Decorative content is wrapped in `pdf.artifact`. Visual positioning cannot
  imply reading order.
- Data tables use table header cells; complex tables require a tested semantic
  mapping and human review before release. The compatibility fixture covers a
  simple header/data table, figure, lists, internal/external links, heading,
  outline/bookmark, metadata, and alternative text.
- All headings at configured levels produce linked outline entries. Internal
  links resolve to existing labels; external links use allowed URLs.
- The only permitted face is the checksum-pinned Noto Serif variable font.
  `--font-path` contains only lock-owned fonts and both system and embedded
  fonts are ignored. A font-resolution or missing-glyph diagnostic blocks the
  build. The candidate evidence must confirm embedded approved fonts and
  Unicode text mapping.

### Waivers

A waiver never turns a failed PDF into a pass. It is valid only for a precisely
named non-profile warning or visual difference that has no PDF/A-2a, PDF/UA-1,
integrity, security, missing-glyph, or unresolved accessibility finding. It
must identify the candidate hash, scope, tool version, exact finding, risk,
mitigation, named human approver/date, expiry no later than 30 days, and a
remediation owner/reference. An expired, unsigned, changed-candidate, or broad
class waiver is invalid.

## Alternatives Considered

| Candidate | Decision | Reason |
| --- | --- | --- |
| Typst 0.15.0 | selected | Open-source Apache-2.0 renderer with official combined compatible PDF/A and PDF/UA support; the fixture passed both locked veraPDF profiles locally. |
| WeasyPrint 69.0 | not selected | Its official documentation exposes PDF/A and PDF/UA variants but does not establish the required combined profile in one export. |
| LibreOffice headless | not selected | Its documentation describes PDF/UA export, but this decision found no official combined PDF/A-2a + PDF/UA-1 export claim or passing fixture evidence. |
| Prince 16.2 | superseded | It has the combined profile but is proprietary and requires a paid commercial licence for the intended non-watermarked workflow. |
| Browser print pipeline / hosted conversion | not selected | Neither supplied an offline, checksum-pinned renderer with evidence for the exact combined profile. |

## Prototype Evidence

On 2026-07-28, the locked Typst x86_64 macOS artifact compiled the semantic
fixture with only the locked Noto Serif font and the required profile flags.
qpdf 12.3.2 reported no syntax or stream-encoding errors and no encryption.
veraPDF 1.28.2 passed `2a` with 153 rules / 7,174 checks and `ua1` with 106
rules / 1,642 checks, with zero failed rules and checks. Poppler rendered the
one-page result for visual inspection; no layout or glyph defect was found.
The recorded hashes and full commands are in the evidence fixture. This is
machine prototype evidence, not a completed screen-reader review.

## Risks

- Typst and validator conformance checks do not replace the required human
  VoiceOver and visual review.
- The current release platform is deliberately narrow. CI's ARM64 runner is
  locked but remains unverified and cannot release PDF candidates.
- Font coverage is deliberately narrow. Unsupported scripts, missing glyphs,
  unclassified figures, complex tables, and unreviewed layouts block rather
  than degrade.
- This RFC does not authorize an unpinned Markdown conversion tool or package.

## Acceptance Criteria

- [x] The combined profile, open-source renderer, validators, parser, fonts,
  visual method, platform boundary, and manual procedure are named/versioned.
- [x] Tool and font artifacts have SHA-256 values or an exact repository lock.
- [x] The `macos-x86_64` semantic fixture passed Typst, qpdf, veraPDF `2a`,
  and veraPDF `ua1`; recorded evidence includes artifact/report hashes.
- [ ] GitHub Actions `macos-14` ARM64 compatibility evidence is required before
  that CI runner can produce release candidates.
- [x] The manual procedure and waiver fields are versioned.
- [ ] A named reviewer records a passing screen-reader and visual review for a
  specific candidate. This remains a human evidence gate.
- [ ] A named rights reviewer confirms rights for actual release content and
  fonts. This remains separate from the open-source renderer licence.

## Implementation Plan

1. WP98 implements only the fixed-argument, offline, disk-backed renderer and
   verifier defined by this lock.
2. Setup verifies artifact bytes before installation; each promoted platform
   must record the exact fixture result before release use.
3. Each candidate captures compiler diagnostics, parser, validator, font,
   link, bookmark, metadata, and visual reports.
4. A named person completes [the PDF review procedure](../../docs/05-operations/pdf-accessibility-review.md)
   and attaches the completed record to candidate evidence.

## Sources

- [Typst PDF reference](https://typst.app/docs/reference/pdf/) — command-line standards, compatible PDF/A + PDF/UA combinations, semantic-tagging and accessibility checks.
- [Typst accessibility guide](https://typst.app/docs/guides/accessibility/) and [document metadata reference](https://typst.app/docs/reference/model/document/) — semantic/content and title/date requirements.
- [Typst 0.15.0 release notes](https://typst.app/docs/changelog/0.15.0/) and [source repository licence](https://github.com/typst/typst) — selected version and Apache-2.0 licence.
- [WeasyPrint API reference](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html) and [LibreOffice PDF/UA help](https://help.libreoffice.org/latest/gu/text/shared/01/ref_pdf_export_universal_accessibility.html) — alternatives examined.
- [veraPDF validation](https://docs.verapdf.org/validation/) and [CLI validation profiles](https://docs.verapdf.org/cli/validation/) — PDF/A-2a and PDF/UA-1 validation flavours and machine-only PDF/UA scope.
- [veraPDF 1.28.2 archive](https://software.verapdf.org/releases/1.28), [Temurin 21.0.11+10 release](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.11%2B10), and [qpdf 12.3.2 release](https://github.com/qpdf/qpdf/releases/tag/v12.3.2) — locked validation/runtime/parser artifacts.
- [GitHub-hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) — `macos-14` ARM64 boundary.
