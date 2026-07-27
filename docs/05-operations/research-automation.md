# Research Automation

## What It Does

RTB Publishing turns structured YAML research records into a cited Markdown brief.
It validates provenance and freshness locally. It does not scrape websites,
decide whether a claim is true, or replace human source review.

## Understand the Records

```text
Claim -> Evidence -> Source
```

- A source records public metadata and a canonical URL.
- Evidence stores a short quote, paraphrase, or internal observation with a
  locator.
- A claim states what RTB Publishing may publish and labels its classification,
  confidence, limitations, and review status.
- The topic manifest controls the research question, minimum source count,
  freshness window, review date, and approval state.

## Create a Topic

```bash
pnpm rtb-publishing research create ai-onboarding-validation \
  --title "AI Onboarding Validation" \
  --question "Which onboarding problem should this product solve first?" \
  --owner "Your Name" \
  --as-of "2026-07-13" \
  --minimum-sources 5 \
  --freshness-days 180
```

This creates `research/topics/ai-onboarding-validation/research.yaml` and empty
record directories. The topic will not validate until it reaches the configured
minimum source count.

## Add a Source

```bash
pnpm rtb-publishing research add-source \
  research/topics/ai-onboarding-validation/research.yaml \
  --id SRC-001 \
  --type official-guidance \
  --source-class primary \
  --title "Public source title" \
  --author "Author name" \
  --publisher "Publisher name" \
  --url "https://example.com/canonical-page" \
  --published "2026-01-15" \
  --accessed "2026-07-13" \
  --summary "Why this source is relevant." \
  --license-note "Metadata and paraphrased notes only."
```

Use `--dry-run` to preview and `--force` only to replace a reviewed source
record deliberately.

## Record Evidence and Claims

Copy the shape of records in
`research/topics/customer-validation-before-mvp/`. Use the next stable IDs:

- Sources: `SRC-NNN`
- Evidence: `EVD-NNN`
- Claims: `CLM-NNN`

Classify claims as `sourced-fact`, `source-opinion`, `synthesis`, `assumption`,
or `observation`. Synthesis requires evidence from two distinct sources.
Assumptions must not cite evidence. Stored quotations require a locator and may
not exceed 25 words.

## Validate and Build

```bash
pnpm rtb-publishing research validate research/topics/ai-onboarding-validation/research.yaml
pnpm rtb-publishing research status research/topics/ai-onboarding-validation/research.yaml
pnpm rtb-publishing research build research/topics/ai-onboarding-validation/research.yaml --dry-run
pnpm rtb-publishing research build research/topics/ai-onboarding-validation/research.yaml
```

Generated briefs are protected by a deterministic hash. RTB Publishing stops if a
human has edited the generated brief. Move valuable edits into YAML records or
another user-owned document before using `--force`.

## Refresh Sources

After manually reopening and reviewing every source, advance their access dates
and the topic review date together:

```bash
pnpm rtb-publishing research refresh \
  research/topics/ai-onboarding-validation/research.yaml \
  --as-of "2026-10-01" \
  --dry-run
```

Remove `--dry-run` only after confirming that every source was actually checked.
Then rebuild and review the brief.

### Quarterly Refresh Checklist

1. Open every canonical source and confirm its author, title, and publication
   metadata.
2. Update or reject evidence whose source meaning changed.
3. Review proposed, accepted, rejected, and contradictory claims.
4. Preview `research refresh` with the quarter-end date.
5. Apply the refresh, rebuild the brief, and inspect the Git diff.
6. Record human approval only after limitations and stale-source results are
   reviewed.

## Quality Commands

```bash
pnpm test:research
pnpm check:research
pnpm check
```

`check:research` validates the example provenance graph and fails if its
generated brief has drifted.
