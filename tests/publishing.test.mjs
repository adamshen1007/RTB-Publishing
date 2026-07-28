import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { createCandidate, verifyCandidate } from "../scripts/publishing/candidate.mjs";
import { fileHash, materialHash, writeJson } from "../scripts/publishing/common.mjs";
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
import { projectLockPath } from "../scripts/state/project-lock.mjs";

test("SEC-004 rejects active markup and unsafe URLs while permitting inert task boxes", () => { assert.throws(() => assertSafeMarkup('<img src="x" onerror="alert(1)">', "HTML"), /security/); assert.throws(() => assertSafeMarkup('<a href="javascript:alert(1)">bad</a>', "EPUB"), /security/); assert.doesNotThrow(() => assertSafeMarkup('<input type="checkbox"></input>', "HTML")); });

function releaseFixture(lifecycleVersion = 4) { const root = mkdtempSync(resolve(tmpdir(), "rtb-release-")), artifacts = {}; for (const [format, name] of [["html", "book.html"], ["pdf", "book.pdf"], ["epub", "book.epub"]]) { const file = resolve(root, name); writeFileSync(file, `${format}-artifact`); artifacts[format] = { path: name, mediaType: "test/fixture", bytes: Buffer.byteLength(`${format}-artifact`), sha256: fileHash(file) }; } const bundleDirectory = resolve(root, "source-snapshot"); mkdirSync(bundleDirectory); writeFileSync(resolve(bundleDirectory, "book.md"), "# Source\n"); const snapshot = { hash: "b".repeat(64), repository: { revision: "c".repeat(40), tree: "d".repeat(40) }, bundle: { path: "source-snapshot", files: [{ path: "book.md", sha256: fileHash(resolve(bundleDirectory, "book.md")), bytes: 9 }] } }, verification = { sourceFingerprint: "a".repeat(64), status: "passed", semanticParity: { status: "passed" }, pdf: { vera: { "2a": { compliant: true }, ua1: { compliant: true } } }, artifacts }; const candidate = createCandidate({ projectId: "generic-consulting-book", lifecycleVersion, sourceFingerprint: "a".repeat(64), snapshot, verification, policies: { releaseEligible: true } }); writeJson(resolve(root, "candidate.json"), candidate); writeJson(resolve(root, "verification.json"), verification); return { root, candidate, snapshot, dispose: () => rmSync(root, { recursive: true, force: true }) }; }
function releaseDirectory(item, name = "release") { const directory = resolve(item.root, name); mkdirSync(directory); for (const artifact of Object.values(item.candidate.artifacts)) copyFileSync(resolve(item.root, artifact.path), resolve(directory, artifact.path)); mkdirSync(resolve(directory, "source-snapshot")); copyFileSync(resolve(item.root, "source-snapshot", "book.md"), resolve(directory, "source-snapshot", "book.md")); writeJson(resolve(directory, "candidate.json"), item.candidate); writeJson(resolve(directory, "verification.json"), { sourceFingerprint: item.candidate.sourceFingerprint, ...item.candidate.validators, artifacts: item.candidate.artifacts }); return directory; }
test("PUB/REL candidate is deterministic, provider-neutral, and fails closed on drift", () => { const item = releaseFixture(); try { assert.equal(verifyCandidate(item.candidate), true); const duplicate = createCandidate({ projectId: item.candidate.projectId, lifecycleVersion: 4, sourceFingerprint: "a".repeat(64), snapshot: item.snapshot, verification: { status: "passed", semanticParity: { status: "passed" }, pdf: item.candidate.validators.pdf, artifacts: item.candidate.artifacts }, policies: { releaseEligible: true } }); assert.equal(duplicate.candidateHash, item.candidate.candidateHash); assert.match(item.candidate.futureStaging.reference, /^future-staging:/); assert.equal(item.candidate.futureStaging.activated, false); const changed = structuredClone(item.candidate); changed.artifacts.pdf.sha256 = "0".repeat(64); assert.throws(() => verifyCandidate(changed), /hash/); assert.equal(verifyReleaseDirectory(item.root, item.candidate), true); writeFileSync(resolve(item.root, "candidate.json"), "{\"tampered\":true}\n"); assert.throws(() => verifyReleaseDirectory(item.root, item.candidate), /candidate.json/); writeJson(resolve(item.root, "candidate.json"), item.candidate); writeFileSync(resolve(item.root, "unexpected.bin"), "x"); assert.throws(() => verifyReleaseDirectory(item.root, item.candidate), /extra/); } finally { item.dispose(); } });
test("REL policy remains blocked without durable exact review evidence", () => { const item = releaseFixture(); try { registerReleaseCandidate(item.root, item.candidate); assert.equal(evaluateReleasePolicies({ id: item.candidate.projectId, root: item.root, legacyRoot: item.root }, item.candidate).releaseEligible, false); } finally { item.dispose(); } });

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
  await new BetaPreparationService({ book, bindingProvider: provider, actorResolver: () => ({ type: "human", id: "creator" }), stateFile }).prepare();
  assert.equal((await service.approve({ gate: "beta", expectedVersion: 1, actor: { type: "human", id: "creator" }, explicitConfirmation: true })).state, "succeeded");
  registerReleaseCandidate(item.root, item.candidate);
  const reviews = new ReleaseReviewService({ root: item.root, projectId: book.id, actorResolver: () => ({ type: "human", id: "creator" }) });
  reviews.record({ kind: "migration-visual-review", decision: "approved" });
  reviews.record({ kind: "pdf-screen-reader-visual-review", decision: "approved" });
  reviews.record({ kind: "rights-and-brand-review", decision: "approved", qualifiedRole: "publishing rights owner" });
  const published = await service.approve({ gate: "publish", expectedVersion: 2, actor: { type: "human", id: "creator" }, explicitConfirmation: true });
  assert.equal(published.state, "succeeded");
  return { book, reviews, published, service };
}

