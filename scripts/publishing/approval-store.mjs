import { resolve } from "node:path";
import { openStateDatabase } from "../state/database.mjs";

export function assertFutureExpiry(value, now = Date.now(), label = "Approval") {
  if (value === null || value === undefined) return true;
  const expires = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(expires) || expires <= now) throw new Error(`${label} expiry must be a valid future timestamp.`);
  return true;
}

export function loadPublishApprovalFromDatabase(database, approvalId, candidate, { now = Date.now() } = {}) {
  const row = database.prepare(`SELECT approval.*, invalidation.id AS invalidation_id FROM lifecycle_approvals approval LEFT JOIN lifecycle_approval_invalidations invalidation ON invalidation.approval_id = approval.id WHERE approval.id = ? AND approval.project_id = ?`).get(approvalId, candidate.projectId);
  if (!row || row.invalidation_id || row.gate !== "publish" || row.decision !== "approved" || row.actor_type !== "human" || row.explicit_confirmation !== 1) throw new Error("No current, unexpired explicit human Publish approval exists for this project.");
  assertFutureExpiry(row.expires_at, now, "Publish approval");
  const bindings = JSON.parse(row.bindings_json);
  if (bindings.releaseCandidateHash !== candidate.candidateHash || bindings.candidateLifecycleVersion !== candidate.lifecycleVersion || row.lifecycle_version !== candidate.lifecycleVersion + 1 || bindings.blockingFindings !== 0 || !/^[a-f0-9]{64}$/.test(bindings.releasePolicyHash ?? "")) throw new Error("Stored Publish approval is not bound to this exact eligible candidate, policy result, and lifecycle version.");
  return { id: row.id, gate: row.gate, decision: row.decision, actor: { type: row.actor_type, id: row.actor_id }, explicitConfirmation: true, candidateHash: bindings.releaseCandidateHash, lifecycleVersion: bindings.candidateLifecycleVersion, approvalLifecycleVersion: row.lifecycle_version, releasePolicyHash: bindings.releasePolicyHash };
}

export function loadPublishApproval(root, approvalId, candidate) {
  const database = openStateDatabase(resolve(root, ".rtb-state", "state.sqlite"));
  try { return loadPublishApprovalFromDatabase(database, approvalId, candidate); }
  finally { database.close(); }
}
