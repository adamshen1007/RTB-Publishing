import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { createCandidate, verifyCandidate } from "../scripts/publishing/candidate.mjs";
import { fileHash, writeJson } from "../scripts/publishing/common.mjs";
import { createManifest, verifyManifest } from "../scripts/publishing/manifest.mjs";
import { verifyReleaseDirectory } from "../scripts/publishing/verify-release.mjs";
import { registerReleaseCandidate } from "../scripts/publishing/release-registry.mjs";
import { finalizeRelease } from "../scripts/publishing/finalize-release.mjs";
import { ReleaseReviewService } from "../scripts/publishing/release-review-service.mjs";
import { CanonicalLifecycleBindingProvider } from "../scripts/lifecycle/bindings.mjs";
import { BetaPreparationService } from "../scripts/lifecycle/beta-preparation.mjs";
import { LifecycleService } from "../scripts/lifecycle/service.mjs";
import { evaluateReleasePolicies } from "../scripts/publishing/policies.mjs";
import { assertSafeMarkup } from "../scripts/publishing/verify.mjs";
import { publicationExport } from "../scripts/notion-publication.mjs";
import { openStateDatabase } from "../scripts/state/database.mjs";

test("SEC-004 rejects active markup and unsafe URLs while permitting inert task boxes", () => { assert.throws(() => assertSafeMarkup('<img src="x" onerror="alert(1)">', "HTML"), /security/); assert.throws(() => assertSafeMarkup('<a href="javascript:alert(1)">bad</a>', "EPUB"), /security/); assert.doesNotThrow(() => assertSafeMarkup('<input type="checkbox"></input>', "HTML")); });

function releaseFixture(lifecycleVersion = 4) { const root = mkdtempSync(resolve(tmpdir(), "rtb-release-")), artifacts = {}; for (const [format, name] of [["html", "book.html"], ["pdf", "book.pdf"], ["epub", "book.epub"]]) { const file = resolve(root, name); writeFileSync(file, `${format}-artifact`); artifacts[format] = { path: name, mediaType: "test/fixture", bytes: Buffer.byteLength(`${format}-artifact`), sha256: fileHash(file) }; } const bundleDirectory = resolve(root, "source-snapshot"); mkdirSync(bundleDirectory); writeFileSync(resolve(bundleDirectory, "book.md"), "# Source\n"); const snapshot = { hash: "b".repeat(64), repository: { revision: "c".repeat(40), tree: "d".repeat(40) }, bundle: { path: "source-snapshot", files: [{ path: "book.md", sha256: fileHash(resolve(bundleDirectory, "book.md")), bytes: 9 }] } }, verification = { sourceFingerprint: "a".repeat(64), status: "passed", semanticParity: { status: "passed" }, pdf: { vera: { "2a": { compliant: true }, ua1: { compliant: true } } }, artifacts }; const candidate = createCandidate({ projectId: "generic-consulting-book", lifecycleVersion, sourceFingerprint: "a".repeat(64), snapshot, verification, policies: { releaseEligible: true } }); writeJson(resolve(root, "candidate.json"), candidate); writeJson(resolve(root, "verification.json"), verification); return { root, candidate, snapshot, dispose: () => rmSync(root, { recursive: true, force: true }) }; }
test("PUB/REL candidate is deterministic, provider-neutral, and fails closed on drift", () => { const item = releaseFixture(); try { assert.equal(verifyCandidate(item.candidate), true); const duplicate = createCandidate({ projectId: item.candidate.projectId, lifecycleVersion: 4, sourceFingerprint: "a".repeat(64), snapshot: item.snapshot, verification: { status: "passed", semanticParity: { status: "passed" }, pdf: item.candidate.validators.pdf, artifacts: item.candidate.artifacts }, policies: { releaseEligible: true } }); assert.equal(duplicate.candidateHash, item.candidate.candidateHash); assert.match(item.candidate.futureStaging.reference, /^future-staging:/); assert.equal(item.candidate.futureStaging.activated, false); const changed = structuredClone(item.candidate); changed.artifacts.pdf.sha256 = "0".repeat(64); assert.throws(() => verifyCandidate(changed), /hash/); assert.equal(verifyReleaseDirectory(item.root, item.candidate), true); writeFileSync(resolve(item.root, "candidate.json"), "{\"tampered\":true}\n"); assert.throws(() => verifyReleaseDirectory(item.root, item.candidate), /candidate.json/); writeJson(resolve(item.root, "candidate.json"), item.candidate); writeFileSync(resolve(item.root, "unexpected.bin"), "x"); assert.throws(() => verifyReleaseDirectory(item.root, item.candidate), /extra/); } finally { item.dispose(); } });
test("REL manifest rejects candidate and caller-shaped eligibility without durable review evidence", () => { const item = releaseFixture(); try { registerReleaseCandidate(item.root, item.candidate); const approval = { id: "APR-PUBLISH-1", gate: "publish", decision: "approved", actor: { type: "human", id: "creator" }, explicitConfirmation: true, candidateHash: item.candidate.candidateHash, lifecycleVersion: 4, releasePolicyHash: "f".repeat(64), releasePolicy: { candidateHash: item.candidate.candidateHash, releaseEligible: true } }; assert.throws(() => createManifest(item.candidate, approval), /durable exact release-policy/); const pending = evaluateReleasePolicies({ id: item.candidate.projectId, root: item.root, legacyRoot: item.root }, item.candidate); assert.equal(pending.releaseEligible, false); assert.throws(() => createManifest(item.candidate, { ...approval, releasePolicyHash: pending.releasePolicyHash }, { releasePolicies: pending }), /blocking manual reviews/); } finally { item.dispose(); } });

