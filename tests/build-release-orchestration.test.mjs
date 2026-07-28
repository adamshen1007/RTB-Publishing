import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import test from "node:test";
import { buildRelease } from "../scripts/publishing/project-build.mjs";
import { fileHash, materialHash, writeJson } from "../scripts/publishing/common.mjs";
import { finalizeRelease } from "../scripts/publishing/finalize-release.mjs";
import { verifyReleaseDirectory } from "../scripts/publishing/verify-release.mjs";
import { cleanOutputs } from "../scripts/clean.mjs";
import { CanonicalLifecycleBindingProvider } from "../scripts/lifecycle/bindings.mjs";
import { BetaPreparationService } from "../scripts/lifecycle/beta-preparation.mjs";
import { LifecycleService } from "../scripts/lifecycle/service.mjs";
import { ReleaseReviewService } from "../scripts/publishing/release-review-service.mjs";
import { publicationExport } from "../scripts/notion-publication.mjs";
import { openStateDatabase } from "../scripts/state/database.mjs";

function fixture() {
  const workspaceRoot = mkdtempSync(resolve(tmpdir(), "rtb-real-build-")), legacyRoot = resolve(workspaceRoot, "books", "nested"), chapterDirectory = resolve(legacyRoot, "chapters"); mkdirSync(chapterDirectory, { recursive: true });
  const chapterPath = resolve(chapterDirectory, "one.md"), metadataPath = resolve(legacyRoot, "book.md");
  writeFileSync(chapterPath, "# One\n\nCanonical text.\n\n## Worksheet\n\n| Field | Value |\n| --- | --- |\n| Test | |\n"); writeFileSync(metadataPath, "# Fixture\n"); writeFileSync(resolve(legacyRoot, "blueprint.yaml"), "fixture: true\n");
  const project = { id: "nested-book", root: legacyRoot, legacyRoot, workspaceRoot, metadataPath, metadata: "---\ntitle: Fixture\nversion: 1.0.0\nstatus: beta\n---\n", manifest: { locale: "en", paths: {}, blueprint: { path: "blueprint.yaml" } }, blueprint: { source_policy: {}, budgets: {}, provider_egress_policy: {} }, chapters: [{ id: "one", order: 1, part_id: "part-one", reader_decision: "Decide", required_output: "Decision", sourcePath: chapterPath }], parts: [{ id: "part-one", order: 1, title: "Start" }], outputProfiles: ["html", "pdf", "epub"].map((format) => ({ format, path: `nested-book.${format}` })) };
  return { workspaceRoot, legacyRoot, project, buildRoot: resolve(workspaceRoot, "build", "publishing"), candidateRoot: resolve(workspaceRoot, "dist", "candidates"), releaseRoot: resolve(workspaceRoot, "dist", "releases"), dispose: () => rmSync(workspaceRoot, { recursive: true, force: true }) };
}

function deterministicOrchestration(content = "v1") {
  const repository = { revision: "c".repeat(40), tree: "d".repeat(40) };
  const render = (format) => (_snapshot, file) => writeFileSync(file, `${format}-${content}`);
  return {
    pdfTools: () => ({}),
    prepareSnapshot: (_project, root) => { mkdirSync(root, { recursive: true }); const markdown = resolve(root, "book.md"); writeFileSync(markdown, "# Snapshot\n"); writeJson(resolve(root, "snapshot.json"), { schemaVersion: 1, content }); return { root, markdown, record: { sourceFingerprint: "a".repeat(64), authority: "test-canonical", canonicalSnapshotHash: "b".repeat(64), repository, files: [{ path: "book.md" }], materials: { repository } } }; },
    renderHtml: render("html"), renderEpub: render("epub"), renderPdf: (snapshot, file) => { render("pdf")(snapshot, file); return { tools: {}, derived: { renderer: "deterministic-test" } }; }, verifySnapshot: () => true,
    verifyFormats: async ({ outputs, sourceFingerprint }) => ({ schemaVersion: 1, sourceFingerprint, status: "passed", semanticParity: { status: "passed" }, html: { status: "passed" }, epub: { status: "passed" }, pdf: { status: "passed" }, artifacts: Object.fromEntries(Object.entries(outputs).map(([format, file]) => [format, { path: basename(file), mediaType: `test/${format}`, bytes: statSync(file).size, sha256: fileHash(file) }])) }),
  };
}

