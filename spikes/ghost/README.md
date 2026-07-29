# Ghost Capability Spike

## Decision

This is a closed, deterministic capability spike recorded on 2026-07-28. Its
result is a **conditional-go for Increment 3 adapter and fallback planning
only**. It is not a production Ghost compatibility approval and it does not
authorize hosted delivery, activation, or subscriber delivery.

No disposable Ghost credentials are in scope. The spike therefore made no
network request to Ghost and did not create a Ghost site, page, member,
webhook, or attachment. It classifies every ADR-012 row as
`fallback-required`; none is `direct`. The selected boundary is a minimal
sidecar plus private object storage. See
[the sanitized result](results.sanitized.json) and
[the capability matrix](capability-matrix.md).

## Run the deterministic evidence

Run the local harness and its test file from the repository root:

```sh
node scripts/ghost-capability-spike.mjs
node --test tests/ghost-capability-spike.test.mjs
```

The first command validates [results.schema.json](results.schema.json), then
uses only [synthetic fixture state](fixtures/synthetic-ghost-state.json). It
also exercises artifact and manifest checksum verification, time-based expiry,
explicit session revocation, authenticated advisory events, authoritative
pointer reconciliation, and retention-authorized deletion/tombstones. The
second command covers GHO-001 through GHO-008. Both commands must report that
provider calls are `none`.

## Data classification and safety boundary

All committed files under this directory are `synthetic-only`:

- Synthetic addresses use the reserved `example.test` domain.
- Release IDs, hashes, book titles, artifacts, event IDs, and limits are test
  data, not provider observations.
- There are no production credentials, real subscribers, private manuscript
  content, Ghost IDs, signed URLs, or webhook bodies.
- Official documentation is evidence of a documented interface, not evidence
  that this repository exercised that interface against a live provider.

The harness deliberately reports `providerCalls: "none"`. Do not swap in an
environment variable, copy an Admin API key, or edit a fixture to resemble a
real subscriber in order to make a test pass.

## Setup and teardown for a future authorized live run

This repository does not include a live-run command. A future live run needs
separate authorization and a new, sanitized result record. Before it begins:

1. Obtain a disposable Ghost environment, an explicit egress approval, and a
   short-lived server-side integration credential outside Git.
2. Verify the Ghost version, plan, enabled features, API version header, and
   exact time-box start. Use only synthetic release content and
   `example.test` identities.
3. Set a two-working-day / 16-human-hour maximum. Stop immediately if real
   credentials, real subscribers, or private manuscript content would be
   needed.
4. Record successful and denial/failure paths for each matrix row. Preserve
   only sanitized response shapes, status classes, timestamps, and hashed
   identifiers; never commit tokens, cookies, full URLs, or bodies containing
   subscriber data.

At teardown, delete every disposable test member, content item, attachment,
webhook, integration, and test storage object according to the authorized
environment's policy. Record request outcomes and any provider retention limit
without claiming physical erasure that cannot be verified. Revoke the
integration credential and remove local runtime data. A future record must
keep this synthetic record intact; it may not rewrite unverified behavior into
a `direct` classification.

## Evidence rules

Each capability row must contain all three evidence kinds below. The schema
also permits an official-documentation URL only on `docs.ghost.org` or
`ghost.org`, and forbids a `go` decision when `providerCalls` is `none`.

| Kind | Meaning | What it cannot establish |
| --- | --- | --- |
| `official-documentation` | A current first-party Ghost documentation page, URL, and access date. | Actual behavior in a particular version, plan, configuration, or environment. |
| `local-synthetic-exercise` | A deterministic execution of the selected sidecar/object-storage contract. | Any live Ghost request, response, cache, session, rate limit, or deletion behavior. |
| `limitation` | An explicit missing proof. | A reason to classify a row as `direct`. |

Every future `direct` row must contain both an observed successful path and the
relevant observed denial or failure path. Missing live evidence is never a
direct result. A required `infeasible` row requires the result decision to be
`blocked`.

## Official provider documentation consulted

The following first-party documentation was accessed on 2026-07-28. These
links are deliberately kept separate from local exercise evidence.

- [Ghost Admin API overview](https://docs.ghost.org/admin-api) documents
  server-side integration authentication, fixed integration permissions, API
  version headers, and stable integration endpoints.
- [Ghost memberships overview](https://docs.ghost.org/members) documents
  password-free email-link authentication and member/tier-gated post content.
- [Ghost member setup](https://ghost.org/help/setup-members/) documents an
  invite-only membership setting.
- [Ghost webhook overview](https://docs.ghost.org/admin-api/webhooks/overview)
  documents webhook mutation and says webhooks cannot be retrieved
  independently through the API.
- [Ghost Content API documentation](https://ghost.org/docs/content-api/)
  documents the read-only content API, its public-facing key model, and default
  pagination.

## Selected fallback boundary

The fallback stays inside ADR-012's approved boundary:

- A minimal sidecar owns the allowlist, opaque session state, authorization
  checks, subscriber-filtered search, release-state compare-and-set, outbox,
  and reconciliation workflow.
- Private object storage holds only manifest-allowlisted immutable release
  artifacts. The sidecar issues short-lived, audience-bound, single-use binary
  grants after server-side authorization.
- Local SQLite remains the append-only staging-attempt and outbox evidence
  authority under ADR-009. It is not the hosted active-pointer authority.

The fallback must not become a broader hosted workspace, second publication
content authority, public binary host, or silent runtime downgrade. Ghost
content, membership state, webhook payloads, and local observations remain
evidence inputs rather than release-content, audit, or active-pointer
authority.
