import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { inspectBetaMaterial } from "../lifecycle/beta-material.mjs";
import { durableCheckpoint, openStateDatabase } from "../state/database.mjs";
import { acquireProjectLock, acquireWorkspaceOutputLock, assertLiveProjectLock, assertLiveWorkspaceOutputLock, assertNoSymlinkPath, assertPinnedDirectory, assertPinnedEntry, pinPhysicalDirectory, pinPhysicalEntry } from "../state/project-lock.mjs";
import { assertFutureExpiry, loadPublishApprovalFromDatabase } from "./approval-store.mjs";
import { verifyCandidate } from "./candidate.mjs";
import { materialHash, writeJsonAtomic } from "./common.mjs";
import { assertCurrentReleasePolicies, evaluateReleasePolicies } from "./policies.mjs";
import { releaseTreeInventory, verifyReleaseDirectory, verifyReleaseDirectoryMaterial } from "./verify-release.mjs";
import { assertPromotionTransaction, authorizePromotion, authorizePromotionRecovery, beginPromotion, commitPromotion, markPromotionLedgerCompleted, markPromotionMaterialVerified, pinPromotionTransaction, promotionContext, promotionMarkers, recoverPromotion, rollbackPromotion } from "./promotion-state.mjs";
import { assertCurrentProjectIdentity, pinnedProjectCanonicalHash, resolveBookProject } from "../books/discovery.mjs";

const liveVerifiedPromotions = new WeakSet();
function inside(root, path) { const value = relative(resolve(root), resolve(path)); return value !== ".." && !value.startsWith(`..${sep}`); }
function pinPromotionOutput(authority, candidate) {
  const inventory = releaseTreeInventory(authority.target, candidate, { manifest: JSON.parse(readFileSync(resolve(authority.target, "manifest.json"), "utf8")) });
  const ancestors = [resolve(authority.workspace, "dist"), resolve(authority.workspace, "dist", "releases"), authority.immutableRoot, resolve(authority.immutableRoot, candidate.projectId), authority.target].map((path) => pinPhysicalEntry(path, "directory"));
  const directories = inventory.filter((item) => item.type === "directory").map((item) => pinPhysicalEntry(resolve(authority.target, item.path), "directory"));
  const files = inventory.filter((item) => item.type === "file").map((item) => pinPhysicalEntry(resolve(authority.target, item.path), "file"));
  return { inventory, ancestors, directories, files, target: authority.target, candidate };
}
function assertPromotionOutput(output) { for (const identity of [...output.ancestors, ...output.directories]) assertPinnedEntry(identity, "directory"); for (const identity of output.files) assertPinnedEntry(identity, "file"); const manifest = JSON.parse(readFileSync(resolve(output.target, "manifest.json"), "utf8")), current = releaseTreeInventory(output.target, output.candidate, { manifest }); if (JSON.stringify(current) !== JSON.stringify(output.inventory)) throw new Error("Verified release tree inventory changed after it was pinned."); return true; }

function assertCanonicalPromotionAuthority({ root, workspaceRoot, project, manifest, heldWorkspaceLock, heldLock }) {
  if (!heldWorkspaceLock || !heldLock) throw new Error("Immutable release promotion requires live workspace and project lock authority.");
  assertLiveWorkspaceOutputLock(heldWorkspaceLock, workspaceRoot);
  assertLiveProjectLock(heldLock, root);
  const workspaceIdentity = pinPhysicalDirectory(workspaceRoot), projectIdentity = pinPhysicalDirectory(root), workspace = workspaceIdentity.path, projectRoot = projectIdentity.path, declaredWorkspace = pinPhysicalDirectory(project.workspaceRoot ?? "").path, declaredProject = resolve(workspace, project.workspacePath ?? "");
  if (declaredWorkspace !== workspace || declaredProject !== projectRoot || resolve(project.legacyRoot) !== projectRoot || !inside(workspace, projectRoot)) throw new Error("Book Project is not the exact discovered project inside the locked workspace.");
  assertNoSymlinkPath(workspace, projectRoot, { allowMissing: false });
  const discovered = resolveBookProject(projectRoot, { workspaceRoot: workspace });
  if (pinnedProjectCanonicalHash(discovered) !== pinnedProjectCanonicalHash(project)) throw new Error("Book Project identity does not match current workspace discovery.");
  if (manifest.projectId !== project.id) throw new Error("Manifest project does not match the locked discovered Book Project.");
  const immutableRoot = resolve(workspace, "dist", "releases", "immutable"), target = resolve(immutableRoot, project.id, manifest.releaseId);
  assertNoSymlinkPath(workspace, immutableRoot, { allowMissing: false }); assertNoSymlinkPath(workspace, target);
  return { workspace, workspaceIdentity, projectRoot, projectIdentity, immutableRoot, target };
}

