# Acceptance Workflow Fix Plan

## Goal

Make the three human release reviews and the Beta/Publish lifecycle executable
without self-referential fingerprints, fabricated hashes, or direct browser
file writes.

## Global constraints

- Markdown remains canonical publication content.
- Human decisions are durable local evidence, not canonical manuscript input.
- Review records bind the exact source fingerprint and HTML, PDF, and EPUB
  artifact hashes resolved by the server from a registered candidate.
- Browser requests cannot author hashes, reviewer identities, candidates, or
  lifecycle bindings.
- Beta preparation derives hashes from a complete, current Notion sync receipt
  and a server-created policy result; missing or stale Notion state blocks it.
- Rights approval requires a truthful, non-empty qualified reviewer role.
- Publish remains bound to a release-eligible candidate created at the current
  post-Beta lifecycle version.
- Existing approval, capability rotation, path, and loopback security controls
  remain in force.

## Task 1 — Durable release-review evidence boundary

1. Amend RFC-007 and ADR-012 to place release review evidence in durable local
   state outside the canonical source fingerprint.
2. Add a migration and review store/service for the three fixed review kinds.
3. Resolve all hashes and the human actor on the server.
4. Make release policy evaluation read exact current review evidence.
5. Add stale, wrong-candidate, rights-role, and self-reference regression tests.

## Task 2 — Guided Beta preparation and Creator Studio controls

1. Add a deterministic Beta preparation service that validates the private
   Notion sync receipt against all canonical chapters.
2. Generate the Beta snapshot and policy-result hashes on the server.
3. Add authenticated local API routes and guided Creator Studio actions for
   the three reviews, Beta preparation, Beta approval, and Publish approval.
4. Show actionable blocked-state guidance; remove manual hash entry.
5. Add route, capability, stale-state, and browser-authority tests.

## Task 3 — End-to-end acceptance and operations

1. Exercise Blueprint approval, review recording, candidate rebuild, Beta
   preparation/approval, release-eligible current-version candidate, Publish
   approval, and immutable manifest creation in an isolated fixture.
2. Document the beginner workflow and exact rebuild boundary.
3. Run focused tests, the full test suite, quality gates, and an independent
   final branch review.
4. Commit locally; do not push without a separate explicit choice.
