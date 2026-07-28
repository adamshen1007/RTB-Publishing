import assert from "node:assert/strict";
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";
import test from "node:test";
import { buildRelease } from "../scripts/publishing/project-build.mjs";
import { fileHash, materialHash, writeJson } from "../scripts/publishing/common.mjs";
import { finalizeRelease, promoteFinalizedRelease } from "../scripts/publishing/finalize-release.mjs";
import { verifyReleaseDirectory } from "../scripts/publishing/verify-release.mjs";
import { cleanOutputs } from "../scripts/clean.mjs";
import { CanonicalLifecycleBindingProvider } from "../scripts/lifecycle/bindings.mjs";
import { BetaPreparationService } from "../scripts/lifecycle/beta-preparation.mjs";
import { LifecycleService } from "../scripts/lifecycle/service.mjs";
import { ReleaseReviewService } from "../scripts/publishing/release-review-service.mjs";
import { publicationExport } from "../scripts/notion-publication.mjs";
import { openStateDatabase } from "../scripts/state/database.mjs";
import { acquireProjectLock, acquireWorkspaceOutputLock } from "../scripts/state/project-lock.mjs";
import { resolveBookProject } from "../scripts/books/discovery.mjs";
import { initializeSnapshots, materializeSnapshot, readPointer, snapshotRoot, writePointer } from "../scripts/state/snapshots.mjs";

function fixture({ snapshots = false } = {}) {
  const workspaceRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "rtb-real-build-"))), legacyRoot = resolve(workspaceRoot, "books", "nested");
  cpSync(resolve("tests/fixtures/books/one-chapter"), legacyRoot, { recursive: true });
  const manifestPath = resolve(legacyRoot, "book.project.yaml"), manifest = readFileSync(manifestPath, "utf8").replace("output_profiles: [{ id: web-edition, format: html, path: outputs/index.html }]", "output_profiles: [{ id: web-edition, format: html, path: outputs/index.html }, { id: pdf-edition, format: pdf, path: outputs/book.pdf }, { id: epub-edition, format: epub, path: outputs/book.epub }]"); writeFileSync(manifestPath, manifest);
  if (snapshots) initializeSnapshots(legacyRoot);
  const project = resolveBookProject(legacyRoot, { workspaceRoot });
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

function advancePointer(root, _label) { const prior = readPointer(root), next = materializeSnapshot(root, { sourceRoot: snapshotRoot(root, prior.snapshotHash) }); return writePointer(root, { expected: prior, nextSnapshotHash: next.hash, nextVersion: prior.version + 1 }); }

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

test("public promotion boundary rejects missing, stale, wrong-root, and caller-selected authority before mutation", async () => {
  const item = fixture(), outside = mkdtempSync(resolve(tmpdir(), "rtb-wrong-workspace-"));
  const manifest = { projectId: item.project.id, releaseId: "REL-BOUNDARY-TEST", manifestHash: "f".repeat(64) }, candidate = { projectId: item.project.id };
  const call = (extra = {}) => promoteFinalizedRelease({ root: item.legacyRoot, workspaceRoot: item.workspaceRoot, project: item.project, candidate, manifest, token: "00000000-0000-4000-8000-000000000001", ...extra });
  const noMutation = () => assert.equal(existsSync(resolve(item.workspaceRoot, "dist", "releases", "immutable", ".promotion-state")), false);
  try {
    await assert.rejects(() => call(), /live workspace and project lock authority/); noMutation();
    let workspaceLock = await acquireWorkspaceOutputLock(item.workspaceRoot, { ownerId: "released-workspace" }), projectLock = await acquireProjectLock(item.legacyRoot, { ownerId: "released-project" });
    workspaceLock.release(); projectLock.release();
    await assert.rejects(() => call({ heldWorkspaceLock: workspaceLock, heldLock: projectLock }), /live unforgeable/); noMutation();
    workspaceLock = await acquireWorkspaceOutputLock(outside, { ownerId: "wrong-workspace" }); projectLock = await acquireProjectLock(item.legacyRoot, { ownerId: "right-project" });
    await assert.rejects(() => call({ workspaceRoot: outside, heldWorkspaceLock: workspaceLock, heldLock: projectLock }), /not the exact discovered project/); noMutation();
    workspaceLock.release(); projectLock.release();
    workspaceLock = await acquireWorkspaceOutputLock(item.workspaceRoot, { ownerId: "right-workspace" }); projectLock = await acquireProjectLock(item.legacyRoot, { ownerId: "right-project" });
    await assert.rejects(() => call({ heldWorkspaceLock: workspaceLock, heldLock: projectLock, outputRoot: outside }), /cannot select/); noMutation();
    const forgedProject = { ...item.project, id: "forged-project" }, forgedManifest = { ...manifest, projectId: "forged-project" };
    await assert.rejects(() => call({ project: forgedProject, manifest: forgedManifest, heldWorkspaceLock: workspaceLock, heldLock: projectLock }), /current workspace discovery/); noMutation();
    workspaceLock.release(); projectLock.release();
    const module = await import("../scripts/publishing/finalize-release.mjs");
    assert.equal("completeFinalizedRelease" in module, false, "callers cannot obtain or replay the one-time completion capability");
  } finally { item.dispose(); rmSync(outside, { recursive: true, force: true }); }
});

