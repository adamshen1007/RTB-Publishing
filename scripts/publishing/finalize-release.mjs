import { resolve } from "node:path";
import { durableCheckpoint, openStateDatabase } from "../state/database.mjs";
import { inspectBetaMaterial } from "../lifecycle/beta-material.mjs";
import { loadPublishApprovalFromDatabase } from "./approval-store.mjs";
import { verifyCandidate } from "./candidate.mjs";
import { createManifest } from "./manifest.mjs";
import { evaluateReleasePolicies } from "./policies.mjs";

/**
 * Atomically re-read every release authority and reserve the resulting manifest
 * identity. Callers may write only the returned manifest.
 */
export function finalizeRelease({ root, project, candidateHash, approvalId }) {
  const database = openStateDatabase(resolve(root, ".rtb-state", "state.sqlite"));
  try {
    database.exec("BEGIN IMMEDIATE");
    const row = database.prepare("SELECT candidate_hash, candidate_json FROM release_candidates WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(project.id);
    if (!row || row.candidate_hash !== candidateHash) throw new Error("Atomic release finalization requires the exact current registered candidate.");
    const candidate = JSON.parse(row.candidate_json);
    verifyCandidate(candidate);
    const approval = loadPublishApprovalFromDatabase(database, approvalId, candidate);
    const approvalRow = database.prepare("SELECT bindings_json FROM lifecycle_approvals WHERE id = ?").get(approvalId);
    const approvedBeta = JSON.parse(approvalRow.bindings_json).beta;
    const currentBeta = inspectBetaMaterial(project);
    if (currentBeta.state !== "ready" || approvedBeta?.betaSnapshotHash !== currentBeta.betaSnapshotHash || approvedBeta?.policyResultsHash !== currentBeta.policyResultsHash) throw new Error("Atomic release finalization requires the approved Beta to match current canonical and Notion material.");
    const releasePolicies = evaluateReleasePolicies(project, candidate, { database });
    const manifest = createManifest(candidate, approval, { releasePolicies });
    const prior = database.prepare("SELECT release_id FROM release_identities WHERE release_id = ? OR approval_id = ?").get(manifest.releaseId, approval.id);
    if (prior) throw new Error("Release identity or Publish approval was already consumed; obtain a new exact approval and release ID.");
    database.prepare("INSERT INTO release_identities (release_id, project_id, candidate_hash, approval_id, status, created_at) VALUES (?, ?, ?, ?, 'reserved', ?)").run(manifest.releaseId, manifest.projectId, manifest.candidateHash, approval.id, new Date().toISOString());
    database.exec("COMMIT");
    durableCheckpoint(database);
    return { candidate, approval, manifest };
  } catch (error) {
    if (database.inTransaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
}