async function approve(project, candidate) {
  const provider = new CanonicalLifecycleBindingProvider({ book: project }), service = new LifecycleService({ root: project.legacyRoot, projectId: project.id, bindingProvider: provider });
  await service.approve({ gate: "blueprint", expectedVersion: 0, actor: { type: "human", id: "creator" }, explicitConfirmation: true });
  const payload = publicationExport(project), stateFile = resolve(project.legacyRoot, ".rtb-publishing", "notion", "sync-state.json"); mkdirSync(resolve(stateFile, ".."), { recursive: true }); writeJson(stateFile, { chapters: Object.fromEntries(payload.chapters.map((chapter) => [chapter.id, { sourceHash: chapter.sourceHash }])) });
  await new BetaPreparationService({ book: project, bindingProvider: provider, actorResolver: () => ({ type: "human", id: "creator" }), stateFile }).prepare(); await service.approve({ gate: "beta", expectedVersion: 1, actor: { type: "human", id: "creator" }, explicitConfirmation: true });
  const database = openStateDatabase(resolve(project.legacyRoot, ".rtb-state", "state.sqlite")); try { database.prepare("UPDATE release_candidates SET created_at = ? WHERE candidate_hash = ?").run(new Date().toISOString(), candidate.candidateHash); } finally { database.close(); }
  const reviews = new ReleaseReviewService({ root: project.legacyRoot, projectId: project.id, actorResolver: () => ({ type: "human", id: "creator" }) }); for (const kind of ["migration-visual-review", "pdf-screen-reader-visual-review"]) reviews.record({ kind, decision: "approved" }); reviews.record({ kind: "rights-and-brand-review", decision: "approved", qualifiedRole: "publishing rights owner" });
  return (await service.approve({ gate: "publish", expectedVersion: 2, actor: { type: "human", id: "creator" }, explicitConfirmation: true })).approval;
}

test("real buildRelease adopts legacy finalization and promotes without staging identity leakage", async () => {
  const item = fixture();
  try {
    const options = { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot, orchestration: deterministicOrchestration() }, first = await buildRelease(item.project, options), approval = await approve(item.project, first.candidate), legacyRelease = resolve(item.releaseRoot, item.project.id);
    assert.equal(first.release, null); assert.equal(first.candidateDirectory, resolve(item.candidateRoot, item.project.id, first.candidate.candidateHash)); assert.equal(existsSync(legacyRelease), false, "candidate-only build cannot enter the release namespace");
    cpSync(first.candidateDirectory, legacyRelease, { recursive: true });
    const finalized = await finalizeRelease({ root: item.legacyRoot, workspaceRoot: item.workspaceRoot, project: item.project, candidateHash: first.candidate.candidateHash, approvalId: approval.id, releaseDirectory: legacyRelease });
    const database = openStateDatabase(resolve(item.legacyRoot, ".rtb-state", "state.sqlite")); try { database.prepare("DELETE FROM release_finalizations").run(); database.prepare("UPDATE release_identities SET status = 'reserved'").run(); } finally { database.close(); }
    const result = await buildRelease(item.project, { ...options, approvalId: approval.id });
    assert.equal(result.release, resolve(item.releaseRoot, "immutable", item.project.id, result.manifest.releaseId)); assert.equal(verifyReleaseDirectory(result.release, result.candidate, { manifest: result.manifest, root: item.legacyRoot }), true); assert.equal(result.manifest.manifestHash, finalized.manifest.manifestHash);
    assert.equal(JSON.stringify({ candidate: result.candidate, manifest: result.manifest }).includes(".staging"), false); for (const output of Object.values(result.outputs)) assert.equal(resolve(output).startsWith(`${result.release}/`), true);
  } finally { item.dispose(); }
});

test("real buildRelease excludes concurrent clean, recovers interrupted activation, and candidates cannot overwrite a completed release", async () => {
  const item = fixture();
  try {
    const base = { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot }, first = await buildRelease(item.project, { ...base, orchestration: deterministicOrchestration("old") }), approval = await approve(item.project, first.candidate);
    let cleaning;
    await assert.rejects(() => buildRelease(item.project, { ...base, approvalId: approval.id, orchestration: deterministicOrchestration("old"), hooks: { afterPromotionRename: async ({ release }) => { cleaning = cleanOutputs({ root: item.workspaceRoot, buildDirectory: resolve(item.workspaceRoot, "build"), distributionDirectory: resolve(item.workspaceRoot, "dist") }); await new Promise((done) => setTimeout(done, 50)); assert.equal(existsSync(release), true); }, beforePromotionVerification: () => { throw new Error("injected post-rename verification failure"); }, afterPromotionRollback: ({ release }) => assert.equal(existsSync(release), false, "unverified release is removed before locks are released") } }), /injected post-rename/);
    await cleaning; assert.equal(existsSync(resolve(item.workspaceRoot, "dist")), false, "clean runs only after build releases the workspace lock");
    const retried = await buildRelease(item.project, { ...base, approvalId: approval.id, orchestration: deterministicOrchestration("old") }); assert.equal(existsSync(retried.release), true); const immutableHash = JSON.parse(readFileSync(resolve(retried.release, "candidate.json"), "utf8")).candidateHash;
    const candidateOnly = await buildRelease(item.project, { ...base, orchestration: deterministicOrchestration("new") }); assert.equal(candidateOnly.release, null); assert.notEqual(candidateOnly.candidate.candidateHash, immutableHash); assert.equal(JSON.parse(readFileSync(resolve(retried.release, "candidate.json"), "utf8")).candidateHash, immutableHash);
  } finally { item.dispose(); }
});

