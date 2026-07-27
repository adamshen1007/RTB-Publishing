# Research-to-Book Threat Model

## Scope

This model covers the local Creator Studio and its assets, source ingestion,
the Evidence Gateway, external AI and media providers, the Notion review
bridge, the authorized mutation service, HTML/PDF/EPUB rendering, the Ghost
adapter and any approved fallback, object storage, and subscriber access.

It expands the AI Agent Threat Model and Local Platform Security Policy for the
RFC-006 product boundary. Their narrower controls remain active. A remote,
shared, or multi-tenant Creator Studio remains out of scope and requires a new
RFC and threat model.

## Assets and Security Objectives

| Asset | Security objective |
| --- | --- |
| Canonical Markdown, configuration, research, evidence, claims, and rights records | Preserve integrity, provenance, availability, and local authority |
| Drafts, rejected proposals, Editorial Memory, and source archives | Keep private, local by default, and recoverable |
| Git history, approvals, mutation journals, run ledgers, and audit evidence | Prevent forgery, deletion, replay, and silent gaps |
| Provider, Notion, Ghost, storage, and connector credentials | Prevent disclosure, confused use, and excessive authority |
| Approved release bundles and active-release state | Preserve immutability, authenticity, staged activation, and rollback |
| Subscriber email, authentication state, sessions, and access records | Minimize collection and prevent disclosure or unauthorized access |
| Rights proofs, expiry, revocation, and release relationships | Block unlicensed use and support complete removal |
| Local compute, storage, network, cost, and provider quotas | Prevent exhaustion, abuse, and unbounded spend |

## Trust Boundaries

```text
untrusted sources
      |
      v
[Evidence Gateway sandbox] ---- approved, classified fields ---->
      |                                             [providers]
      v                                                  |
[local canonical files] <--> [SQLite operational state] |
      ^                         ^                        v
      |                         |       [proposal-only provider outputs]
      |                         |
[authorized mutation service] <- [append-only human decision]
                                      ^
                                      |
                              [immutable proposal]
                                      ^
                                      |
                   [Notion Review Bridge and normalized
                         three-way proposal import]
                                      ^
                                      |
                      [Notion derived review surface]

[immutable staged release] --> [Ghost or approved storage] --> [subscriber]
```

The following are separate trust domains:

- The local operator, browser interface, mutation service, worker processes,
  renderer, and local file and SQLite stores
- Untrusted web pages, documents, archives, images, audio, video, transcripts,
  metadata, and redirects
- Each external provider, connector, Notion workspace, Ghost site, object
  store, identity flow, and subscriber client
- Proposal-only model output, which remains untrusted after transport
- Canonical validators and human approvals, which grant narrow decisions but
  do not make the host or upstream systems infallible

Crossing a boundary requires an explicit adapter, schema, classification,
allowlist, budget, and auditable decision. A system's authentication does not
make its content trusted.

## Threats, Abuse Cases, and Controls

### Local Assets and Mutation

- **Path traversal, symbolic links, and root confusion:** An imported path,
  archive entry, project setting, or proposal attempts to read or overwrite a
  secret or file outside the approved project. Resolve repository-relative
  paths segment by segment, reject traversal and symbolic links, use explicit
  absolute allowlists for external roots, deny secret-shaped paths, and keep
  extraction and rendering inside bounded staging directories.
- **Unauthorized or stale mutation:** A browser, provider, Notion webhook,
  worker, stale tab, or replayed approval attempts to change canonical files.
  Only ADR-008's mutation service may write them. It requires fixed commands,
  actor and lifecycle authorization, exact proposal and content hashes, the
  per-project writer lock, SQLite lease and fencing token, durable journal,
  versioned snapshot-root replacement, validators, and immutable audit
  evidence. Lifecycle transitions use the same writer lock through durable
  commit, so a stale transition or mutation fails closed.
