# Task 2 Report — Guided Beta Preparation and Creator Studio Controls

## Design

- Added a deterministic Beta preparation boundary that reads only the fixed
  Git-ignored Notion receipt, validates every canonical chapter ID/hash, and
  blocks with specific missing, malformed, or stale guidance.
- Beta snapshot material excludes private Notion identifiers. The server hashes
  normalized canonical chapter material and a deterministic passed policy result,
  then registers both hashes with a server-created human-session reviewer ID.
- Added direct-loopback, same-origin, exact-JSON, bootstrapped-session routes for
  Beta preparation and the three fixed reviews. CSRF/capability pairs rotate on
  authenticated actions, and browser-authored bindings, hashes, candidates, and
  reviewer identities are rejected.
- Release review routes instantiate Task 1's `ReleaseReviewService`, which resolves
  the latest registered candidate, exact artifact hashes, and reviewer actor on
  the server. Both approved and rejected decisions are durable.
- Creator Studio now shows durable current-candidate review state, blocked repair
  guidance, Beta preparation, Beta approval, Publish approval, and all three review
  controls. Rights approval labels the qualified role as a human declaration.
  Manual Beta hash prompts and the old browser-authored evidence route were removed.

## Files

- `scripts/lifecycle/beta-preparation.mjs`
- `scripts/platform/server.mjs`
- `scripts/publishing/release-review-service.mjs`
- `platform/web/index.html`
- `platform/web/app.js`
- `platform/web/styles.css`
- `tests/beta-preparation.test.mjs`
- `tests/platform-lifecycle.test.mjs`
- `specs/009-notion-sync-spec.md`
- `docs/05-operations/notion-editorial-workspace.md`

## Tests

- Focused/covering: 32 passed, 0 failed.
- Full suite: 138 passed, 0 failed.
- Targeted Markdown lint: 0 errors.
- Targeted spelling: 0 issues.
- JavaScript syntax checks and `git diff --check`: passed.

## Output

The Creator Studio workflow is executable without browser-authored hashes or
reviewer identities. Missing or stale Notion state blocks Beta preparation;
current state creates exact server-side bindings. Review status is durable and
candidate-bound, including rejected outcomes and the rights-role declaration.

## Commit

`55bc1b2` — `feat: guide secure publication approvals`

## Concerns

None known. The full end-to-end rebuild and immutable-manifest exercise remains
Task 3 by plan.

## Fixes / Review Follow-up

Independent review found that the original browser controls displayed one
candidate or lifecycle material set but allowed the server to resolve a newer
set at click time. The follow-up closes both time-of-review/time-of-use gaps:

- Workspace status now issues session-bound opaque one-time intents. A release
  review intent binds the displayed server-resolved candidate hash; Beta and
  Publish intents bind both lifecycle version and a stable hash of the exact
  resolved lifecycle bindings. The browser echoes only the opaque intent.
- The Creator Studio displays the server-resolved candidate identity prefix and
  refreshes current guidance after a stale `409` response.
- `ReleaseReviewService` compares the intent's server-side expectation with the
  current candidate, while the append transaction rechecks the latest candidate
  before writing. A replacement candidate therefore cannot inherit an unseen
  review decision.
- Lifecycle approval acquires its lease, starts an immediate SQLite transaction,
  then re-resolves and compares the exact Beta or Publish material before writing
  the approval. Canonical binding resolution and release-policy reads share that
  transaction's database connection, fencing concurrent Beta registration,
  candidate registration, and review changes until the decision commits.
- Added two-tab regressions for release-candidate rollover, Beta binding rollover,
  and Publish candidate/material rollover. Each stale action returns `409` and
  leaves the previous lifecycle/review state unchanged.

Follow-up verification: focused 12 passed, 0 failed; full suite 138 passed,
0 failed. The follow-up is committed as `fix: bind approvals to displayed material`.
