# Book Authoring Workflow

This runbook explains how a beginner can add or revise a chapter without
breaking the manuscript contract.

## 1. Choose the Canonical Chapter

Open `books/volume-01-yc-playbook/table-of-contents.md`. Confirm the chapter
number, title, filename, reader decision, and required output. Do not invent a
new number or alternate title in the draft.

## 2. Review the Research Map

Open `books/volume-01-yc-playbook/research-map.md`, then read the referenced
entries in `references/source-registry.md`. Recheck a source before making a
time-sensitive claim. Add new primary sources to the registry first.

## 3. Create the Chapter

Copy `templates/chapter-template.md` to the canonical chapter filename. Replace
the example text; do not leave placeholders. Keep the founder decision and
worksheet output aligned with the canonical table of contents.

Required sections are:

- Learning Objectives
- Deep Dive
- AI Founder Interpretation
- Callouts
- Checklist
- Worksheet
- Key Takeaways
- Sources

A diagram is optional when prose or a short list is clearer. If included, use a
small Mermaid diagram and run the diagram check.

## 4. Mark Claim Types

- Attach a footnote to sourced external claims.
- Say “RTB Publishing synthesis” when connecting guidance into a new recommendation.
- Describe a founder-specific belief as an assumption to test.
- Label invented examples as hypothetical.
- Avoid legal, financial, medical, or regulatory instructions.

## 5. Run Focused Checks

```bash
CI=true pnpm check:book
CI=true pnpm check:markdown
CI=true pnpm check:spelling
CI=true pnpm check:style
CI=true pnpm check:links
CI=true pnpm check:diagrams
```

Fix the first reported error, rerun the failed command, and then run the full
suite before merging:

```bash
CI=true pnpm check
```

## 6. Build and Inspect

```bash
pnpm build
pnpm verify:outputs
```

Confirm the HTML, EPUB, and DOCX contain the expected title, chapter order,
worksheet tables, sources, and legible diagrams. A successful build is not an
editorial approval.

## 7. Record Review Truthfully

Do not claim beta reading, legal review, accessibility review, or publication
until it happened and has a review record. During drafting, use the book status
`Editorial Development`. Use `Internal Review` only when all 23 canonical
chapters exist. `Publication Candidate`, `Public Preview`, and `Published` also
require all canonical chapters and must follow the gates in the
[release-readiness checklist](../../books/volume-01-yc-playbook/release-readiness-checklist.md).
