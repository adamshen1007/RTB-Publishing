# Volume 1 Release-Readiness Checklist

This checklist is the human source of truth for advancing the book from version
0.3.0 Publication Candidate to 0.9.0 Public Preview and then 1.0.0 Published.
Automation supplies evidence but cannot approve publication.

## Decision and Ownership

- [x] Record the decision to pursue public publication and its date.
- [x] Name *The RTB Publishing Playbook for AI Founders* as the public edition.
- [x] Define the 0.3.0, 0.9.0, and 1.0.0 release ladder.
- [x] Identify RTB Publishing as the independent publisher.
- [ ] Record the human preview approver and approval date.
- [ ] Record the human 1.0.0 approver and approval date.

## Rights, Brand, and Legal Review

- [x] Remove “YC” from the public title.
- [x] State that Y Combinator did not publish, sponsor, review, or endorse the
  book.
- [ ] Complete qualified review of the title, subtitle, cover, and promotional
  wording.
- [ ] Review every quotation and close any permission or fair-use finding.
- [ ] Review paraphrases and attribution against the current primary sources.
- [ ] Confirm the copyright owner and public rights statement.
- [ ] Confirm whether the book remains all rights reserved or adopts a separate
  content license.
- [ ] Record the rights-and-brand reviewer, date, scope, and outcome.

## Editorial and Evidence Review

- [x] Maintain one canonical 23-chapter table of contents.
- [x] Maintain a source registry and chapter research map.
- [ ] Complete substantive editing across all chapters.
- [ ] Complete copy editing and proofreading across all chapters.
- [ ] Recheck time-sensitive claims on the candidate date.
- [ ] Resolve unsupported, overstated, or ambiguously attributed claims.
- [ ] Record all findings and resolutions in the editorial review log.

## Beginner Review

- [ ] Recruit at least three representative first-time founder readers.
- [ ] Obtain consent for anonymized review notes.
- [ ] Ask each reader to complete one real chapter worksheet.
- [ ] Record comprehension, completion, confusion, and next-action evidence.
- [ ] Remove private company details from stored notes.
- [ ] Resolve every blocking beginner-review finding.

## Accessibility and Format Review

- [ ] Check logical heading order and descriptive titles.
- [ ] Check keyboard reading and navigation in HTML.
- [ ] Check link purpose, contrast, tables, and diagram text equivalents.
- [ ] Inspect EPUB navigation and accessibility metadata.
- [ ] Inspect DOCX headings, tables, links, and reading order.
- [ ] Test at least one screen reader or equivalent accessibility tool.
- [ ] Record exceptions, owners, and accepted residual limitations.

## Build and Release Evidence

- [ ] Run `CI=true pnpm check` on the exact release commit.
- [ ] Run `pnpm build` on the exact release commit.
- [ ] Run `pnpm verify:outputs` on the exact release commit.
- [ ] Inspect all generated formats manually.
- [ ] Confirm the title, version, status, rights, and publication date agree.
- [ ] Confirm download filenames use `rtb-publishing-playbook`.
- [ ] Create and complete the release manifest.
- [ ] Record the release commit and generated-file checksums.

## Public Preview Gate — 0.9.0

- [ ] Close every preview-blocking item above.
- [ ] Confirm the public page visibly says “Public Preview.”
- [ ] Confirm feedback instructions are visible and tested.
- [ ] Confirm analytics are absent or covered by a reviewed privacy notice.
- [ ] Record preview approval before deployment.
- [ ] Verify the deployed URL and downloads after deployment.

## Final Publication Gate — 1.0.0

- [ ] Complete the announced Public Preview review window.
- [ ] Triage every preview finding.
- [ ] Resolve all findings classified as blocking for 1.0.0.
- [ ] Recheck sources, legal scope, accessibility, and generated formats.
- [ ] Record accepted non-blocking limitations.
- [ ] Record explicit final publication approval.
- [ ] Publish and verify version 1.0.0 before announcing it as final.
