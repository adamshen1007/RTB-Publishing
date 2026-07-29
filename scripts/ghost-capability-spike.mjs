import assert from "node:assert/strict";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ROOT } from "./lib.mjs";

const SPIKE_ROOT = resolve(ROOT, "spikes", "ghost");
const json = (path) => JSON.parse(readFileSync(resolve(SPIKE_ROOT, path), "utf8"));

export const CAPABILITY_IDS = [
  "invitations-allowlist",
  "password-free-access",
  "protected-html",
  "binary-downloads",
  "search",
  "staging",
  "activation",
  "rollback-unpublish",
  "api-limits-failures",
  "webhooks-reconciliation"
];

export const SPIKE_SCOPE = [
  "spikes/ghost/README.md",
  "spikes/ghost/capability-matrix.md",
  "spikes/ghost/fixtures/provider-documentation.json",
  "spikes/ghost/fixtures/synthetic-ghost-state.json",
  "spikes/ghost/results.sanitized.json",
  "spikes/ghost/results.schema.json",
  "scripts/ghost-capability-spike.mjs",
  "tests/ghost-capability-spike.test.mjs"
];

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const canonicalJson = (value) => JSON.stringify(value);
const SYNTHETIC_EVENT_AUTH_MATERIAL = "rtb-synthetic-event-auth-material-v1";

export function validateResultRecord(record = json("results.sanitized.json"), schema = json("results.schema.json")) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.ok(validate(record), `Ghost spike result schema invalid: ${ajv.errorsText(validate.errors)}`);
  assert.deepEqual(record.capabilities.map(({ id }) => id).sort(), [...CAPABILITY_IDS].sort(), "result must classify each ADR-012 capability exactly once");
  assert.equal(new Set(record.capabilities.map(({ id }) => id)).size, CAPABILITY_IDS.length, "result must not duplicate a capability row");
  assert.ok(record.capabilities.every(({ classification }) => ["direct", "fallback-required", "infeasible"].includes(classification)), "result has an unsupported classification");
  assert.ok(record.capabilities.every(({ evidence }) => ["official-documentation", "local-synthetic-exercise", "limitation"].every((kind) => evidence.some((item) => item.kind === kind))), "each row must retain official, local, and limitation evidence");
  assert.equal(record.decision.productionGhostCompatibility, false, "a synthetic harness must not claim production Ghost compatibility");
  if (record.capabilities.some(({ classification }) => classification === "infeasible")) {
    assert.equal(record.decision.status, "blocked", "an infeasible required row must block the decision");
  }
  if (record.decision.status !== "blocked") {
    assert.ok(record.capabilities.every(({ classification }) => classification !== "infeasible"), "only an infeasible-free record can be non-blocked");
  }
  return record;
}

export function releaseManifest(release) {
  return {
    schemaVersion: 1,
    releaseId: release.releaseId,
    artifacts: release.artifacts.map(({ path, mediaType, bytes, checksum }) => ({ path, mediaType, bytes, checksum }))
  };
}

export function releaseWithComputedManifest(release) {
  return { ...release, manifestChecksum: sha256(canonicalJson(releaseManifest(release))) };
}

export function verifyReleaseIntegrity(release) {
  if (!release || !Array.isArray(release.artifacts) || !release.releaseId || !release.manifestChecksum) return { valid: false, reason: "malformed-release" };
  for (const artifact of release.artifacts) {
    if (typeof artifact.content !== "string" || Buffer.byteLength(artifact.content) !== artifact.bytes) return { valid: false, reason: "artifact-size-mismatch", path: artifact.path };
    if (sha256(artifact.content) !== artifact.checksum) return { valid: false, reason: "artifact-checksum-mismatch", path: artifact.path };
  }
  if (sha256(canonicalJson(releaseManifest(release))) !== release.manifestChecksum) return { valid: false, reason: "manifest-checksum-mismatch" };
  return { valid: true };
}

export function signSyntheticEvent(body) {
  return createHmac("sha256", SYNTHETIC_EVENT_AUTH_MATERIAL).update(canonicalJson(body)).digest("hex");
}

export class SyntheticFallback {
  constructor(fixture = json("fixtures/synthetic-ghost-state.json")) {
    this.fixture = fixture;
    this.now = 1_784_966_400_000; // 2026-07-28T00:00:00.000Z; deterministic test clock.
    this.allowlist = new Set(fixture.members.filter(({ allowlisted }) => allowlisted).map(({ email }) => email));
    this.links = new Map();
    this.sessions = new Map();
    this.grants = new Map();
    this.releases = new Map();
    this.pointer = { releaseId: null, revision: 0 };
    this.idempotency = new Map();
    this.windowRequests = 0;
    this.identityAvailable = true;
    this.holds = new Set();
    this.tombstones = [];
    this.events = new Set();
    this.authoritativeReads = 0;
  }