- **Local HTTP confusion or request forgery:** A malicious site, rebinding
  hostname, oversized request, stolen URL, or unauthenticated local process
  invokes a mutation. Bind only to loopback; enforce a strict loopback `Host`
  and port allowlist; reject forwarded-host ambiguity; require same-origin JSON
  requests, Origin and Fetch Metadata checks, session-bound CSRF, and a
  short-lived authenticated local capability or session; bound headers,
  bodies, fields, and batches; rate-limit by session and operation; reject
  replay; and never place credentials in URLs, redirects, logs, or browser
  history.
- **Crash or storage failure:** Termination, disk exhaustion, or a database
  lock occurs between snapshot and SQLite commits. Preflight storage, durably
  preserve content-addressed preimages, `fsync` files and directories in
  ADR-008 order, publish multi-file changes through one versioned root pointer,
  inject failures at every durable boundary, and complete phase-table recovery
  before accepting new writes. If a preimage cannot be verified, block rather
  than guess. Never infer success from a model or browser message.
- **Malicious local content:** Markdown or configuration attempts command,
  template, or script execution. Parse with bounded, pinned libraries; treat
  code and directives as data; prohibit arbitrary shell interpolation; and
  execute only fixed argument arrays with `shell: false`.
- **Secret exposure:** APIs, logs, crash reports, exports, or committed fixtures
  expose environment values or tokens. Keep secrets in approved secret stores,
  deny secret paths, separate credentials by adapter and environment, redact
  logs and errors, rotate exposed credentials, and sanitize fixtures before
  commit.

### Source Ingestion and the Evidence Gateway

- **Prompt injection:** A source tells a model or worker to ignore policy,
  reveal secrets, use tools, or publish. Mark source material as untrusted
  quoted data, separate system instructions from evidence, scan known markers,
  restrict context to required excerpts, deny tools by default, validate output
  against evidence IDs, and keep every output proposal-only. Novel wording can
  evade detection, so least privilege and human review remain required.
- **Server-side request forgery and DNS rebinding:** A URL resolves to local,
  link-local, private, metadata, multicast, or otherwise denied infrastructure,
  or changes resolution after validation. Permit only required schemes and
  ports; normalize the host; resolve through a controlled resolver; reject
  denied IPv4 and IPv6 ranges for every answer; pin the validated address for
  the connection; verify the peer; and repeat checks for every retry.
- **Redirect abuse:** A permitted URL redirects to a denied address, unsafe
  scheme, credential-bearing URL, excessive chain, or cross-origin secret
  destination. Disable automatic redirects in the transport, validate every
  hop as a fresh request, remove sensitive headers on origin change, cap hops,
  detect loops, and record the final chain.
- **Archive bombs and traversal:** Nested archives, duplicate names, special
  files, compressed bombs, or deceptive paths exhaust resources or escape the
  staging root. Verify type by content, reject absolute paths, traversal,
  links, devices, and unsupported nesting, and enforce compressed,
  uncompressed, entry-count, depth, ratio, time, and disk ceilings before and
  during extraction.
- **Malformed documents and media:** A PDF, image, font, audio, video, or parser
  exploit attacks the host. Verify signatures and declared types, quarantine
  mismatches, use patched parsers in isolated processes without network or
  secrets, bound CPU, memory, pixels, pages, duration, and extracted text, and
  preserve only sanitized results. Crashes become blocked ingestion with a
  manual fallback.
- **Unsafe HTML:** Active content, event handlers, embedded objects, unsafe
  links, or crafted markup reaches previews or releases. Parse rather than use
  regular-expression cleanup, apply an allowlist sanitizer, remove scripts,
  styles, forms, frames, event attributes, and dangerous URLs, add an enforced
  content security policy to previews, and escape metadata in every output
  context.
- **Unlawful or expired use:** The system processes or publishes content without
  sufficient rights. Require a rights record before reusable ingestion, record
  proof and permitted processing, check expiry and revocation at use and
  Publish, invalidate downstream artifacts on change, and support a documented
  removal and rebuild workflow.
- **Resource exhaustion:** Sources exceed count, byte, text, transcript,
  temporary-storage, request-rate, or time budgets. Stream downloads, enforce
  limits before and during work, apply per-host and project rate limits,
  checkpoint usage, and pause visibly without silently increasing ceilings.

