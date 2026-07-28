# Increment 1 acceptance report

**Evaluation date:** 2026-07-28

**Branch:** `codex/increment-1-wp91-wp98-plan`

**Automated decision:** Pass

**Release decision:** No-go until named manual reviews and exact Publish approval

## Renderer decision

Prince was reassessed and removed from the Increment 1 path. The selected
provider-neutral toolchain is Pandoc plus pinned Typst 0.15.0, PDF.js 5.4.624,
and veraPDF Greenfield 1.28.2. No paid renderer licence or secret is required.

## Automated evidence

- Repository tests: 141/141 passed in the final local quality run.
- Real YC candidate: HTML, 60-page PDF, and EPUB built from one fingerprint.
- PDF/A-2a: compliant, zero failed rules and checks.
- PDF/UA-1: compliant, zero failed rules and checks.
- Semantic parity: all 23 ordered canonical chapters and at least 98.5% of
  normalized canonical tokens are present in HTML, PDF, and EPUB; link, table,
  figure, footnote, and official W3C EPUBCheck 5.3.0 checks passed. Unsafe
  markup and URL regression fixtures fail closed.
- Reproducibility: two clean post-commit builds must produce the same candidate
  hash. The hash stays in generated release evidence rather than this tracked
  file, avoiding a self-referential commit/hash cycle.
- Resource proof: the complete release pipeline consumed and hash-bound a
  536,870,912-byte fixture in 8,388,608-byte maximum chunks; the complete
  descendant process tree increased by 355,008,512 bytes against
  the reassessed 402,653,184-byte aggregate ceiling. The streaming stage
  increased by 108,347,392 bytes against its 134,217,728-byte ceiling.
- Audit reconstruction: the candidate retains the normalized source bundle,
  its file hashes, and the exact Git revision and tree.
- Failure controls: candidate/manifest drift, extra artifacts, stale approval,
  pre-approval manifest creation, and release-ID reuse fail closed in tests.
- Workflow acceptance: an isolated fixture exercises the real durable
  Blueprint, review, Notion receipt, Beta, post-Beta rebuild, Publish, manifest,
  and single-use release-identity boundaries. The fixture creates no production
  approval, Notion receipt, or manifest.
- Future staging is an unreserved `future-staging:` reference with no authority
  or activation claim.

The candidate hash changes whenever any fingerprinted source, template,
configuration, transformer, tool lock, or policy input changes. A recorded
value is evidence for one evaluation, not a standing Publish authorization.

## Manual and external gates

| Gate | Owner | Status |
| --- | --- | --- |
| YC migration visual review | Named editor/creator | Pending |
| PDF screen-reader and visual review | Named reviewer | Pending |
| Rights and brand review | Qualified reviewer/creator | Pending |
| Blueprint approval | Creator | Must be current before material mutation |
| Beta approval | Creator | Pending real candidate review |
| Publish approval | Creator | Pending exact final candidate hash |
| Hosted subscriber activation | Future increment | Not attempted |

No final immutable release manifest was generated, no approval was fabricated,
and no Ghost or subscriber-library activation is claimed.

The automated workflow proof does not change the manual gate statuses above.
Use the
[beginner publication approval procedure](beginner-publication-approval.md)
to complete those decisions on the real candidate.