  invite(email) {
    // Enumeration-safe: callers receive the same acknowledged response either way.
    if (this.allowlist.has(email)) this.links.set(`invite:${email}`, { email, used: false, expiresAt: this.now + 300_000 });
    return { status: "accepted", body: "If eligible, check your inbox." };
  }

  advance(milliseconds) {
    this.now += milliseconds;
  }

  signIn(email) {
    if (!this.identityAvailable || !this.allowlist.has(email)) return { status: "denied" };
    const token = `login:${email}:${this.links.size}`;
    this.links.set(token, { email, used: false, expiresAt: this.now + 60_000 });
    return { status: "issued", token };
  }

  redeemLink(token) {
    if (!this.identityAvailable) return { status: "denied" };
    const link = this.links.get(token);
    if (!link || link.used || link.expiresAt <= this.now) return { status: "denied" };
    link.used = true;
    const sessionId = `session:${link.email}:${this.sessions.size}`;
    this.sessions.set(sessionId, { email: link.email, revoked: false });
    return { status: "authenticated", sessionId };
  }

  rotate(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.revoked) return { status: "denied" };
    session.revoked = true;
    const next = `session:${session.email}:${this.sessions.size}`;
    this.sessions.set(next, { email: session.email, revoked: false });
    return { status: "rotated", sessionId: next };
  }

  revoke(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) session.revoked = true;
    return { status: "revoked" };
  }

  authorized(sessionId) {
    const session = this.sessions.get(sessionId);
    return Boolean(session && !session.revoked && this.allowlist.has(session.email));
  }

  html(sessionId, releaseId) {
    if (!this.authorized(sessionId)) return { status: "denied" };
    const email = this.sessions.get(sessionId).email;
    return { status: "ok", cacheKey: `private:${releaseId}:${email}` };
  }

  issueGrant(sessionId, releaseId, artifact) {
    if (!this.authorized(sessionId)) return { status: "denied" };
    const email = this.sessions.get(sessionId).email;
    const token = `grant:${email}:${releaseId}:${artifact}:${this.grants.size}`;
    this.grants.set(token, { email, releaseId, artifact, used: false, expiresAt: this.now + 60_000 });
    return { status: "issued", token };
  }

  redeemGrant(token, sessionId) {
    const grant = this.grants.get(token);
    const email = this.sessions.get(sessionId)?.email;
    if (!grant || grant.used || grant.expiresAt <= this.now || !this.authorized(sessionId) || grant.email !== email) return { status: "denied" };
    grant.used = true;
    return { status: "download", artifact: grant.artifact };
  }

  search(sessionId, query) {
    if (!this.authorized(sessionId)) return [];
    return query === "synthetic" ? [{ releaseId: this.fixture.release.releaseId, title: "Synthetic book" }] : [];
  }

  stage(release, idempotencyKey, { partial = false, timeout = false } = {}) {
    if (this.idempotency.has(idempotencyKey)) return this.idempotency.get(idempotencyKey);
    const integrity = verifyReleaseIntegrity(release);
    if (!integrity.valid) return { status: "verification-failed", ...integrity };
    if (release.artifacts.some(({ bytes }) => bytes > this.fixture.limits.maxUploadBytes)) return { status: "payload-too-large" };
    if (partial) return { status: "failed-partial-upload" };
    if (timeout) return { status: "blocked-awaiting-reconciliation" };
    const existing = this.releases.get(release.releaseId);
    if (existing && existing.manifestChecksum !== release.manifestChecksum) return { status: "release-id-conflict" };
    const result = { status: "staged", releaseId: release.releaseId, manifestChecksum: release.manifestChecksum };
    this.releases.set(release.releaseId, { ...release, retainedUntil: this.now + 30 * 24 * 60 * 60 * 1000 });
    this.idempotency.set(idempotencyKey, result);
    return result;
  }

  request() {
    this.windowRequests += 1;
    return this.windowRequests <= this.fixture.limits.requestsPerWindow ? { status: "accepted" } : { status: "rate-limited" };
  }

  compareAndSet(expected, releaseId) {
    if (this.pointer.releaseId !== expected.releaseId || this.pointer.revision !== expected.revision) return { status: "conflict", pointer: { ...this.pointer } };
    if (releaseId !== null && !this.releases.has(releaseId)) return { status: "unverified-release" };
    const previous = this.pointer.releaseId;
    this.pointer = { releaseId, revision: this.pointer.revision + 1 };
    if (previous) this.releases.get(previous).rollbackProtectedUntil = this.now + 30 * 24 * 60 * 60 * 1000;
    return { status: "activated", pointer: { ...this.pointer } };
  }

  authoritativePointer() {
    this.authoritativeReads += 1;
    return { ...this.pointer };
  }

  deleteRelease(releaseId, { legalHold = false, early = false } = {}) {
    const release = this.releases.get(releaseId);
    if (!release) return { status: "not-found" };
    if (this.pointer.releaseId === releaseId) return { status: "blocked-active-release" };
    if (legalHold || this.holds.has(releaseId)) return { status: "blocked-legal-hold" };
    if (early || release.retainedUntil > this.now || release.rollbackProtectedUntil > this.now) return { status: "blocked-retention" };
    this.releases.delete(releaseId);
    this.tombstones.push({ releaseId, manifestChecksum: release.manifestChecksum, deletedAt: this.now });
    return { status: "deleted" };
  }

  acceptEvent(event) {
    if (!event?.eventId || typeof event.signature !== "string" || !event.body) return { status: "unauthenticated" };
    const expected = signSyntheticEvent(event.body);
    const supplied = Buffer.from(event.signature, "hex");
    const calculated = Buffer.from(expected, "hex");
    if (supplied.length !== calculated.length || !timingSafeEqual(supplied, calculated)) return { status: "unauthenticated" };
    if (this.events.has(event.eventId)) return { status: "duplicate" };
    this.events.add(event.eventId);
    return { status: "accepted", advisory: true };
  }

  reconcilePointer(advisoryBody) {
    const authoritative = this.authoritativePointer();
    const claimed = advisoryBody?.claimedPointer;
    const matches = claimed?.releaseId === authoritative.releaseId && claimed?.revision === authoritative.revision;
    return { status: matches ? "in-sync" : "drift-detected", pointer: authoritative };
  }
}