### External Providers

- **Excessive or unintended egress:** An adapter sends whole files, private
  drafts, credentials, subscriber data, or rights-restricted content. Enforce
  ADR-010 AI/media field-level classification, contract allowlists,
  minimization, redaction, explicit sensitive-data consent, approved provider,
  model, region, purpose, retention, training, and deletion terms. Subscriber
  email, identity, authentication, session, access, and reading data are
  prohibited to AI and media providers. Unclassified and prohibited
  provider-processing data fails closed.
- **Provider substitution or downgrade:** An outage causes an adapter to choose
  another model, region, or capability. Negotiate the exact contract version
  before dispatch and forbid silent fallback. A changed destination requires a
  new visible, policy-approved dispatch and repeated consent, rights, and
  budget checks.
- **Malformed, hostile, or overreaching output:** Output contains unsupported
  claims, unsafe URLs, executable markup, or instructions to mutate or publish.
  Treat responses as untrusted, enforce schemas and size limits, sanitize
  content, bind evidence and output hashes, run deterministic policy checks,
  and retain proposal-only authority.
- **Cost replay and uncertain dispatch:** A timeout hides a billed completion
  and an automatic retry duplicates cost or media. Commit the ADR-009 outbox
  first, propagate stable idempotency keys, reconcile provider state, cap
  attempts and spend, and block for human action when safe replay cannot be
  proven.
- **Provider retention or training drift:** Provider terms change after project
  approval. Record observed terms and policy versions at consent and dispatch,
  expire approvals when material terms change, prefer no-training and shortest
  retention settings, issue deletion requests where supported, and record
  their outcome without treating it as proof of physical erasure.
- **Credential abuse:** A provider key is stolen or used outside its capability.
  Use separate least-privilege keys when supported, restrict them by project,
  endpoint, region, quota, and network where possible, never expose them to
  models or source parsers, monitor usage, and rotate on suspected compromise.

### Notion Review Boundary

- **Overly broad OAuth access:** The connector can read or change unrelated
  workspaces. Request the minimum scopes, bind an explicitly selected parent,
  verify destination ownership on every operation, store tokens locally,
  review consent at connection and scope change, and make revocation visible.
- **Notion as a competing authority:** Edits, webhooks, comments, or deletions
  overwrite Markdown. Apply ADR-011's immutable export base, stable IDs,
  revision-consistent snapshot, normalized three-way comparison, individual
  proposals, human decisions, expected hashes, and mutation-service-only
  application. Notion never approves a gate or writes canonical files.
- **Concurrent or ambiguous edits:** Local and Notion changes collide, blocks
  move, or identifiers disappear. Preserve base, local, and Notion versions;
  fail closed on ambiguous identity; surface explicit conflicts; and never use
  last-writer-wins or timestamp order.
- **Unsupported or hostile blocks:** A block is silently lost or embeds active
  content and oversized media. Produce a blocking unsupported-block report,
  sanitize previews, apply ingestion limits to referenced media, and require
  manual exclusion, conversion, or a versioned converter.
- **Webhook spoofing and replay:** A forged or repeated event causes imports or
  resource exhaustion. Verify signatures where available, compare workspace
  and destination identity, reject stale timestamps, deduplicate event and
  revision IDs, rate-limit import scheduling, and perform a fresh authorized
  read rather than trusting event content.

### Rendering and Release Integrity

- **Template or renderer compromise:** Manuscript content escapes into scripts,
  file reads, network calls, or unsafe HTML. Pin and review rendering tools,
  isolate rendering without credentials or network, restrict inputs and output
  roots, sanitize generated HTML, disable unsafe template features, and scan
  artifacts before staging.
- **Nondeterministic or partial output:** One format is stale, missing, or built
  from different inputs. Use a content-addressed artifact graph, pinned
  versions, input and output hashes, clean bounded staging, and format-specific
  validation. A failure in HTML, PDF, or EPUB keeps the entire release staged
  and inactive.