function buildManifest(candidate, approval, releasePolicies) {
  verifyCandidate(candidate);
  const currentPolicies = assertCurrentReleasePolicies(candidate, releasePolicies);
  if (approval.releasePolicyHash !== currentPolicies.releasePolicyHash) throw new Error("Publish approval is not bound to the current exact release-policy result.");
  const releaseIdentity = materialHash({ candidateHash: candidate.candidateHash, approvalId: approval.id });
  const material = { schemaVersion: 1, releaseId: `REL-${releaseIdentity.slice(0, 20).toUpperCase()}`, projectId: candidate.projectId, candidateHash: candidate.candidateHash, lifecycleVersion: candidate.lifecycleVersion, sourceFingerprint: candidate.sourceFingerprint, artifacts: candidate.artifacts, validators: candidate.validators, approval: { id: approval.id, gate: "publish", decision: "approved", actor: approval.actor, candidateHash: approval.candidateHash, lifecycleVersion: approval.lifecycleVersion, explicitConfirmation: true, releasePolicyHash: currentPolicies.releasePolicyHash }, hostedState: { activated: false, subscriberDelivery: false, ghostPublication: false } };
  return { ...material, manifestHash: materialHash(material) };
}

function currentBetaMatches(project, approvedBeta) {
  const current = inspectBetaMaterial(project);
  return current.state === "ready" && approvedBeta?.betaSnapshotHash === current.betaSnapshotHash && approvedBeta?.policyResultsHash === current.policyResultsHash;
}

function assertCurrentBetaApproval(database, projectId, approvedBeta, now = Date.now()) {
  const row = database.prepare(`SELECT approval.*, invalidation.id AS invalidation_id
    FROM lifecycle_approvals approval
    LEFT JOIN lifecycle_approval_invalidations invalidation ON invalidation.approval_id = approval.id
    WHERE approval.project_id = ? AND approval.gate = 'beta' AND approval.decision = 'approved'
      AND approval.explicit_confirmation = 1 AND approval.actor_type = 'human'
      AND approval.bindings_json = ?
    ORDER BY approval.created_at DESC, approval.rowid DESC LIMIT 1`).get(projectId, JSON.stringify(approvedBeta));
  if (!row || row.invalidation_id) throw new Error("Atomic release finalization requires a current, unexpired exact Beta approval.");
  assertFutureExpiry(row.expires_at, now, "Beta approval");
  return row;
}

