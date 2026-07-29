# WP96 YC Semantic Migration Record

## Machine evidence

Status: `passed` for the deterministic semantic oracle when an independently
pinned pre-WP96 Git authority (`2938d43`) is discovered and compared against
the current generic Book Project. The report compares
title and metadata; part and chapter order; headings; paragraphs; lists;
tables; links; footnotes; callouts; worksheets; source references; diagrams;
assets; language; and normalized text content. Each row has base and migrated
SHA-256 hashes plus a required classification.

Reproduce the report:

```sh
node scripts/books/migrate-yc.mjs --before-commit 2938d43 --before-project books/volume-01-yc-playbook --after books/volume-01-yc-playbook
```

## Human visual review gate

Status: `awaiting-human-review`

Machine-generated representative and risky-page previews are evidence only.
A named human reviewer must compare the selected pages in source, HTML, PDF,
and EPUB; classify every finding; record resolutions and a decision here. This
review neither claims accessibility conformance nor approves legal or rights
status.

WP96 now provides the pipeline HTML and EPUB inputs. The required PDF review
artifacts remain a WP98 integration dependency because this project does not
yet declare or render a PDF output profile. No PDF review is implied or
approved until that integration produces hash-addressed artifacts.

| Reviewer | Date | Pages / formats compared | Findings | Decision |
| --- | --- | --- | --- | --- |
| _Awaiting assigned human reviewer_ | _—_ | _—_ | _—_ | `awaiting-human-review` |