- **Release replacement or split state:** Uploads overwrite an edition or
  activation partially succeeds. Release bundles and manifests are immutable
  and addressed by release ID and hash. Verify every hosted artifact and access
  rule before one guarded active-pointer change. Use idempotent uploads and
  reconciliation; on failure, retain the prior active release.
- **Manifest or artifact tampering:** Storage, transport, or an operator swaps a
  file. Sign or checksum the manifest, bind it to project, edition, policy,
  source, artifact, and tool hashes, verify before and after upload and before
  download, retain activation audit evidence, and alert on mismatch.
- **Rights change after release:** An expired or revoked source remains
  downloadable. Evaluate rights at release preparation and scheduled recheck,
  map rights to every affected artifact and release, block new access where
  required, preserve a tombstone and decision evidence, and rebuild a corrected
  immutable release.

### Ghost, Object Storage, and Subscriber Data

- **Unauthorized hosted data:** Drafts, evidence, Editorial Memory, or local
  database records reach Ghost or storage. Enforce a release-manifest
  allowlist at the adapter, stage only approved artifacts and minimum metadata,
  reject extra fields, and audit destination hashes. Hosted systems never read
  the local project root or SQLite database.
- **Public or reusable downloads:** A permanent URL, request-origin header,
  cache, or log leaks a protected PDF or EPUB. Authorize each request against current
  allowlist and release state, issue short-lived audience-bound download
  grants, prevent public bucket access and directory listing, restrict
  redirects, set private cache controls, redact signed URLs, and support
  revocation. Rate-limit issuance and downloads per subscriber, address, and
  release.
- **Subscriber enumeration and account abuse:** Invitation, login, or error
  behavior reveals membership or permits brute force. Use uniform responses,
  bounded one-time sign-in token lifetime and attempts, replay protection,
  anti-automation controls, session rotation and revocation, and rate limits
  that do not expose manuscript content in logs.
- **Excess subscriber personal data:** Analytics, backups, support exports, or
  providers receive unnecessary identity or reading data. Allowlist fields,
  permit only minimum email, invitation, provider-subject, authentication,
  session, revocation, and release-access fields to the configured hosted
  identity adapter, and separate identity from release analytics. Record the
  exact purpose, consent or other legal basis, collection notice, retention,
  deletion and revocation procedure, backup treatment, region, and
  minimization rationale. Reject extra fields, prohibit manuscript and research
  content in analytics, and restrict administrative exports. This hosted
  allowance never permits subscriber data in AI or media provider calls.
- **Cross-subscriber authorization failure:** A session or cached response
  exposes another subscriber's data or an unapproved edition. Enforce
  authorization server-side on every page and artifact request, bind cache keys
  to visibility safely or disable shared caching, test revoked and
  non-allowlisted users, and fail closed during identity-provider outages.
- **Deletion and retention failure:** Personal data or private artifacts remain
  in logs, backups, provider storage, or obsolete releases. Maintain a data map
  and per-store schedule for the shortest lawful retention period that satisfies
  the declared purpose and applicable obligations. Automatically expire
  operational records, support verified deletion, record deletion requests and
  exceptions, garbage-collect unreferenced releases, and preserve only minimal
  tombstone evidence after destructive removal. An active legal hold suspends
  deletion only for covered records until the hold is released; deletion or
  irreversible redaction then resumes under the applicable schedule.
- **Object-store or Ghost compromise:** An external administrator or attacker
  changes artifacts, visibility, or the active release. Use least-privilege
  service identities, separate staging and production authority, enable
  provider audit logs and alerts, reconcile remote state to signed manifests,
  rotate credentials, revoke sessions and download grants, and restore the last
  verified release.

## Incident Evidence and Response

Security-relevant operations must produce bounded, redacted, tamper-evident
evidence sufficient to reconstruct:

- Actor, project, lifecycle version, command, approval or consent reference,
  input fingerprint, policy and schema versions, timestamps, and outcome
- Source URL and validated redirect and address chain; content type, byte,
  extraction, quarantine, and rights decisions
- Provider capability, destination, region, request identity, classification
  manifest, retention and training metadata, usage, cost, response hashes, and
  retry or reconciliation history