function prepare(database, project, candidateHash, approvalId, legacyReleaseDirectory, beforeCommit) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const existing = database.prepare("SELECT * FROM release_finalizations WHERE approval_id = ?").get(approvalId);
    if (existing) { if (existing.project_id !== project.id || existing.candidate_hash !== candidateHash) throw new Error("Existing finalization is bound to another project or candidate."); database.exec("COMMIT"); return { manifest: JSON.parse(existing.manifest_json), status: existing.status }; }
    const row = database.prepare("SELECT candidate_hash, candidate_json FROM release_candidates WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(project.id);
    if (!row || row.candidate_hash !== candidateHash) throw new Error("Atomic release finalization requires the exact current registered candidate.");
    const candidate = JSON.parse(row.candidate_json), approval = loadPublishApprovalFromDatabase(database, approvalId, candidate);
    const approvedBeta = JSON.parse(database.prepare("SELECT bindings_json FROM lifecycle_approvals WHERE id = ?").get(approvalId).bindings_json).beta;
    assertCurrentBetaApproval(database, project.id, approvedBeta);
    if (!currentBetaMatches(project, approvedBeta)) throw new Error("Atomic release finalization requires the approved Beta to match current canonical and Notion material.");
    const policies = evaluateReleasePolicies(project, candidate, { database }), manifest = buildManifest(candidate, approval, policies);
    beforeCommit?.();
    if (!currentBetaMatches(project, approvedBeta)) throw new Error("Canonical or Notion material changed before finalization commit.");
    const at = new Date().toISOString(), legacy = database.prepare("SELECT * FROM release_identities WHERE release_id = ? OR approval_id = ?").get(manifest.releaseId, approval.id);
    if (legacy) {
      let stored;
      try { stored = JSON.parse(readFileSync(resolve(legacyReleaseDirectory, "manifest.json"), "utf8")); } catch { stored = null; }
      if (legacy.status !== "reserved" || legacy.project_id !== manifest.projectId || legacy.candidate_hash !== manifest.candidateHash || legacy.approval_id !== approval.id || JSON.stringify(stored) !== JSON.stringify(manifest)) throw new Error("Legacy reserved release identity cannot be adopted safely. Preserve its evidence, then obtain a new exact Publish approval before finalizing again.");
      database.prepare("UPDATE release_identities SET status = 'pending' WHERE release_id = ?").run(manifest.releaseId);
    } else database.prepare("INSERT INTO release_identities (release_id, project_id, candidate_hash, approval_id, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)").run(manifest.releaseId, manifest.projectId, manifest.candidateHash, approval.id, at);
    database.prepare("INSERT INTO release_finalizations (release_id, project_id, candidate_hash, approval_id, manifest_hash, manifest_json, status, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL)").run(manifest.releaseId, manifest.projectId, manifest.candidateHash, approval.id, manifest.manifestHash, JSON.stringify(manifest), at);
    database.exec("COMMIT"); durableCheckpoint(database); return { manifest, status: "pending" };
  } catch (error) { if (database.inTransaction) database.exec("ROLLBACK"); throw error; }
}

