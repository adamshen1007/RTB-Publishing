# WP96 YC Semantic Migration Record

## Machine evidence

Status: `passed` for the deterministic semantic oracle when the canonical
project is compared with itself through generic discovery. The report compares
title and metadata; part and chapter order; headings; paragraphs; lists;
tables; links; footnotes; callouts; worksheets; source references; diagrams;
assets; language; and normalized text content. Each row has base and migrated
SHA-256 hashes plus a required classification.

Reproduce the report:

```sh
node scripts/books/migrate-yc.mjs books/volume-01-yc-playbook
node scripts/books/migration-review.mjs books/volume-01-yc-playbook build/migration-review/yc
```

## Human visual review gate

Status: `awaiting-human-review`

Machine-generated representative and risky-page previews are evidence only.
A named human reviewer must compare the selected pages in source, HTML, PDF,
and EPUB; classify every finding; record resolutions and a decision here. This
review neither claims accessibility conformance nor approves legal or rights
status.

| Reviewer | Date | Pages / formats compared | Findings | Decision |
| --- | --- | --- | --- | --- |
| _Awaiting assigned human reviewer_ | _—_ | _—_ | _—_ | `awaiting-human-review` |