test("publishing rejects symlinked project and output namespace ancestors before external mutation", async (context) => {
  for (const kind of ["project", "dist", "candidates", "immutable"]) await context.test(kind, async () => {
    const item = fixture(), external = realpathSync(mkdtempSync(resolve(tmpdir(), `rtb-external-${kind}-`)));
    try {
      const base = { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot, orchestration: deterministicOrchestration(kind) };
      let project = item.project, approvalId = null;
      if (kind === "project") { const link = resolve(item.workspaceRoot, "books", "linked"); symlinkSync(item.legacyRoot, link); project = { ...item.project, legacyRoot: link, workspacePath: "books/linked" }; }
      if (kind === "dist") symlinkSync(external, resolve(item.workspaceRoot, "dist"));
      if (kind === "candidates") { mkdirSync(resolve(item.workspaceRoot, "dist")); symlinkSync(external, item.candidateRoot); }
      if (kind === "immutable") { const candidateOnly = await buildRelease(project, base); approvalId = (await approve(project, candidateOnly.candidate)).id; mkdirSync(item.releaseRoot, { recursive: true }); symlinkSync(external, resolve(item.releaseRoot, "immutable")); }
      await assert.rejects(() => buildRelease(project, { ...base, approvalId }), /symbolic link/);
      assert.equal(existsSync(resolve(external, ".staging")), false);
    } finally { item.dispose(); rmSync(external, { recursive: true, force: true }); }
  });
});

test("approved build prints a fully quoted exact verification command that executes", async () => {
  const workspaceRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "rtb-command-workspace-"))), projectRoot = resolve(workspaceRoot, "books", "yc playbook;safe");
  try {
    cpSync(resolve("books/volume-01-yc-playbook"), projectRoot, { recursive: true });
    const project = resolveBookProject(projectRoot, { workspaceRoot }), base = { lifecycleVersion: 2, workspaceRoot, buildRoot: resolve(workspaceRoot, "build", "publishing"), candidateRoot: resolve(workspaceRoot, "dist", "candidates"), releaseRoot: resolve(workspaceRoot, "dist", "releases"), orchestration: deterministicOrchestration("command") };
    const candidateOnly = await buildRelease(project, base), approval = await approve(project, candidateOnly.candidate), completed = await buildRelease(project, { ...base, approvalId: approval.id });
    assert.match(completed.verificationCommand, new RegExp(completed.manifest.releaseId));
    assert.match(completed.verificationCommand, /'[^']*rtb-command-workspace-[^']*'/);
    const verified = spawnSync(completed.verificationCommand, { cwd: process.cwd(), shell: true, encoding: "utf8" });
    assert.equal(verified.status, 0, `${verified.stderr}\n${verified.stdout}`); assert.match(verified.stdout, /Verified immutable release/);
  } finally { rmSync(workspaceRoot, { recursive: true, force: true }); }
});