function complete(database, root, project, releaseDirectory, manifest, capability, beforeCommit, currentTime = () => Date.now()) {
  const workspaceIdentity = pinPhysicalDirectory(project.workspaceRoot ?? ""), projectIdentity = pinPhysicalDirectory(root), workspace = workspaceIdentity.path, immutableRoot = resolve(workspace, "dist", "releases", "immutable");
  assertCurrentProjectIdentity(project); assertPinnedDirectory(capability?.workspaceIdentity ?? {}); assertPinnedDirectory(capability?.projectIdentity ?? {}); assertPromotionOutput(capability.outputIdentity); assertNoSymlinkPath(workspace, immutableRoot, { allowMissing: false }); assertNoSymlinkPath(workspace, releaseDirectory, { allowMissing: false });
  if (!capability || !liveVerifiedPromotions.has(capability) || capability.workspaceRoot !== workspace || capability.workspaceIdentity.dev !== workspaceIdentity.dev || capability.workspaceIdentity.ino !== workspaceIdentity.ino || capability.immutableRoot !== immutableRoot || capability.projectRoot !== projectIdentity.path || capability.projectIdentity.dev !== projectIdentity.dev || capability.projectIdentity.ino !== projectIdentity.ino || capability.projectId !== project.id || capability.releaseId !== manifest.releaseId || capability.releaseDirectory !== resolve(immutableRoot, project.id, manifest.releaseId) || capability.releaseDirectory !== resolve(releaseDirectory) || capability.manifestHash !== manifest.manifestHash || capability.context.phase !== "material-verified") throw new Error("Release completion requires a live, exact, one-time verified-promotion capability.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const record = database.prepare("SELECT * FROM release_finalizations WHERE release_id = ?").get(manifest.releaseId);
    if (!record || record.manifest_hash !== manifest.manifestHash || record.manifest_json !== JSON.stringify(manifest)) throw new Error("Pending finalization does not match the exact manifest material.");
    if (record.status === "completed") { database.exec("COMMIT"); return; }
    const stored = JSON.parse(readFileSync(resolve(releaseDirectory, "manifest.json"), "utf8"));
    if (JSON.stringify(stored) !== record.manifest_json) throw new Error("Written manifest does not match pending durable finalization material.");
    const candidate = JSON.parse(database.prepare("SELECT candidate_json FROM release_candidates WHERE candidate_hash = ? AND project_id = ?").get(record.candidate_hash, project.id).candidate_json);
    const approval = loadPublishApprovalFromDatabase(database, record.approval_id, candidate, { now: currentTime() });
    const approvedBeta = JSON.parse(database.prepare("SELECT bindings_json FROM lifecycle_approvals WHERE id = ?").get(record.approval_id).bindings_json).beta;
    assertCurrentBetaApproval(database, project.id, approvedBeta, currentTime());
    if (!currentBetaMatches(project, approvedBeta)) throw new Error("Pending finalization no longer has current exact Beta material.");
    const policies = evaluateReleasePolicies(project, candidate, { database });
    if (policies.releasePolicyHash !== approval.releasePolicyHash || !policies.releaseEligible) throw new Error("Pending finalization no longer has current exact release policy or approval.");
    verifyReleaseDirectoryMaterial(releaseDirectory, candidate, { manifest: stored });
    beforeCommit?.();
    const freshProject = assertCurrentProjectIdentity(project); assertPromotionOutput(capability.outputIdentity);
    const freshApproval = loadPublishApprovalFromDatabase(database, record.approval_id, candidate, { now: currentTime() });
    assertCurrentBetaApproval(database, project.id, approvedBeta, currentTime());
    if (!currentBetaMatches(freshProject, approvedBeta)) throw new Error("Canonical or Notion material changed before finalization completion commit.");
    const freshPolicies = evaluateReleasePolicies(freshProject, candidate, { database });
    if (freshPolicies.releasePolicyHash !== freshApproval.releasePolicyHash || !freshPolicies.releaseEligible) throw new Error("Pending finalization no longer has current exact release policy or approval.");
    verifyReleaseDirectoryMaterial(releaseDirectory, candidate, { manifest: stored });
    if (!liveVerifiedPromotions.delete(capability)) throw new Error("Verified promotion capability was already consumed.");
    const approvalRow = database.prepare("SELECT * FROM lifecycle_approvals WHERE id = ?").get(record.approval_id);
    database.prepare("UPDATE release_finalizations SET status = 'completed', completed_at = ?, approval_actor_type = ?, approval_actor_id = ?, approval_created_at = ?, approval_lifecycle_version = ?, approval_bindings_json = ?, completed_while_current = 1 WHERE release_id = ? AND status = 'pending'").run(new Date().toISOString(), approvalRow.actor_type, approvalRow.actor_id, approvalRow.created_at, approvalRow.lifecycle_version, approvalRow.bindings_json, record.release_id);
    database.prepare("UPDATE release_identities SET status = 'completed' WHERE release_id = ? AND status = 'pending'").run(record.release_id);
    database.exec("COMMIT"); durableCheckpoint(database);
  } catch (error) { if (database.inTransaction) database.exec("ROLLBACK"); throw error; }
}

/** Sole authority for preparing, writing, verifying, and completing a release manifest. */
export async function finalizeRelease(options) {
  const { root, project, candidateHash, approvalId, releaseDirectory, legacyReleaseDirectory = releaseDirectory, hooks = {}, heldWorkspaceLock = null, heldLock = null } = options;
  const workspaceRoot = options.workspaceRoot ?? project.workspaceRoot ?? root;
  if (heldLock && !heldWorkspaceLock) throw new Error("Held project lock authority requires the enclosing workspace output lock to preserve lock order.");
  if (heldWorkspaceLock) assertLiveWorkspaceOutputLock(heldWorkspaceLock, workspaceRoot);
  if (heldLock) assertLiveProjectLock(heldLock, root);
  const workspaceLock = heldWorkspaceLock ?? await acquireWorkspaceOutputLock(workspaceRoot, { ownerId: `publication-finalization-output-${process.pid}` });
  let lock;
  let database;
  try {
    lock = heldLock ?? await acquireProjectLock(root, { ownerId: `publication-finalization-${process.pid}` });
    database = openStateDatabase(resolve(root, ".rtb-state", "state.sqlite"));
    const prepared = prepare(database, project, candidateHash, approvalId, legacyReleaseDirectory, hooks.beforePrepareCommit);
    (hooks.writeManifest ?? writeJsonAtomic)(resolve(releaseDirectory, "manifest.json"), prepared.manifest);
    hooks.afterManifestWrite?.();
    verifyReleaseDirectoryMaterial(releaseDirectory, JSON.parse(database.prepare("SELECT candidate_json FROM release_candidates WHERE candidate_hash = ? AND project_id = ?").get(candidateHash, project.id).candidate_json), { manifest: prepared.manifest });
    return { manifest: prepared.manifest, status: prepared.status };
  } finally { database?.close(); if (!heldLock) lock?.release(); if (!heldWorkspaceLock) workspaceLock.release(); }
}