async function publishable(item) {
  const chapterDirectory = resolve(item.root, "chapters"); mkdirSync(chapterDirectory);
  const chapterPath = resolve(chapterDirectory, "one.md");
  writeFileSync(chapterPath, "# One\n\nCanonical text.\n\n## Worksheet\n\n| Field | Value |\n| --- | --- |\n| Test | |\n");
  const metadataPath = resolve(item.root, "book.md"); writeFileSync(metadataPath, "# Fixture\n");
  writeFileSync(resolve(item.root, "blueprint.yaml"), "fixture: true\n");
  const book = {
    id: item.candidate.projectId, root: item.root, legacyRoot: item.root, metadataPath,
    metadata: "---\ntitle: Fixture\nversion: 1.0.0\nstatus: beta\n---\n",
    manifest: { locale: "en", paths: {}, blueprint: { path: "blueprint.yaml" } },
    blueprint: { source_policy: {}, budgets: {}, provider_egress_policy: {} },
    chapters: [{ id: "one", order: 1, part_id: "part-one", reader_decision: "Decide", required_output: "Decision", sourcePath: chapterPath }],
    parts: [{ id: "part-one", order: 1, title: "Start" }],
  };
  const provider = new CanonicalLifecycleBindingProvider({ book });
  const service = new LifecycleService({ root: item.root, projectId: book.id, bindingProvider: provider });
  assert.equal((await service.approve({ gate: "blueprint", expectedVersion: 0, actor: { type: "human", id: "creator" }, explicitConfirmation: true })).state, "succeeded");
  const payload = publicationExport(book), stateFile = resolve(item.root, ".rtb-publishing", "notion", "sync-state.json");
  mkdirSync(resolve(stateFile, ".."), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ chapters: Object.fromEntries(payload.chapters.map((chapter) => [chapter.id, { sourceHash: chapter.sourceHash }])) }));
  new BetaPreparationService({ book, bindingProvider: provider, actorResolver: () => ({ type: "human", id: "creator" }), stateFile }).prepare();
  assert.equal((await service.approve({ gate: "beta", expectedVersion: 1, actor: { type: "human", id: "creator" }, explicitConfirmation: true })).state, "succeeded");
  registerReleaseCandidate(item.root, item.candidate);
  const reviews = new ReleaseReviewService({ root: item.root, projectId: book.id, actorResolver: () => ({ type: "human", id: "creator" }) });
  reviews.record({ kind: "migration-visual-review", decision: "approved" });
  reviews.record({ kind: "pdf-screen-reader-visual-review", decision: "approved" });
  reviews.record({ kind: "rights-and-brand-review", decision: "approved", qualifiedRole: "publishing rights owner" });
  const published = await service.approve({ gate: "publish", expectedVersion: 2, actor: { type: "human", id: "creator" }, explicitConfirmation: true });
  assert.equal(published.state, "succeeded");
  return { book, reviews, published };
}

test("real lifecycle services atomically finalize current exact evidence", async () => {
  const item = releaseFixture(2);
  try {
    const { book, reviews, published } = await publishable(item);
    const finalized = finalizeRelease({ root: item.root, project: book, candidateHash: item.candidate.candidateHash, approvalId: published.approval.id });
    const releasePolicies = evaluateReleasePolicies(book, item.candidate);
    const ajv = new Ajv2020({ strict: false });
    assert.equal(ajv.compile(JSON.parse(readFileSync(resolve("schemas/publishing/release-candidate.schema.json"), "utf8")))(item.candidate), true);
    assert.equal(ajv.compile(JSON.parse(readFileSync(resolve("schemas/publishing/release-manifest.schema.json"), "utf8")))(finalized.manifest), true);
    assert.equal(verifyManifest(finalized.manifest, item.candidate, finalized.approval, { releasePolicies }), true);
    reviews.record({ kind: "migration-visual-review", decision: "rejected" });
    assert.throws(() => createManifest(item.candidate, finalized.approval, { releasePolicies }), /evidence changed/);
  } finally { item.dispose(); }
});

test("atomic finalization rechecks policy after preliminary evaluation and consumes no identity on rejection", async () => {
  const item = releaseFixture(2);
  try {
    const { book, reviews, published } = await publishable(item);
    assert.equal(evaluateReleasePolicies(book, item.candidate).releaseEligible, true);
    reviews.record({ kind: "migration-visual-review", decision: "rejected" });
    assert.throws(
      () => finalizeRelease({ root: item.root, project: book, candidateHash: item.candidate.candidateHash, approvalId: published.approval.id }),
      /current exact release-policy|blocking manual reviews/,
    );
    const database = openStateDatabase(resolve(item.root, ".rtb-state", "state.sqlite"));
    try { assert.equal(database.prepare("SELECT COUNT(*) AS count FROM release_identities").get().count, 0); }
    finally { database.close(); }
  } finally { item.dispose(); }
});