test("real buildRelease excludes concurrent clean, recovers interrupted activation, and candidates cannot overwrite a completed release", async () => {
  const item = fixture();
  try {
    const base = { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot }, first = await buildRelease(item.project, { ...base, orchestration: deterministicOrchestration("old") }), approval = await approve(item.project, first.candidate);
    let cleaning;
    await assert.rejects(() => buildRelease(item.project, { ...base, approvalId: approval.id, orchestration: deterministicOrchestration("old"), hooks: { afterPromotionRename: async ({ release }) => { cleaning = cleanOutputs({ root: item.workspaceRoot, buildDirectory: resolve(item.workspaceRoot, "build"), distributionDirectory: resolve(item.workspaceRoot, "dist") }); await new Promise((done) => setTimeout(done, 50)); assert.equal(existsSync(release), true); }, beforePromotionVerification: () => { throw new Error("injected post-rename verification failure"); }, afterPromotionRollback: ({ release }) => assert.equal(existsSync(release), false, "unverified release is removed before locks are released") } }), /injected post-rename/);
    await cleaning; assert.equal(existsSync(resolve(item.releaseRoot, "immutable", item.project.id, `REL-${materialHash({ candidateHash: first.candidate.candidateHash, approvalId: approval.id }).slice(0, 20).toUpperCase()}`)), false, "no immutable bundle remains after failed verification");
    const retried = await buildRelease(item.project, { ...base, approvalId: approval.id, orchestration: deterministicOrchestration("old") }); assert.equal(existsSync(retried.release), true); const immutableHash = JSON.parse(readFileSync(resolve(retried.release, "candidate.json"), "utf8")).candidateHash;
    const candidateOnly = await buildRelease(item.project, { ...base, orchestration: deterministicOrchestration("new") }); assert.equal(candidateOnly.release, null); assert.notEqual(candidateOnly.candidate.candidateHash, immutableHash); assert.equal(JSON.parse(readFileSync(resolve(retried.release, "candidate.json"), "utf8")).candidateHash, immutableHash);
  } finally { item.dispose(); }
});

test("promotion failures remain pending until a verified immutable retry completes the exact ledger", async (context) => {
  const failures = {
    "before immutable verification": { hooks: { beforePromotionVerification: () => { throw new Error("fault-before-verification"); } }, status: "pending" },
    "after immutable verification": { hooks: { afterPromotionVerification: () => { throw new Error("fault-after-verification"); } }, status: "pending" },
    "after durable material marker": { hooks: { promotionBoundary: (event) => { if (event === "after-marker-material-verified") throw new Error("fault-after-material-marker"); } }, status: "pending" },
    "after ledger commit before durable marker": { hooks: { promotionBoundary: (event) => { if (event === "before-marker-ledger-completed") throw new Error("fault-before-ledger-marker"); } }, status: "completed" },
  };
  for (const [name, failure] of Object.entries(failures)) await context.test(name, async () => {
    const item = fixture();
    try {
      const base = { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot, orchestration: deterministicOrchestration(name) };
      const candidate = await buildRelease(item.project, base), approval = await approve(item.project, candidate.candidate);
      await assert.rejects(() => buildRelease(item.project, { ...base, approvalId: approval.id, hooks: failure.hooks }), /fault-/);
      let database = openStateDatabase(resolve(item.legacyRoot, ".rtb-state", "state.sqlite"));
      try { assert.equal(database.prepare("SELECT status FROM release_finalizations").get().status, failure.status); assert.equal(database.prepare("SELECT status FROM release_identities").get().status, failure.status); }
      finally { database.close(); }
      const completed = await buildRelease(item.project, { ...base, approvalId: approval.id });
      database = openStateDatabase(resolve(item.legacyRoot, ".rtb-state", "state.sqlite"));
      try { const finalization = database.prepare("SELECT * FROM release_finalizations").get(), identity = database.prepare("SELECT * FROM release_identities").get(); assert.equal(finalization.status, "completed"); assert.equal(identity.status, "completed"); assert.equal(identity.release_id, completed.manifest.releaseId); assert.equal(finalization.manifest_hash, completed.manifest.manifestHash); }
      finally { database.close(); }
    } finally { item.dispose(); }
  });
});

