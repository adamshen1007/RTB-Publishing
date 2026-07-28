import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inspectBetaMaterial } from "../lifecycle/beta-material.mjs";
import { durableCheckpoint, openStateDatabase } from "../state/database.mjs";
import { acquireProjectLock, acquireWorkspaceOutputLock, assertLiveProjectLock, assertLiveWorkspaceOutputLock } from "../state/project-lock.mjs";
import { loadPublishApprovalFromDatabase } from "./approval-store.mjs";
import { verifyCandidate } from "./candidate.mjs";
import { materialHash, writeJsonAtomic } from "./common.mjs";
import { assertCurrentReleasePolicies, evaluateReleasePolicies } from "./policies.mjs";
import { verifyReleaseDirectoryMaterial } from "./verify-release.mjs";

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
  if (!row || row.invalidation_id || row.expires_at && Date.parse(row.expires_at) <= now) throw new Error("Atomic release finalization requires a current, unexpired exact Beta approval.");
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

function complete(database, root, project, releaseDirectory, manifest, beforeCommit) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const record = database.prepare("SELECT * FROM release_finalizations WHERE release_id = ?").get(manifest.releaseId);
    if (!record || record.manifest_hash !== manifest.manifestHash || record.manifest_json !== JSON.stringify(manifest)) throw new Error("Pending finalization does not match the exact manifest material.");
    if (record.status === "completed") { database.exec("COMMIT"); return; }
    const stored = JSON.parse(readFileSync(resolve(releaseDirectory, "manifest.json"), "utf8"));
    if (JSON.stringify(stored) !== record.manifest_json) throw new Error("Written manifest does not match pending durable finalization material.");
    const candidate = JSON.parse(database.prepare("SELECT candidate_json FROM release_candidates WHERE candidate_hash = ? AND project_id = ?").get(record.candidate_hash, project.id).candidate_json);
    const approval = loadPublishApprovalFromDatabase(database, record.approval_id, candidate);
    const approvedBeta = JSON.parse(database.prepare("SELECT bindings_json FROM lifecycle_approvals WHERE id = ?").get(record.approval_id).bindings_json).beta;
    assertCurrentBetaApproval(database, project.id, approvedBeta);
    if (!currentBetaMatches(project, approvedBeta)) throw new Error("Pending finalization no longer has current exact Beta material.");
    const policies = evaluateReleasePolicies(project, candidate, { database });
    if (policies.releasePolicyHash !== approval.releasePolicyHash || !policies.releaseEligible) throw new Error("Pending finalization no longer has current exact release policy or approval.");
    verifyReleaseDirectoryMaterial(releaseDirectory, candidate, { manifest: stored });
    beforeCommit?.();
    if (!currentBetaMatches(project, approvedBeta)) throw new Error("Canonical or Notion material changed before finalization completion commit.");
    verifyReleaseDirectoryMaterial(releaseDirectory, candidate, { manifest: stored });
    const approvalRow = database.prepare("SELECT * FROM lifecycle_approvals WHERE id = ?").get(record.approval_id);
    database.prepare("UPDATE release_finalizations SET status = 'completed', completed_at = ?, approval_actor_type = ?, approval_actor_id = ?, approval_created_at = ?, approval_lifecycle_version = ?, approval_bindings_json = ?, completed_while_current = 1 WHERE release_id = ? AND status = 'pending'").run(new Date().toISOString(), approvalRow.actor_type, approvalRow.actor_id, approvalRow.created_at, approvalRow.lifecycle_version, approvalRow.bindings_json, record.release_id);
    database.prepare("UPDATE release_identities SET status = 'completed' WHERE release_id = ? AND status = 'pending'").run(record.release_id);
    database.exec("COMMIT"); durableCheckpoint(database);
  } catch (error) { if (database.inTransaction) database.exec("ROLLBACK"); throw error; }
}

/** Sole authority for preparing, writing, verifying, and completing a release manifest. */
export async function finalizeRelease(options) {
  const { root, project, candidateHash, approvalId, releaseDirectory, legacyReleaseDirectory = releaseDirectory, hooks = {}, heldWorkspaceLock = null, heldLock = null, deferCompletion = false } = options;
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
    if (prepared.status !== "completed" && !deferCompletion) {
      complete(database, root, project, releaseDirectory, prepared.manifest, hooks.beforeCompleteCommit);
    } else verifyReleaseDirectoryMaterial(releaseDirectory, JSON.parse(database.prepare("SELECT candidate_json FROM release_candidates WHERE candidate_hash = ? AND project_id = ?").get(candidateHash, project.id).candidate_json), { manifest: prepared.manifest });
    return { manifest: prepared.manifest, status: deferCompletion && prepared.status !== "completed" ? "pending" : "completed" };
  } finally { database?.close(); if (!heldLock) lock?.release(); if (!heldWorkspaceLock) workspaceLock.release(); }
}

/** Complete a prepared finalization only after its immutable target was promoted and verified. */
export async function completeFinalizedRelease(options) {
  const { root, project, releaseDirectory, manifest, hooks = {}, heldWorkspaceLock = null, heldLock = null } = options;
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
    complete(database, root, project, releaseDirectory, manifest, hooks.beforeCompleteCommit);
    return { manifest, status: "completed" };
  } finally { database?.close(); if (!heldLock) lock?.release(); if (!heldWorkspaceLock) workspaceLock.release(); }
}
