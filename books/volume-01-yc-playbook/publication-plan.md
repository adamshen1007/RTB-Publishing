# Volume 1 Publication Plan

## Decision

RTB Publishing approved the decision to pursue public publication on 2026-07-21.
This decision starts publication preparation; it does not assert that legal,
editorial, accessibility, or beginner review has occurred.

The public edition is titled *The RTB Publishing Playbook for AI Founders*. The
historical source-directory slug remains `volume-01-yc-playbook` to preserve
stable repository references. Public download filenames use
`rtb-publishing-playbook`.

## Reader and Promise

The primary reader is a first-time founder with an AI-enabled product idea who
has not established repeatable user value. The book helps that reader make and
record evidence-backed decisions during the first 90 days. It offers a decision
system, not a success, funding, or admission formula.

## Release Ladder

| Stage | Version | Meaning | Required approval |
| --- | --- | --- | --- |
| Publication Candidate | 0.3.0 | Repository preparation and human review | Decision to pursue publication |
| Public Preview | 0.9.0 | Clearly labeled public learning release | All preview blockers closed |
| Published | 1.0.0 | Final first edition | Preview findings resolved and final approval recorded |

Skipping directly from 0.3.0 to 1.0.0 is outside this plan. A version change
must update `book.md`, the release manifest, generated outputs, and the
changelog together.

## Publication Scope

The planned Public Preview includes:

- a static HTML reading experience;
- EPUB and DOCX downloads;
- six parts and 23 canonical chapters;
- checklists and worksheets;
- source attribution and the independence notice; and
- a public, privacy-conscious feedback path.

PDF, print distribution, payment, accounts, newsletters, tracking analytics,
and an ISBN are outside the initial preview unless separately approved. The
operational default is free access for the Public Preview. The publisher may
revise that decision before release and must record the change here.

## Rights and Independence Boundary

RTB Publishing is the publisher. Y Combinator is one of several cited sources and
did not publish, sponsor, review, or endorse the book. The publication must not
use Y Combinator logos or imitate its visual identity.

Repository source remains governed by the root license. The book currently
states all rights reserved. A different book-content license requires an
explicit owner decision and an updated rights statement before publication.

Qualified review remains necessary for the title, attribution, quotations,
paraphrases, disclaimers, and intended distribution. A disclaimer does not
replace rights clearance.

## Distribution Strategy

The launch follows an owned-first sequence:

1. Publish the canonical reading page and downloads at a stable RTB Publishing URL.
2. Collect feedback through a RTB Publishing-controlled repository process.
3. Use one or two external channels to point readers back to the canonical page.
4. Invite a small number of relevant communities or reviewers only after the
   owned page and feedback process work.

GitHub Pages is the planned preview host because the book is a static build.
Deployment remains manual until the preview approval gate is signed. Analytics
remain off by default; enabling them requires a documented privacy decision.

## Review and Change Control

All review findings must identify the chapter, section, problem, requested
change, reason, reviewer role, date, and resolution. Markdown remains the source
of truth. Generated files under `dist/` must never be edited directly.

The publisher closes a finding only after its source change is reviewed and the
focused checks pass. Publication approval cannot be inferred from a successful
automated build.

## Release Commands

Run these commands for every candidate:

```bash
CI=true pnpm check
pnpm build
pnpm verify:outputs
```

Then inspect the HTML, EPUB, and DOCX manually before completing the applicable
release manifest.

## Success Evidence

The Public Preview should collect evidence about:

- whether a beginner can select the right chapter;
- whether the worksheet produces a concrete decision;
- which passages cause confusion;
- which external claims need correction or stronger qualification;
- whether the formats work with common reading and assistive tools; and
- whether readers can report feedback without disclosing private company data.

Version 1.0.0 requires resolved blocking findings, not a promised traffic,
download, or revenue number.