- Notion export base, revision evidence, conversion report, proposals,
  conflicts, human decisions, and canonical application hashes
- Mutation lock and lease ownership, fencing token, journal checkpoints,
  temporary and final hashes, validator results, and recovery action
- Renderer and tool versions, release and manifest hashes, storage identities,
  verification results, activation pointer changes, and rollback
- Subscriber authorization decision, release ID, download-grant identity,
  rate-limit event, revocation, deletion request, and administrative action

Evidence must omit secrets, complete signed URLs, raw subscriber tokens,
unnecessary personal data, and prohibited source or prompt content. Access to
incident evidence is least privilege and audited. Retain it for the shortest
lawful period that satisfies the declared project, privacy, security, and
rights purposes and applicable obligations. An active legal hold prevents
deletion only for covered evidence until release; deletion or irreversible
redaction resumes under the applicable schedule as soon as the hold is
released.

Response playbooks must support containment, credential and session revocation,
provider and connector suspension, source quarantine, mutation freeze,
active-release rollback, download revocation, subscriber and rights-owner
notification when required, evidence preservation, scoped deletion, and a
documented recovery decision. A severe unresolved integrity or confidentiality
incident blocks Publish.

## Residual Risks

- Novel prompt injection or parser exploits may bypass known detection before
  isolation and review stop their effects.
- A compromised local host or operator account can undermine local controls,
  approvals, credentials, and audit evidence.
- Providers may not expose complete retention, training, deletion, billing, or
  internal-access evidence.
- Notion, Ghost, object storage, DNS, identity, and email providers can suffer
  outages or privileged compromise outside RTB Publishing control.
- Sanitizers, renderers, file-type detectors, and rights decisions can contain
  errors despite pinned versions and review.
- Short-lived links reduce exposure but an authorized subscriber can still
  copy an accessible work.
- Backups and active legal holds can delay deletion; after a hold is released,
  scheduled deletion or redaction resumes. Tombstones can prove an action
  without proving every provider erased every physical copy.

Residual risk is accepted only through the applicable lifecycle decision with
visible blockers, waivers, and evidence. It never permits bypassing a security
invariant.

## Security Invariants

- Markdown and Git remain the only authority for authored publication content;
  SQLite, Notion, providers, Ghost, and object storage cannot replace them.
- Source and provider content is untrusted data and cannot grant instructions,
  tools, credentials, mutation, approval, or publication authority.
- No browser, provider, connector, webhook, renderer, or hosted adapter writes
  canonical files; only the authorized mutation service can do so after an
  exact human decision.
- Blueprint, Beta, and Publish are the only lifecycle approval gates, and only
  a human can approve them.
- Unclassified or prohibited data never crosses an AI or media
  provider-processing boundary; sensitive provider egress requires specific
  recorded consent. Subscriber email, identity, authentication, session,
  access, and reading data are always prohibited to those providers.
- Only the minimum contract-enumerated subscriber fields may cross to the
  configured hosted identity adapter for the recorded access purpose, consent
  or other legal basis, retention, and deletion policy; extra fields fail
  closed.
- Provider, model, region, prompt, capability, retention, or training changes
  never occur as a silent fallback.
- Every network hop, redirect, resolved address, archive entry, local path, and
  hosted destination is independently validated and bounded.
- Unsupported, malformed, ambiguous, stale, over-budget, or unverifiable input
  fails closed without canonical mutation or release activation.
- Rights expiry or revocation invalidates affected downstream artifacts and
  blocks publication or continued access as policy requires.
- Releases are immutable, manifest-bound, verified before activation, and
  activated through one guarded pointer; failure preserves the prior release.
- Protected downloads require current authorization and short-lived access;
  permanent public artifact URLs are forbidden.
- Subscriber personal data is allowlisted, minimized, rate-protected, redacted
  from general logs, retained for a declared purpose, and deleted according to
  recorded policy.
- Audit evidence is durable enough for incident reconstruction but never stores
  secrets or unnecessary private content.
- Expanding tools, roots, scopes, providers, hosted fields, or remote access
  requires governance review, updated threat modeling, and adversarial tests.