test("real lifecycle services atomically finalize current exact evidence", async () => {
  const item = releaseFixture(2);
  try {
    const { book, published, service } = await publishable(item);
    const directory = releaseDirectory(item), finalized = await finalizeRelease({ root: item.root, project: book, candidateHash: item.candidate.candidateHash, approvalId: published.approval.id, releaseDirectory: directory, hooks: { beforeCompleteCommit: () => assert.throws(() => openSync(projectLockPath(item.root), "wx"), /EEXIST/, "a concurrent app build cannot acquire the publication lock") } });
    const ajv = new Ajv2020({ strict: false });
    assert.equal(ajv.compile(JSON.parse(readFileSync(resolve("schemas/publishing/release-candidate.schema.json"), "utf8")))(item.candidate), true);
    assert.equal(ajv.compile(JSON.parse(readFileSync(resolve("schemas/publishing/release-manifest.schema.json"), "utf8")))(finalized.manifest), true);
    assert.equal(verifyReleaseDirectory(directory, item.candidate, { manifest: finalized.manifest, root: item.root }), true);
    const { manifestHash, ...syntheticMaterial } = finalized.manifest, synthetic = { ...syntheticMaterial, approval: { ...syntheticMaterial.approval, id: "APR-SYNTHETIC" } }; synthetic.manifestHash = materialHash(synthetic);
    writeJson(resolve(directory, "manifest.json"), synthetic);
    assert.throws(() => verifyReleaseDirectory(directory, item.candidate, { manifest: synthetic, root: item.root }), /completed durable finalization/);
    writeJson(resolve(directory, "manifest.json"), finalized.manifest);
    assert.equal((await service.invalidateBlueprint({ expectedVersion: 3, changedFields: ["reader"] })).state, "succeeded");
    assert.equal(verifyReleaseDirectory(directory, item.candidate, { manifest: finalized.manifest, root: item.root }), true, "later invalidation does not rewrite historical integrity");
  } finally { item.dispose(); }
});

test("atomic finalization rechecks policy after preliminary evaluation and consumes no identity on rejection", async () => {
  const item = releaseFixture(2);
  try {
    const { book, reviews, published } = await publishable(item);
    assert.equal(evaluateReleasePolicies(book, item.candidate).releaseEligible, true);
    reviews.record({ kind: "migration-visual-review", decision: "rejected" });
    const directory = releaseDirectory(item);
    await assert.rejects(
      () => finalizeRelease({ root: item.root, project: book, candidateHash: item.candidate.candidateHash, approvalId: published.approval.id, releaseDirectory: directory }),
      /current exact release-policy|blocking manual reviews/,
    );
    const database = openStateDatabase(resolve(item.root, ".rtb-state", "state.sqlite"));
    try { assert.equal(database.prepare("SELECT COUNT(*) AS count FROM release_identities").get().count, 0); }
    finally { database.close(); }
  } finally { item.dispose(); }
});