/** Complete a prepared finalization only after its immutable target was promoted and verified. */
async function completeFinalizedRelease(options) {
  const { root, project, releaseDirectory, manifest, capability, hooks = {}, heldWorkspaceLock = null, heldLock = null } = options;
  const workspaceRoot = options.workspaceRoot ?? project.workspaceRoot ?? root;
  if (heldLock && !heldWorkspaceLock) throw new Error("Held project lock authority requires the enclosing workspace output lock to preserve lock order.");
  if (heldWorkspaceLock) assertLiveWorkspaceOutputLock(heldWorkspaceLock, workspaceRoot);
  if (heldLock) assertLiveProjectLock(heldLock, root);
  const workspaceLock = heldWorkspaceLock ?? await acquireWorkspaceOutputLock(workspaceRoot, { ownerId: `publication-completion-output-${process.pid}` });
  let lock;
  let database;
  try {
    lock = heldLock ?? await acquireProjectLock(root, { ownerId: `publication-completion-${process.pid}` });
    database = openStateDatabase(resolve(root, ".rtb-state", "state.sqlite"));
    complete(database, root, project, releaseDirectory, manifest, capability, hooks.beforeCompleteCommit, hooks.now);
    return { manifest, status: "completed" };
  } finally { database?.close(); if (!heldLock) lock?.release(); if (!heldWorkspaceLock) workspaceLock.release(); }
}

