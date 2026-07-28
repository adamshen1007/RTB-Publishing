import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  CAPABILITY_IDS,
  SPIKE_SCOPE,
  SyntheticFallback,
  exerciseSyntheticFallback,
  releaseWithComputedManifest,
  signSyntheticEvent,
  validateResultRecord,
  verifyReleaseIntegrity
} from "../scripts/ghost-capability-spike.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");
const clone = (value) => JSON.parse(JSON.stringify(value));
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

test("GHO-001: schema fixes all ADR-012 rows, evidence kinds, official domains, and synthetic decision limits", () => {
  const record = validateResultRecord();
  assert.equal(record.capabilities.length, 10);
  assert.deepEqual(record.capabilities.map(({ id }) => id).sort(), [...CAPABILITY_IDS].sort());
  assert.ok(record.capabilities.every(({ classification }) => classification === "fallback-required"));
  assert.equal(record.decision.status, "conditional-go");
  assert.equal(record.decision.productionGhostCompatibility, false);

  const missingOfficial = clone(record);
  missingOfficial.capabilities[0].evidence = missingOfficial.capabilities[0].evidence.filter(({ kind }) => kind !== "official-documentation");
  assert.throws(() => validateResultRecord(missingOfficial), /schema invalid/);
  const untrustedUrl = clone(record);
  untrustedUrl.capabilities[0].evidence[0].url = "https://example.invalid/ghost";
  assert.throws(() => validateResultRecord(untrustedUrl), /schema invalid/);
  const syntheticGo = clone(record);
  syntheticGo.decision.status = "go";
  assert.throws(() => validateResultRecord(syntheticGo), /schema invalid/);
});

test("GHO-002: synthetic password-free flow denies expired, replayed, rotated, revoked, and outage access", () => {
  const adapter = new SyntheticFallback();
  const initial = adapter.signIn("ada@example.test");
  const session = adapter.redeemLink(initial.token).sessionId;
  assert.equal(adapter.redeemLink(initial.token).status, "denied", "replayed link must fail");
  const expired = adapter.signIn("ada@example.test").token;
  adapter.advance(60_001);
  assert.equal(adapter.redeemLink(expired).status, "denied", "expired link must fail");
  const rotated = adapter.rotate(session).sessionId;
  assert.equal(adapter.html(session, adapter.fixture.release.releaseId).status, "denied", "rotated session must fail");
  adapter.revoke(rotated);
  assert.equal(adapter.html(rotated, adapter.fixture.release.releaseId).status, "denied", "explicitly revoked session must fail");
  adapter.identityAvailable = false;
  assert.equal(adapter.signIn("ada@example.test").status, "denied", "identity outage must fail closed");
});

test("GHO-003: synthetic access protects HTML, search, and audience-bound binary grants", () => {
  const adapter = new SyntheticFallback();
  const release = adapter.fixture.release;
  const ada = adapter.redeemLink(adapter.signIn("ada@example.test").token).sessionId;
  const bob = adapter.redeemLink(adapter.signIn("bob@example.test").token).sessionId;
  assert.match(adapter.html(ada, release.releaseId).cacheKey, /ada@example\.test$/);
  assert.equal(adapter.search(ada, "synthetic").length, 1);
  assert.deepEqual(adapter.search("missing", "synthetic"), []);
  const grant = adapter.issueGrant(ada, release.releaseId, "book.pdf").token;
  assert.equal(adapter.redeemGrant(grant, bob).status, "denied", "copied grant must fail");
  assert.equal(adapter.redeemGrant(grant, ada).status, "download");
  assert.equal(adapter.redeemGrant(grant, ada).status, "denied", "replayed grant must fail");
  const expiredGrant = adapter.issueGrant(ada, release.releaseId, "book.epub").token;
  adapter.advance(60_001);
  assert.equal(adapter.redeemGrant(expiredGrant, ada).status, "denied", "expired grant must fail");
});

test("GHO-004 and GHO-005: staging verifies manifest/artifacts and bounds duplicate, partial, timeout, and rate behavior", () => {
  const adapter = new SyntheticFallback();
  const release = adapter.fixture.release;
  assert.deepEqual(verifyReleaseIntegrity(release), { valid: true });
  assert.equal(adapter.stage(release, "stage-a").status, "staged");
  assert.equal(adapter.pointer.releaseId, null, "staging must remain inactive");
  assert.equal(adapter.stage(release, "stage-a").status, "staged", "stable idempotency key must reconcile");
  const badArtifact = clone(release);
  badArtifact.artifacts[0].content = "tampered";
  assert.equal(adapter.stage(badArtifact, "bad-artifact").status, "verification-failed");
  const badManifest = { ...releaseWithComputedManifest({ ...release, releaseId: "different" }), manifestChecksum: "sha256:changed" };
  assert.equal(adapter.stage(badManifest, "bad-manifest").status, "verification-failed");
  assert.equal(adapter.stage(releaseWithComputedManifest({ ...release, releaseId: "partial" }), "partial", { partial: true }).status, "failed-partial-upload");
  assert.equal(adapter.stage(releaseWithComputedManifest({ ...release, releaseId: "timeout" }), "timeout", { timeout: true }).status, "blocked-awaiting-reconciliation");
  assert.equal(adapter.request().status, "accepted");
  assert.equal(adapter.request().status, "accepted");
  assert.equal(adapter.request().status, "rate-limited");
});