export function exerciseSyntheticFallback() {
  const adapter = new SyntheticFallback();
  const releaseA = adapter.fixture.release;
  const releaseB = releaseWithComputedManifest({ ...releaseA, releaseId: "rel-synthetic-20260728-b" });

  const unknownInvite = adapter.invite("unknown@example.test");
  const knownInvite = adapter.invite("ada@example.test");
  assert.deepEqual(unknownInvite, knownInvite, "allowlist response must not enumerate an address");
  const login = adapter.signIn("ada@example.test");
  const session = adapter.redeemLink(login.token).sessionId;
  assert.equal(adapter.redeemLink(login.token).status, "denied", "magic-link replay must fail");
  const expiredLink = adapter.signIn("ada@example.test").token;
  adapter.advance(60_001);
  assert.equal(adapter.redeemLink(expiredLink).status, "denied", "expired magic link must fail");
  const rotated = adapter.rotate(session).sessionId;
  assert.equal(adapter.html(session, releaseA.releaseId).status, "denied", "rotated session must fail");
  assert.match(adapter.html(rotated, releaseA.releaseId).cacheKey, /ada@example\.test$/, "authenticated cache must be member-scoped");
  const grant = adapter.issueGrant(rotated, releaseA.releaseId, "book.pdf").token;
  assert.equal(adapter.redeemGrant(grant, rotated).status, "download", "valid download grant must work once");
  assert.equal(adapter.redeemGrant(grant, rotated).status, "denied", "download grant replay must fail");
  const expiredGrant = adapter.issueGrant(rotated, releaseA.releaseId, "book.pdf").token;
  adapter.advance(60_001);
  assert.equal(adapter.redeemGrant(expiredGrant, rotated).status, "denied", "expired download grant must fail");
  const copiedGrant = adapter.issueGrant(rotated, releaseA.releaseId, "book.epub").token;
  const bob = adapter.redeemLink(adapter.signIn("bob@example.test").token).sessionId;
  assert.equal(adapter.redeemGrant(copiedGrant, bob).status, "denied", "copied grant must fail for another member");
  assert.equal(adapter.search(rotated, "synthetic").length, 1, "authorized search should return allowlisted release metadata");
  assert.equal(adapter.search("missing", "synthetic").length, 0, "unauthorized search must reveal nothing");
  adapter.revoke(bob);
  assert.equal(adapter.html(bob, releaseA.releaseId).status, "denied", "explicitly revoked session must fail");

  assert.deepEqual(verifyReleaseIntegrity(releaseA), { valid: true }, "fixture release must have a valid manifest and artifacts");
  assert.equal(adapter.stage(releaseA, "stage-a").status, "staged", "staging must not activate");
  assert.equal(adapter.pointer.releaseId, null, "staging must leave the pointer inactive");
  assert.equal(adapter.stage(releaseA, "stage-a").status, "staged", "same idempotency key must reconcile the prior stage");
  const conflictingReleaseA = releaseWithComputedManifest({
    ...releaseA,
    artifacts: releaseA.artifacts.map((artifact, index) => index === 0 ? { ...artifact, content: "<main>Changed synthetic book</main>", bytes: Buffer.byteLength("<main>Changed synthetic book</main>"), checksum: sha256("<main>Changed synthetic book</main>") } : artifact)
  });
  assert.equal(adapter.stage(conflictingReleaseA, "stage-changed").status, "release-id-conflict", "release IDs cannot be overwritten");
  assert.equal(adapter.stage({ ...releaseB, artifacts: releaseB.artifacts.map((artifact, index) => index === 0 ? { ...artifact, content: "tampered" } : artifact) }, "bad-artifact").status, "verification-failed", "changed artifact content must fail checksum verification");
  assert.equal(adapter.stage({ ...releaseB, manifestChecksum: "sha256:changed" }, "bad-manifest").status, "verification-failed", "changed manifest checksum must fail verification");
  assert.equal(adapter.stage(releaseWithComputedManifest({ ...releaseA, releaseId: "partial" }), "partial", { partial: true }).status, "failed-partial-upload", "partial uploads must fail");
  assert.equal(adapter.stage(releaseWithComputedManifest({ ...releaseA, releaseId: "timeout" }), "timeout", { timeout: true }).status, "blocked-awaiting-reconciliation", "uncertain effects must block");
  assert.equal(adapter.request().status, "accepted");
  assert.equal(adapter.request().status, "accepted");
  assert.equal(adapter.request().status, "rate-limited", "requests above the recorded window must be bounded");

  const activatedA = adapter.compareAndSet({ releaseId: null, revision: 0 }, releaseA.releaseId);
  assert.equal(activatedA.pointer.revision, 1, "activation must increment pointer revision");
  assert.equal(adapter.stage(releaseB, "stage-b").status, "staged");
  const activatedB = adapter.compareAndSet(activatedA.pointer, releaseB.releaseId);
  const returnedA = adapter.compareAndSet(activatedB.pointer, releaseA.releaseId);
  assert.equal(returnedA.pointer.revision, 3, "A-to-B-to-A must preserve revision history");
  assert.equal(adapter.compareAndSet({ releaseId: releaseA.releaseId, revision: 1 }, null).status, "conflict", "stale A revision must not unpublish a later A");
  assert.equal(adapter.compareAndSet(returnedA.pointer, null).pointer.revision, 4, "current pointer may unpublish with an exact pair");
  assert.equal(adapter.deleteRelease(releaseA.releaseId, { early: true }).status, "blocked-retention", "rollback target cannot be deleted early");
  adapter.holds.add(releaseB.releaseId);
  assert.equal(adapter.deleteRelease(releaseB.releaseId, { legalHold: true }).status, "blocked-legal-hold", "legal hold must pause deletion");
  adapter.holds.delete(releaseB.releaseId);
  adapter.advance(31 * 24 * 60 * 60 * 1000);
  assert.equal(adapter.deleteRelease(releaseB.releaseId).status, "deleted", "retention-authorized deletion must succeed");
  assert.deepEqual(adapter.tombstones, [{ releaseId: releaseB.releaseId, manifestChecksum: releaseB.manifestChecksum, deletedAt: adapter.now }], "authorized deletion must leave only a minimal tombstone");
  const staleEventBody = { event: "release.updated", claimedPointer: { releaseId: releaseB.releaseId, revision: 2 } };
  assert.equal(adapter.acceptEvent({ eventId: "evt-1", body: staleEventBody, signature: "00" }).status, "unauthenticated", "invalid event signatures must fail");
  const authenticatedEvent = { eventId: "evt-1", body: staleEventBody, signature: signSyntheticEvent(staleEventBody) };
  assert.equal(adapter.acceptEvent(authenticatedEvent).status, "accepted", "valid event signatures must be accepted as advisory only");
  assert.equal(adapter.acceptEvent(authenticatedEvent).status, "duplicate", "authenticated duplicate events must be deduplicated");
  assert.deepEqual(adapter.reconcilePointer(staleEventBody), { status: "drift-detected", pointer: { releaseId: null, revision: 4 } }, "authoritative pointer read must detect advisory drift");
  assert.equal(adapter.authoritativeReads, 1, "reconciliation must read authoritative state rather than trust event body");
  adapter.identityAvailable = false;
  assert.equal(adapter.signIn("ada@example.test").status, "denied", "identity outage must fail closed");

  return { capabilitiesExercised: CAPABILITY_IDS, result: "pass", providerCalls: "none" };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const record = validateResultRecord();
  const exercise = exerciseSyntheticFallback();
  process.stdout.write(`${JSON.stringify({ recordId: record.recordId, decision: record.decision, exercise }, null, 2)}\n`);
}