test("pending finalization resumes after manifest write and verification failures", async () => {
  for (const failure of ["write", "verify"]) {
    const item = releaseFixture(2);
    try {
      const { book, published } = await publishable(item), directory = releaseDirectory(item, `release-${failure}`);
      const hooks = failure === "write" ? { writeManifest: () => { throw new Error("injected manifest write failure"); } } : { afterManifestWrite: () => writeFileSync(resolve(directory, "book.pdf"), "corrupt") };
      await assert.rejects(() => finalizeRelease({ root: item.root, project: book, candidateHash: item.candidate.candidateHash, approvalId: published.approval.id, releaseDirectory: directory, hooks }), /injected manifest write failure|Release artifact drift/);
      const database = openStateDatabase(resolve(item.root, ".rtb-state", "state.sqlite"));
      try { assert.equal(database.prepare("SELECT status FROM release_finalizations").get().status, "pending"); assert.equal(database.prepare("SELECT status FROM release_identities").get().status, "pending"); }
      finally { database.close(); }
      if (failure === "verify") copyFileSync(resolve(item.root, "book.pdf"), resolve(directory, "book.pdf"));
      const resumed = await finalizeRelease({ root: item.root, project: book, candidateHash: item.candidate.candidateHash, approvalId: published.approval.id, releaseDirectory: directory });
      assert.equal(verifyReleaseDirectory(directory, item.candidate, { manifest: resumed.manifest, root: item.root }), true);
    } finally { item.dispose(); }
  }
});

test("publication lock stability recheck rolls back canonical and receipt interleavings", async () => {
  for (const mutation of ["canonical", "receipt"]) {
    const item = releaseFixture(2);
    try {
      const { book, published } = await publishable(item), directory = releaseDirectory(item, `release-${mutation}`);
      const beforePrepareCommit = () => mutation === "canonical"
        ? writeFileSync(book.chapters[0].sourcePath, "# Changed during finalization\n")
        : writeFileSync(resolve(item.root, ".rtb-publishing", "notion", "sync-state.json"), JSON.stringify({ chapters: {} }));
      await assert.rejects(() => finalizeRelease({ root: item.root, project: book, candidateHash: item.candidate.candidateHash, approvalId: published.approval.id, releaseDirectory: directory, hooks: { beforePrepareCommit } }), /changed before finalization commit/);
      const database = openStateDatabase(resolve(item.root, ".rtb-state", "state.sqlite"));
      try { assert.equal(database.prepare("SELECT COUNT(*) AS count FROM release_finalizations").get().count, 0); assert.equal(database.prepare("SELECT COUNT(*) AS count FROM release_identities").get().count, 0); }
      finally { database.close(); }
    } finally { item.dispose(); }
  }
});

test("legacy reserved identity is adopted only from an exact existing manifest", async () => {
  const item = releaseFixture(2);
  try {
    const { book, published } = await publishable(item), directory = releaseDirectory(item, "legacy-release");
    await assert.rejects(() => finalizeRelease({ root: item.root, project: book, candidateHash: item.candidate.candidateHash, approvalId: published.approval.id, releaseDirectory: directory, hooks: { afterManifestWrite: () => { throw new Error("simulate legacy interruption"); } } }), /legacy interruption/);
    const database = openStateDatabase(resolve(item.root, ".rtb-state", "state.sqlite"));
    try { database.prepare("DELETE FROM release_finalizations").run(); database.prepare("UPDATE release_identities SET status = 'reserved'").run(); }
    finally { database.close(); }
    const adopted = await finalizeRelease({ root: item.root, project: book, candidateHash: item.candidate.candidateHash, approvalId: published.approval.id, releaseDirectory: directory });
    assert.equal(verifyReleaseDirectory(directory, item.candidate, { manifest: adopted.manifest, root: item.root }), true);
  } finally { item.dispose(); }
});

test("migration-007 completed finalizations backfill exact historical approval facts", async () => {
  const item = releaseFixture(2);
  try {
    const { book, published } = await publishable(item), directory = releaseDirectory(item, "migration-007-safe");
    const { manifest } = await finalizeRelease({ root: item.root, project: book, candidateHash: item.candidate.candidateHash, approvalId: published.approval.id, releaseDirectory: directory });
    const database = openStateDatabase(resolve(item.root, ".rtb-state", "state.sqlite"));
    try { database.prepare("UPDATE release_finalizations SET approval_actor_type = NULL, approval_actor_id = NULL, approval_created_at = NULL, approval_lifecycle_version = NULL, approval_bindings_json = NULL, completed_while_current = 0").run(); }
    finally { database.close(); }
    assert.equal(verifyReleaseDirectory(directory, item.candidate, { manifest, root: item.root }), true);
    const verified = openStateDatabase(resolve(item.root, ".rtb-state", "state.sqlite"));
    try { const row = verified.prepare("SELECT * FROM release_finalizations").get(); assert.equal(row.completed_while_current, 1); assert.equal(row.approval_actor_id, "creator"); }
    finally { verified.close(); }
  } finally { item.dispose(); }
});