test("material verification cannot complete after live approval authority expires", async () => {
  const item = fixture();
  try {
    const base = { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot, orchestration: deterministicOrchestration("expiry-race") };
    const candidate = await buildRelease(item.project, base), approval = await approve(item.project, candidate.candidate);
    const expireApproval = () => {
      const database = openStateDatabase(resolve(item.legacyRoot, ".rtb-state", "state.sqlite"));
      try { database.prepare("UPDATE lifecycle_approvals SET expires_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", approval.id); }
      finally { database.close(); }
    };
    await assert.rejects(() => buildRelease(item.project, { ...base, approvalId: approval.id, hooks: { afterPromotionVerification: expireApproval } }), /expiry|expired/);
    const database = openStateDatabase(resolve(item.legacyRoot, ".rtb-state", "state.sqlite"));
    try {
      assert.equal(database.prepare("SELECT status FROM release_finalizations").get().status, "pending");
      assert.equal(database.prepare("SELECT status FROM release_identities").get().status, "pending");
      database.prepare("UPDATE lifecycle_approvals SET expires_at = NULL WHERE id = ?").run(approval.id);
    } finally { database.close(); }
    const completed = await buildRelease(item.project, { ...base, approvalId: approval.id });
    assert.equal(existsSync(completed.release), true);
  } finally { item.dispose(); }
});

test("stale canonical pointers before lock, after render, and before completion never publish", async (context) => {
  await context.test("before locks", async () => {
    const item = fixture({ snapshots: true });
    try {
      advancePointer(item.legacyRoot, "changed-before-lock");
      await assert.rejects(() => buildRelease(item.project, { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot, orchestration: deterministicOrchestration("before-lock") }), /snapshot is stale/);
      assert.equal(existsSync(resolve(item.candidateRoot, item.project.id)), false);
    } finally { item.dispose(); }
  });
  await context.test("after rediscovery and render", async () => {
    const item = fixture({ snapshots: true });
    try {
      await assert.rejects(() => buildRelease(item.project, { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot, orchestration: deterministicOrchestration("after-render"), hooks: { afterRender: () => advancePointer(item.legacyRoot, "changed-after-render") } }), /snapshot or material changed/);
      assert.equal(existsSync(resolve(item.candidateRoot, item.project.id)), false);
    } finally { item.dispose(); }
  });
  await context.test("after material verification before completion", async () => {
    const item = fixture({ snapshots: true });
    try {
      const base = { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot, orchestration: deterministicOrchestration("before-completion") }, candidateOnly = await buildRelease(item.project, base), approval = await approve(item.project, candidateOnly.candidate);
      await assert.rejects(() => buildRelease(item.project, { ...base, approvalId: approval.id, hooks: { afterPromotionVerification: () => advancePointer(item.legacyRoot, "changed-before-completion") } }), /snapshot or material changed/);
      const database = openStateDatabase(resolve(item.legacyRoot, ".rtb-state", "state.sqlite"));
      try { assert.equal(database.prepare("SELECT status FROM release_finalizations").get().status, "pending"); assert.equal(database.prepare("SELECT status FROM release_identities").get().status, "pending"); }
      finally { database.close(); }
      const fresh = resolveBookProject(item.legacyRoot, { workspaceRoot: item.workspaceRoot });
      await assert.rejects(() => buildRelease(item.project, { ...base, approvalId: approval.id }), /snapshot is stale/);
      const freshCandidate = await buildRelease(fresh, base); assert.equal(freshCandidate.project.pointerVersion, item.project.pointerVersion + 1); assert.ok(freshCandidate.candidate.candidateHash);
    } finally { item.dispose(); }
  });
  await context.test("inside the final completion hook", async () => {
    const item = fixture({ snapshots: true });
    try {
      const base = { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot, orchestration: deterministicOrchestration("completion-hook") }, candidateOnly = await buildRelease(item.project, base), approval = await approve(item.project, candidateOnly.candidate);
      await assert.rejects(() => buildRelease(item.project, { ...base, approvalId: approval.id, hooks: { beforeCompleteCommit: () => advancePointer(item.legacyRoot, "changed-in-completion-hook") } }), /snapshot or material changed/);
      const database = openStateDatabase(resolve(item.legacyRoot, ".rtb-state", "state.sqlite"));
      try { assert.equal(database.prepare("SELECT status FROM release_finalizations").get().status, "pending"); assert.equal(database.prepare("SELECT status FROM release_identities").get().status, "pending"); }
      finally { database.close(); }
    } finally { item.dispose(); }
  });
});

