import assert from "node:assert/strict";
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

export function validateResultRecord(record = json("results.sanitized.json"), schema = json("results.schema.json")) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.ok(validate(record), `Ghost spike result schema invalid: ${ajv.errorsText(validate.errors)}`);
  assert.deepEqual(record.capabilities.map(({ id }) => id).sort(), [...CAPABILITY_IDS].sort(), "result must classify each ADR-012 capability exactly once");
  assert.equal(new Set(record.capabilities.map(({ id }) => id)).size, CAPABILITY_IDS.length, "result must not duplicate a capability row");
  assert.ok(record.capabilities.every(({ classification }) => ["direct", "fallback-required", "infeasible"].includes(classification)), "result has an unsupported classification");
  assert.ok(record.capabilities.every(({ evidence }) => evidence.some(({ kind }) => kind === "local-synthetic-exercise") && evidence.some(({ kind }) => kind === "limitation")), "each row must retain local exercise and limitation evidence");
  assert.equal(record.decision.productionGhostCompatibility, false, "a synthetic harness must not claim production Ghost compatibility");
  if (record.capabilities.some(({ classification }) => classification === "infeasible")) {
    assert.equal(record.decision.status, "blocked", "an infeasible required row must block the decision");
  }
  if (record.decision.status !== "blocked") {
    assert.ok(record.capabilities.every(({ classification }) => classification !== "infeasible"), "only an infeasible-free record can be non-blocked");
  }
  return record;
}

class SyntheticFallback {
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
  }

  invite(email) {
    // Enumeration-safe: callers receive the same acknowledged response either way.
    if (this.allowlist.has(email)) this.links.set(`invite:${email}`, { email, used: false, expiresAt: this.now + 300_000 });
    return { status: "accepted", body: "If eligible, check your inbox." };
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
    this.pointer = { releaseId, revision: this.pointer.revision + 1 };
    return { status: "activated", pointer: { ...this.pointer } };
  }

  deleteRelease(releaseId, { legalHold = false, early = false } = {}) {
    const release = this.releases.get(releaseId);
    if (!release) return { status: "not-found" };
    if (legalHold || this.holds.has(releaseId)) return { status: "blocked-legal-hold" };
    if (early || release.retainedUntil > this.now) return { status: "blocked-retention" };
    this.releases.delete(releaseId);
    this.tombstones.push({ releaseId, manifestChecksum: release.manifestChecksum, deletedAt: this.now });
    return { status: "deleted" };
  }

  acceptEvent(eventId) {
    if (this.events.has(eventId)) return { status: "duplicate" };
    this.events.add(eventId);
    return { status: "accepted" };
  }
}

export function exerciseSyntheticFallback() {
  const adapter = new SyntheticFallback();
  const releaseA = adapter.fixture.release;
  const releaseB = { ...releaseA, releaseId: "rel-synthetic-20260728-b", manifestChecksum: "sha256:bc02c0df4bd12f9e7c93966fd58d59d1398dd7d86a2ba2c7624e5d77ec7f5238" };

  const unknownInvite = adapter.invite("unknown@example.test");
  const knownInvite = adapter.invite("ada@example.test");
  assert.deepEqual(unknownInvite, knownInvite, "allowlist response must not enumerate an address");
  const login = adapter.signIn("ada@example.test");
  const session = adapter.redeemLink(login.token).sessionId;
  assert.equal(adapter.redeemLink(login.token).status, "denied", "magic-link replay must fail");
  const rotated = adapter.rotate(session).sessionId;
  assert.equal(adapter.html(session, releaseA.releaseId).status, "denied", "rotated session must fail");
  assert.match(adapter.html(rotated, releaseA.releaseId).cacheKey, /ada@example\.test$/, "authenticated cache must be member-scoped");
  const grant = adapter.issueGrant(rotated, releaseA.releaseId, "book.pdf").token;
  assert.equal(adapter.redeemGrant(grant, rotated).status, "download", "valid download grant must work once");
  assert.equal(adapter.redeemGrant(grant, rotated).status, "denied", "download grant replay must fail");
  const copiedGrant = adapter.issueGrant(rotated, releaseA.releaseId, "book.epub").token;
  const bob = adapter.redeemLink(adapter.signIn("bob@example.test").token).sessionId;
  assert.equal(adapter.redeemGrant(copiedGrant, bob).status, "denied", "copied grant must fail for another member");
  assert.equal(adapter.search(rotated, "synthetic").length, 1, "authorized search should return allowlisted release metadata");
  assert.equal(adapter.search("missing", "synthetic").length, 0, "unauthorized search must reveal nothing");

  assert.equal(adapter.stage(releaseA, "stage-a").status, "staged", "staging must not activate");
  assert.equal(adapter.pointer.releaseId, null, "staging must leave the pointer inactive");
  assert.equal(adapter.stage(releaseA, "stage-a").status, "staged", "same idempotency key must reconcile the prior stage");
  assert.equal(adapter.stage({ ...releaseA, manifestChecksum: "sha256:changed" }, "stage-changed").status, "release-id-conflict", "release IDs cannot be overwritten");
  assert.equal(adapter.stage({ ...releaseA, releaseId: "partial" }, "partial", { partial: true }).status, "failed-partial-upload", "partial uploads must fail");
  assert.equal(adapter.stage({ ...releaseA, releaseId: "timeout" }, "timeout", { timeout: true }).status, "blocked-awaiting-reconciliation", "uncertain effects must block");
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
  assert.equal(adapter.acceptEvent("evt-1").status, "accepted");
  assert.equal(adapter.acceptEvent("evt-1").status, "duplicate", "events must be deduplicated");
  adapter.identityAvailable = false;
  assert.equal(adapter.signIn("ada@example.test").status, "denied", "identity outage must fail closed");

  return { capabilitiesExercised: CAPABILITY_IDS, result: "pass", providerCalls: "none" };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const record = validateResultRecord();
  const exercise = exerciseSyntheticFallback();
  process.stdout.write(`${JSON.stringify({ recordId: record.recordId, decision: record.decision, exercise }, null, 2)}\n`);
}