test("migration-007 backfill rejects every independently corrupted redundant authority", async (context) => {
  const bindingMutation = (change) => (database, approval) => { const bindings = JSON.parse(approval.bindings_json); change(bindings); database.prepare("UPDATE lifecycle_approvals SET bindings_json = ? WHERE id = ?").run(JSON.stringify(bindings), approval.id); };
  const candidateMutation = (change) => (database) => { const row = database.prepare("SELECT * FROM release_candidates").get(), candidate = JSON.parse(row.candidate_json); change(candidate); database.prepare("UPDATE release_candidates SET candidate_json = ? WHERE candidate_hash = ?").run(JSON.stringify(candidate), row.candidate_hash); };
  const cases = {
    "identity project": (db) => db.prepare("UPDATE release_identities SET project_id = 'wrong-project'").run(),
    "identity status": (db) => db.prepare("UPDATE release_identities SET status = 'reserved'").run(),
    "candidate source": candidateMutation((candidate) => { candidate.sourceFingerprint = "0".repeat(64); }),
    "candidate artifact": candidateMutation((candidate) => { candidate.artifacts.pdf.sha256 = "0".repeat(64); }),
    "approval actor": (db, approval) => db.prepare("UPDATE lifecycle_approvals SET actor_type = 'agent' WHERE id = ?").run(approval.id),
    "approval timestamp": (db, approval) => db.prepare("UPDATE lifecycle_approvals SET created_at = '2999-01-01T00:00:00.000Z' WHERE id = ?").run(approval.id),
    "approval lifecycle": (db, approval) => db.prepare("UPDATE lifecycle_approvals SET lifecycle_version = lifecycle_version + 2 WHERE id = ?").run(approval.id),
    "candidate binding": bindingMutation((bindings) => { bindings.releaseCandidateHash = "0".repeat(64); }),
    "policy binding": bindingMutation((bindings) => { bindings.releasePolicyHash = "0".repeat(64); }),
    "blocking findings": bindingMutation((bindings) => { bindings.blockingFindings = 1; }),
    "Beta binding": bindingMutation((bindings) => { bindings.beta.betaSnapshotHash = "0".repeat(64); }),
    "historical review policy": (db) => { db.exec("DROP TRIGGER release_reviews_no_update"); db.prepare("UPDATE release_reviews SET decision = 'rejected' WHERE kind = 'migration-visual-review'").run(); },
    "manifest JSON": (db) => db.prepare("UPDATE release_finalizations SET manifest_json = '{}'").run(),
    "manifest hash": (db) => db.prepare("UPDATE release_finalizations SET manifest_hash = ?").run("0".repeat(64)),
    "finalization project": (db) => db.prepare("UPDATE release_finalizations SET project_id = 'wrong-project'").run(),
    "pre-completion invalidation": (db, approval) => db.prepare("INSERT INTO lifecycle_approval_invalidations (id, approval_id, project_id, reason, created_at) VALUES (?, ?, ?, ?, ?)").run("INV-MIGRATION-007", approval.id, approval.project_id, "pre-completion invalidation", approval.created_at),
  };
  for (const [name, mutate] of Object.entries(cases)) await context.test(name, async () => {
    const item = releaseFixture(2);
    try {
      const { book, published } = await publishable(item), directory = releaseDirectory(item, `migration-007-${name.replaceAll(" ", "-")}`), { manifest } = await finalizeRelease({ root: item.root, project: book, candidateHash: item.candidate.candidateHash, approvalId: published.approval.id, releaseDirectory: directory });
      const database = openStateDatabase(resolve(item.root, ".rtb-state", "state.sqlite"));
      try { const approval = database.prepare("SELECT * FROM lifecycle_approvals WHERE id = ?").get(published.approval.id); database.prepare("UPDATE release_finalizations SET approval_actor_type = NULL, approval_actor_id = NULL, approval_created_at = NULL, approval_lifecycle_version = NULL, approval_bindings_json = NULL, completed_while_current = 0").run(); mutate(database, approval); }
      finally { database.close(); }
      assert.throws(() => verifyReleaseDirectory(directory, item.candidate, { manifest, root: item.root }), /requires approval-facts reconciliation/);
    } finally { item.dispose(); }
  });
});