test("verified promotion capability rejects copied replacements of every output namespace", async (context) => {
  for (const level of ["immutable", "project", "target"]) await context.test(level, async () => {
    const item = fixture();
    try {
      const base = { lifecycleVersion: 2, buildRoot: item.buildRoot, candidateRoot: item.candidateRoot, releaseRoot: item.releaseRoot, workspaceRoot: item.workspaceRoot, orchestration: deterministicOrchestration(`replace-${level}`) }, candidateOnly = await buildRelease(item.project, base), approval = await approve(item.project, candidateOnly.candidate);
      let replacedTarget, displacedTarget;
      const replace = ({ release }) => {
        const target = level === "target" ? release : level === "project" ? resolve(release, "..") : resolve(release, "..", "..");
        const displaced = `${target}-displaced`; renameSync(target, displaced); cpSync(displaced, target, { recursive: true }); replacedTarget = target; displacedTarget = displaced;
      };
      await assert.rejects(() => buildRelease(item.project, { ...base, approvalId: approval.id, hooks: { afterPromotionVerification: replace } }), /identity changed|physical identity/);
      assert.equal(existsSync(replacedTarget), true, "failure cleanup must not mutate a replacement namespace"); assert.equal(existsSync(displacedTarget), true);
      const database = openStateDatabase(resolve(item.legacyRoot, ".rtb-state", "state.sqlite"));
      try { assert.equal(database.prepare("SELECT status FROM release_finalizations").get().status, "pending"); assert.equal(database.prepare("SELECT status FROM release_identities").get().status, "pending"); }
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
    const pdfName = completed.candidate.artifacts.pdf.path, outsideArtifact = resolve(item.workspaceRoot, "outside-artifact"); writeFileSync(outsideArtifact, readFileSync(resolve(completed.release, pdfName)));
    unlinkSync(resolve(completed.release, pdfName)); symlinkSync(outsideArtifact, resolve(completed.release, pdfName));
    assert.throws(() => verifyReleaseDirectory(completed.release, completed.candidate, { manifest: completed.manifest, root: item.legacyRoot, immutableRoot: resolve(item.releaseRoot, "immutable") }), /symbolic links/);
    assert.equal(readFileSync(outsideArtifact, "utf8"), "pdf-links");
    unlinkSync(resolve(completed.release, pdfName)); linkSync(outsideArtifact, resolve(completed.release, pdfName));
    assert.throws(() => verifyReleaseDirectory(completed.release, completed.candidate, { manifest: completed.manifest, root: item.legacyRoot, immutableRoot: resolve(item.releaseRoot, "immutable") }), /one link/);
    unlinkSync(resolve(completed.release, pdfName)); writeFileSync(resolve(completed.release, pdfName), "pdf-links");
    const retained = resolve(completed.release, "source-snapshot", "book.md"), outsideSource = resolve(item.workspaceRoot, "outside-source"); writeFileSync(outsideSource, readFileSync(retained)); unlinkSync(retained); linkSync(outsideSource, retained);
    assert.throws(() => verifyReleaseDirectory(completed.release, completed.candidate, { manifest: completed.manifest, root: item.legacyRoot, immutableRoot: resolve(item.releaseRoot, "immutable") }), /one link/);
  } finally { item.dispose(); }
});