/** Sole promotion/completion boundary; no caller can mint completion authority. */
export async function promoteFinalizedRelease(options) {
  const { root, workspaceRoot, project, candidate, manifest, token, hooks = {}, heldWorkspaceLock, heldLock } = options;
  if (!heldWorkspaceLock || !heldLock) throw new Error("Immutable release promotion requires live workspace and project lock authority.");
  assertLiveWorkspaceOutputLock(heldWorkspaceLock, workspaceRoot); assertLiveProjectLock(heldLock, root);
  if (Object.hasOwn(options, "outputRoot") || Object.hasOwn(options, "promotionInput")) throw new Error("Callers cannot select an immutable promotion output root.");
  const authority = assertCanonicalPromotionAuthority({ root, workspaceRoot, project, manifest, heldWorkspaceLock, heldLock });
  if (!token) throw new Error("Immutable release promotion requires its build transaction token.");
  const promotionInput = { outputRoot: authority.immutableRoot, projectId: project.id, releaseId: manifest.releaseId, token };
  let context, promotionAuthority, transactionAuthority, verifiedOutputIdentity;
  const pending = promotionMarkers(promotionInput.outputRoot, project.id, manifest.releaseId);
  for (const marker of pending) {
    const authorized = authorizePromotionRecovery(marker, { workspaceRoot, projectRoot: root, workspaceLock: heldWorkspaceLock, projectLock: heldLock }); promotionAuthority = authorized.authority;
    const recovered = recoverPromotion(marker, promotionAuthority, hooks.promotionBoundary);
    if (recovered.state === "completion-required") context = recovered.context;
  }
  const target = authority.target;
  if (!context) { const initial = promotionContext(promotionInput); promotionAuthority = authorizePromotion(initial, { workspaceRoot, projectRoot: root, workspaceLock: heldWorkspaceLock, projectLock: heldLock }); context = beginPromotion(promotionInput, promotionAuthority, hooks.promotionBoundary); }
  transactionAuthority = pinPromotionTransaction(context);
  try {
    await hooks.beforePromotionVerification?.({ release: target, promotion: context });
    verifyReleaseDirectoryMaterial(target, candidate, { manifest, immutableRoot: promotionInput.outputRoot });
    verifiedOutputIdentity = pinPromotionOutput(authority, candidate);
    await hooks.afterPromotionVerification?.({ release: target, promotion: context });
    assertLiveWorkspaceOutputLock(heldWorkspaceLock, workspaceRoot); assertLiveProjectLock(heldLock, root); assertPromotionTransaction(transactionAuthority);
    if (context.phase !== "material-verified") context = markPromotionMaterialVerified(context, promotionAuthority, hooks.promotionBoundary);
    transactionAuthority = pinPromotionTransaction(context);
    const capability = { workspaceRoot: authority.workspace, workspaceIdentity: authority.workspaceIdentity, immutableRoot: authority.immutableRoot, projectRoot: authority.projectRoot, projectIdentity: authority.projectIdentity, projectId: project.id, releaseId: manifest.releaseId, releaseDirectory: target, manifestHash: manifest.manifestHash, context, outputIdentity: verifiedOutputIdentity };
    liveVerifiedPromotions.add(capability);
    await completeFinalizedRelease({ root, workspaceRoot, project, releaseDirectory: target, manifest, capability, heldWorkspaceLock, heldLock, hooks });
    await hooks.afterLedgerCompletion?.({ release: target, promotion: context });
    assertLiveWorkspaceOutputLock(heldWorkspaceLock, workspaceRoot); assertLiveProjectLock(heldLock, root); assertPromotionTransaction(transactionAuthority); assertPromotionOutput(capability.outputIdentity);
    context = markPromotionLedgerCompleted(context, promotionAuthority, hooks.promotionBoundary);
    transactionAuthority = pinPromotionTransaction(context);
    verifyReleaseDirectory(target, candidate, { manifest, root, heldLock, immutableRoot: promotionInput.outputRoot, workspaceRoot, heldWorkspaceLock });
    assertLiveWorkspaceOutputLock(heldWorkspaceLock, workspaceRoot); assertLiveProjectLock(heldLock, root); assertPromotionTransaction(transactionAuthority); assertPromotionOutput(capability.outputIdentity); commitPromotion(context, promotionAuthority, hooks.promotionBoundary);
    return target;
  } catch (error) {
    if (error.promotionContext) context = error.promotionContext;
    if (error.promotionTransactionAuthority) transactionAuthority = error.promotionTransactionAuthority;
    let transactionStillAuthoritative = true;
    try { assertLiveWorkspaceOutputLock(heldWorkspaceLock, workspaceRoot); assertLiveProjectLock(heldLock, root); if (transactionAuthority) assertPromotionTransaction(transactionAuthority); } catch { transactionStillAuthoritative = false; }
    if (!transactionStillAuthoritative) { const failure = new Error("Promotion authority was lost; recovery is required and no cleanup mutation was attempted.", { cause: error }); failure.recoveryRequired = true; throw failure; }
    let ledgerCompleted = false;
    const database = openStateDatabase(resolve(root, ".rtb-state", "state.sqlite"));
    try {
      const record = database.prepare("SELECT status, manifest_hash FROM release_finalizations WHERE release_id = ?").get(manifest.releaseId);
      ledgerCompleted = record?.status === "completed" && record.manifest_hash === manifest.manifestHash;
    } finally { database.close(); }
    // A process can fail after the database commit but before the ledger marker.
    // Preserve the verified target in that case so the next locked retry can
    // durably record ledger-completed and finish promotion cleanup.
    let outputStillAuthoritative = true;
    if (verifiedOutputIdentity) { try { assertPromotionOutput(verifiedOutputIdentity); } catch { outputStillAuthoritative = false; } }
    if (!ledgerCompleted && context?.phase !== "ledger-completed" && outputStillAuthoritative && transactionStillAuthoritative) rollbackPromotion(context, promotionAuthority, hooks.promotionBoundary);
    throw error;
  }
}