test("promotion failures remain pending until a verified immutable retry completes the exact ledger", async (context) => {
  const failures = {
    "before immutable verification": { beforePromotionVerification: () => { throw new Error("fault-before-verification"); } },
    "after immutable verification": { afterPromotionVerification: () => { throw new Error("fault-after-verification"); } },
    "after durable verified marker": { promotionBoundary: (event) => { if (event === "after-marker-verified") throw new Error("fault-after-verified-marker"); } },
  };
  for (const [name, hooks] of Object.entries(failures)) await context.test(name, async () => {
    const item = fixture();
    try {
      const base = { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot, orchestration: deterministicOrchestration(name) };
      const candidate = await buildRelease(item.project, base), approval = await approve(item.project, candidate.candidate);
      await assert.rejects(() => buildRelease(item.project, { ...base, approvalId: approval.id, hooks }), /fault-/);
      let database = openStateDatabase(resolve(item.legacyRoot, ".rtb-state", "state.sqlite"));
      try { assert.equal(database.prepare("SELECT status FROM release_finalizations").get().status, "pending"); assert.equal(database.prepare("SELECT status FROM release_identities").get().status, "pending"); }
      finally { database.close(); }
      const completed = await buildRelease(item.project, { ...base, approvalId: approval.id });
      database = openStateDatabase(resolve(item.legacyRoot, ".rtb-state", "state.sqlite"));
      try { const finalization = database.prepare("SELECT * FROM release_finalizations").get(), identity = database.prepare("SELECT * FROM release_identities").get(); assert.equal(finalization.status, "completed"); assert.equal(identity.status, "completed"); assert.equal(identity.release_id, completed.manifest.releaseId); assert.equal(finalization.manifest_hash, completed.manifest.manifestHash); }
      finally { database.close(); }
    } finally { item.dispose(); }
  });
});

test("immutable release verification rejects external and internal symbolic links without mutating targets", async () => {
  const item = fixture();
  try {
    const base = { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot, orchestration: deterministicOrchestration("links") };
    const candidate = await buildRelease(item.project, base), approval = await approve(item.project, candidate.candidate);
    const releaseId = `REL-${materialHash({ candidateHash: candidate.candidate.candidateHash, approvalId: approval.id }).slice(0, 20).toUpperCase()}`, release = resolve(item.releaseRoot, "immutable", item.project.id, releaseId), outsideDirectory = resolve(item.workspaceRoot, "outside-release");
    mkdirSync(resolve(release, ".."), { recursive: true }); mkdirSync(outsideDirectory); writeFileSync(resolve(outsideDirectory, "proof"), "untouched"); symlinkSync(outsideDirectory, release);
    await assert.rejects(() => buildRelease(item.project, { ...base, approvalId: approval.id }), /symbolic link|escapes its trusted/);
    assert.equal(readFileSync(resolve(outsideDirectory, "proof"), "utf8"), "untouched"); unlinkSync(release);
    const completed = await buildRelease(item.project, { ...base, approvalId: approval.id });
    const outsideArtifact = resolve(item.workspaceRoot, "outside-artifact"); writeFileSync(outsideArtifact, readFileSync(resolve(completed.release, "nested-book.pdf")));
    unlinkSync(resolve(completed.release, "nested-book.pdf")); symlinkSync(outsideArtifact, resolve(completed.release, "nested-book.pdf"));
    assert.throws(() => verifyReleaseDirectory(completed.release, completed.candidate, { manifest: completed.manifest, root: item.legacyRoot, immutableRoot: resolve(item.releaseRoot, "immutable") }), /symbolic links/);
    assert.equal(readFileSync(outsideArtifact, "utf8"), "pdf-links");
  } finally { item.dispose(); }
});