test("GHO-006: pointer reconciliation distrusts authenticated advisory events and retention deletion leaves a tombstone", () => {
  const adapter = new SyntheticFallback();
  const releaseA = adapter.fixture.release;
  const releaseB = releaseWithComputedManifest({ ...releaseA, releaseId: "rel-synthetic-20260728-b" });
  assert.equal(adapter.stage(releaseA, "stage-a").status, "staged");
  assert.equal(adapter.stage(releaseB, "stage-b").status, "staged");
  const activatedA = adapter.compareAndSet({ releaseId: null, revision: 0 }, releaseA.releaseId);
  const activatedB = adapter.compareAndSet(activatedA.pointer, releaseB.releaseId);
  const returnedA = adapter.compareAndSet(activatedB.pointer, releaseA.releaseId);
  assert.equal(adapter.compareAndSet({ releaseId: releaseA.releaseId, revision: 1 }, null).status, "conflict", "A-to-B-to-A stale unpublish must conflict");
  assert.equal(adapter.compareAndSet(returnedA.pointer, null).status, "activated");
  assert.equal(adapter.deleteRelease(releaseB.releaseId).status, "blocked-retention");
  adapter.holds.add(releaseB.releaseId);
  assert.equal(adapter.deleteRelease(releaseB.releaseId).status, "blocked-legal-hold");
  adapter.holds.delete(releaseB.releaseId);
  adapter.advance(31 * 24 * 60 * 60 * 1000);
  assert.equal(adapter.deleteRelease(releaseB.releaseId).status, "deleted");
  assert.deepEqual(adapter.tombstones, [{ releaseId: releaseB.releaseId, manifestChecksum: releaseB.manifestChecksum, deletedAt: adapter.now }]);

  const staleBody = { event: "release.updated", claimedPointer: { releaseId: releaseB.releaseId, revision: 2 } };
  assert.equal(adapter.acceptEvent({ eventId: "evt-1", body: staleBody, signature: "00" }).status, "unauthenticated");
  const event = { eventId: "evt-1", body: staleBody, signature: signSyntheticEvent(staleBody) };
  assert.deepEqual(adapter.acceptEvent(event), { status: "accepted", advisory: true });
  assert.equal(adapter.acceptEvent(event).status, "duplicate");
  assert.deepEqual(adapter.reconcilePointer(staleBody), { status: "drift-detected", pointer: { releaseId: null, revision: 4 } });
  assert.equal(adapter.authoritativeReads, 1, "reconciliation must read state rather than trust event payloads");
});

test("GHO-007: scans every committed/current spike file and a non-empty reviewed Git range", () => {
  const committedFiles = git(["ls-tree", "-r", "--name-only", "HEAD", "--", ...SPIKE_SCOPE]).trim().split("\n").filter(Boolean).sort();
  assert.deepEqual(committedFiles, [...SPIKE_SCOPE].sort(), "committed spike scope must include docs, fixtures, schema, harness, and tests");
  const committedScope = committedFiles.map((file) => git(["show", `HEAD:${file}`])).join("\n");
  const workingScope = SPIKE_SCOPE.map(read).join("\n");
  const reviewBase = git(["rev-parse", "HEAD^"]).trim();
  const reviewedDiff = git(["diff", "--no-ext-diff", `${reviewBase}..HEAD`, "--", ...SPIKE_SCOPE]);
  assert.match(reviewedDiff, /diff --git/, "reviewed Git range must not be an empty working-tree diff");
  const scanned = `${committedScope}\n${workingScope}\n${reviewedDiff}`;
  assert.doesNotMatch(scanned, /(?:api[_-]?key|access[_-]?token|admin[_-]?key|client[_-]?secret|password|secret)\s*[:=]\s*["']?(?!none\b|not-|synthetic)/i);
  assert.doesNotMatch(scanned, /@(?!example\.test\b)[a-z0-9.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(scanned, /(?:ghp_|gho_|xox[baprs]-|AKIA)[A-Za-z0-9_-]{8,}/);
  assert.doesNotMatch(scanned, /(?<![a-f0-9])[a-f0-9]{24}(?![a-f0-9])/i, "Ghost-like private object IDs are prohibited");
  assert.match(scanned, /productionGhostCompatibility"\s*:\s*false/);
});

test("GHO-008: public harness remains deterministic, exercises every row, and makes no provider call", () => {
  assert.deepEqual(exerciseSyntheticFallback(), { capabilitiesExercised: CAPABILITY_IDS, result: "pass", providerCalls: "none" });
  const first = execFileSync(process.execPath, ["scripts/ghost-capability-spike.mjs"], { cwd: root, encoding: "utf8" });
  const second = execFileSync(process.execPath, ["scripts/ghost-capability-spike.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(first, second);
  assert.equal(JSON.parse(first).exercise.providerCalls, "none");
});
