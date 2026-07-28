import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileHash, materialHash, stable } from "./common.mjs";
import { verifyCandidate } from "./candidate.mjs";
import { verifyManifestChecksum } from "./manifest.mjs";
import { resolveBookProject } from "../books/discovery.mjs";
import { durableCheckpoint, openStateDatabase } from "../state/database.mjs";
import { acquireProjectLockImmediate, assertLiveProjectLock } from "../state/project-lock.mjs";
import { RELEASE_REVIEW_KINDS } from "./release-review-store.mjs";

function reviewRecord(row) { return { schemaVersion: 1, id: row.id, projectId: row.project_id, kind: row.kind, decision: row.decision, candidateHash: row.candidate_hash, sourceFingerprint: row.source_fingerprint, artifactHashes: { html: row.html_sha256, pdf: row.pdf_sha256, epub: row.epub_sha256 }, reviewer: { type: "human", id: row.reviewer_id, ...(row.qualified_role ? { qualifiedRole: row.qualified_role } : {}) }, createdAt: row.created_at }; }
function historicalPolicyHash(database, candidate, completedAt) {
  const rows = database.prepare("SELECT * FROM release_reviews WHERE project_id = ? AND candidate_hash = ? AND created_at <= ? ORDER BY created_at DESC, rowid DESC").all(candidate.projectId, candidate.candidateHash, completedAt), latest = new Map();
  for (const row of rows) if (!latest.has(row.kind)) latest.set(row.kind, row);
  if (RELEASE_REVIEW_KINDS.some((kind) => latest.get(kind)?.decision !== "approved")) return null;
  const evidence = RELEASE_REVIEW_KINDS.map((kind) => reviewRecord(latest.get(kind)));
  const exact = evidence.every((record) => record.projectId === candidate.projectId && record.candidateHash === candidate.candidateHash && record.sourceFingerprint === candidate.sourceFingerprint && ["html", "pdf", "epub"].every((format) => record.artifactHashes[format] === candidate.artifacts[format].sha256) && record.reviewer.id.length >= 2) && evidence.find((record) => record.kind === "rights-and-brand-review")?.reviewer.qualifiedRole;
  return exact ? materialHash({ schemaVersion: 1, candidateHash: candidate.candidateHash, manualReviews: Object.fromEntries(RELEASE_REVIEW_KINDS.map((kind) => [kind, "approved"])), evidence }) : null;
}

function reconcileApprovalFacts(database, record, identity, approval, candidate, manifest) {
  if (!record) return record;
  if (record?.completed_while_current === 1) return record;
  const invalidation = approval && database.prepare("SELECT created_at FROM lifecycle_approval_invalidations WHERE approval_id = ?").get(approval.id);
  const candidateRow = database.prepare("SELECT * FROM release_candidates WHERE candidate_hash = ? AND project_id = ?").get(candidate.candidateHash, candidate.projectId), registeredCandidate = candidateRow && JSON.parse(candidateRow.candidate_json);
  const bindings = approval ? JSON.parse(approval.bindings_json) : null;
  const betaApproval = bindings?.beta && database.prepare("SELECT * FROM lifecycle_approvals WHERE project_id = ? AND gate = 'beta' AND decision = 'approved' AND explicit_confirmation = 1 AND actor_type = 'human' AND bindings_json = ? AND created_at <= ? ORDER BY created_at DESC LIMIT 1").get(candidate.projectId, JSON.stringify(bindings.beta), approval?.created_at ?? "");
  const betaInvalidation = betaApproval && database.prepare("SELECT created_at FROM lifecycle_approval_invalidations WHERE approval_id = ?").get(betaApproval.id);
  const policyHash = record.completed_at ? historicalPolicyHash(database, candidate, record.completed_at) : null;
  const exactIdentity = identity && identity.release_id === record.release_id && identity.project_id === candidate.projectId && identity.candidate_hash === candidate.candidateHash && identity.approval_id === approval?.id && identity.status === "completed";
  const exactCandidate = registeredCandidate && stable(registeredCandidate) === stable(candidate) && registeredCandidate.projectId === candidate.projectId && registeredCandidate.candidateHash === candidate.candidateHash && registeredCandidate.lifecycleVersion === candidate.lifecycleVersion && registeredCandidate.sourceFingerprint === candidate.sourceFingerprint && stable(registeredCandidate.artifacts) === stable(candidate.artifacts);
  const exactApproval = approval?.actor_type === "human" && approval.actor_id && approval.lifecycle_version === candidate.lifecycleVersion + 1 && bindings?.releaseCandidateHash === candidate.candidateHash && bindings?.candidateLifecycleVersion === candidate.lifecycleVersion && bindings?.blockingFindings === 0 && bindings?.releasePolicyHash === policyHash && manifest.approval?.releasePolicyHash === policyHash;
  const exactBeta = betaApproval && (!betaInvalidation || betaInvalidation.created_at > record.completed_at) && /^[a-f0-9]{64}$/.test(bindings.beta.betaSnapshotHash ?? "") && /^[a-f0-9]{64}$/.test(bindings.beta.policyResultsHash ?? "");
  const exactRecord = record.project_id === candidate.projectId && record.candidate_hash === candidate.candidateHash && record.approval_id === approval?.id && record.release_id === manifest.releaseId && record.manifest_hash === manifest.manifestHash && record.manifest_json === JSON.stringify(manifest);
  const provable = exactRecord && exactIdentity && exactCandidate && exactApproval && exactBeta && record.completed_at && approval.created_at <= record.completed_at && (!invalidation || invalidation.created_at > record.completed_at) && manifest.approval?.id === approval.id && manifest.approval.actor?.type === approval.actor_type && manifest.approval.actor?.id === approval.actor_id && manifest.approval.lifecycleVersion === candidate.lifecycleVersion;
  if (!provable) throw new Error("Completed release requires approval-facts reconciliation; existing evidence cannot prove that the exact Publish approval was current at completion.");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("UPDATE release_finalizations SET approval_actor_type = ?, approval_actor_id = ?, approval_created_at = ?, approval_lifecycle_version = ?, approval_bindings_json = ?, completed_while_current = 1 WHERE release_id = ? AND status = 'completed' AND completed_while_current = 0").run(approval.actor_type, approval.actor_id, approval.created_at, approval.lifecycle_version, approval.bindings_json, record.release_id);
    database.exec("COMMIT"); durableCheckpoint(database);
  } catch (error) { if (database.inTransaction) database.exec("ROLLBACK"); throw error; }
  return database.prepare("SELECT * FROM release_finalizations WHERE release_id = ?").get(record.release_id);
}
export function verifyReleaseDirectoryMaterial(directory, candidate, { manifest } = {}) {
  verifyCandidate(candidate); const expected = new Set(Object.values(candidate.artifacts).map((item) => item.path).concat(["candidate.json", "verification.json", candidate.snapshot.bundle.path])); if (manifest) expected.add("manifest.json");
  const actual = new Set(readdirSync(directory).filter((name) => !name.startsWith("."))); const extras = [...actual].filter((name) => !expected.has(name)), missing = [...expected].filter((name) => !actual.has(name)); if (extras.length || missing.length) throw new Error(`Release directory drift: extra=${extras.join(",")} missing=${missing.join(",")}`);
  for (const artifact of Object.values(candidate.artifacts)) { const file = resolve(directory, artifact.path); if (!existsSync(file) || fileHash(file) !== artifact.sha256) throw new Error(`Release artifact drift: ${basename(file)}`); }
  for (const record of candidate.snapshot.bundle.files) { const file = resolve(directory, candidate.snapshot.bundle.path, record.path); if (!existsSync(file) || fileHash(file) !== record.sha256) throw new Error(`Retained source snapshot drift: ${record.path}`); }
  const storedCandidate = JSON.parse(readFileSync(resolve(directory, "candidate.json"), "utf8")); if (stable(storedCandidate) !== stable(candidate)) throw new Error("Stored candidate.json does not match the verified candidate.");
  const verification = JSON.parse(readFileSync(resolve(directory, "verification.json"), "utf8")); if (verification.sourceFingerprint !== candidate.sourceFingerprint || verification.status !== candidate.validators.status || stable(verification.artifacts) !== stable(candidate.artifacts) || stable(verification.semanticParity) !== stable(candidate.validators.semanticParity) || stable(verification.html) !== stable(candidate.validators.html) || stable(verification.epub) !== stable(candidate.validators.epub) || stable(verification.pdf) !== stable(candidate.validators.pdf)) throw new Error("Stored verification.json does not reproduce the candidate validator material.");
  if (manifest) { const storedManifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8")); if (stable(storedManifest) !== stable(manifest)) throw new Error("Stored manifest does not match the verified manifest material."); verifyManifestChecksum(manifest); if (manifest.candidateHash !== candidate.candidateHash || stable(manifest.artifacts) !== stable(candidate.artifacts) || stable(manifest.validators) !== stable(candidate.validators)) throw new Error("Manifest does not preserve the exact candidate material."); } return true;
}
export function verifyReleaseDirectory(directory, candidate, { manifest, root, heldLock = null } = {}) {
  verifyReleaseDirectoryMaterial(directory, candidate, { manifest });
  if (!manifest) return true;
  if (!root) throw new Error("Manifest verification requires the explicit project state root.");
  if (heldLock) assertLiveProjectLock(heldLock, root);
  const lock = heldLock ?? acquireProjectLockImmediate(root, { ownerId: `release-verification-${process.pid}` });
  let database;
  try {
    database = openStateDatabase(resolve(root, ".rtb-state", "state.sqlite"));
    let record = database.prepare("SELECT * FROM release_finalizations WHERE release_id = ? AND status = 'completed'").get(manifest.releaseId);
    const identity = database.prepare("SELECT * FROM release_identities WHERE release_id = ? AND approval_id = ? AND status = 'completed'").get(manifest.releaseId, manifest.approval?.id);
    const approval = database.prepare("SELECT * FROM lifecycle_approvals WHERE id = ? AND project_id = ? AND gate = 'publish' AND decision = 'approved' AND explicit_confirmation = 1").get(manifest.approval?.id, candidate.projectId);
    record = reconcileApprovalFacts(database, record, identity, approval, candidate, manifest);
    const recordExact = record?.project_id === candidate.projectId && record.candidate_hash === candidate.candidateHash && record.manifest_hash === manifest.manifestHash;
    const historicalApproval = approval && recordExact && record?.completed_while_current === 1 && record.approval_actor_type === approval.actor_type && record.approval_actor_id === approval.actor_id && record.approval_created_at === approval.created_at && record.approval_lifecycle_version === approval.lifecycle_version && record.approval_bindings_json === approval.bindings_json && record.completed_at >= approval.created_at;
    if (!record || record.manifest_json !== JSON.stringify(manifest) || !identity || !historicalApproval) throw new Error("Release verification requires the exact completed durable finalization, identity, and completion-time ledger Publish approval facts.");
    return true;
  } finally { database?.close(); if (!heldLock) lock.release(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { const directory = resolve(process.argv[2] ?? "dist/releases/rtb-yc-playbook"), candidate = JSON.parse(readFileSync(resolve(directory, "candidate.json"), "utf8")), manifestFile = resolve(directory, "manifest.json"), manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : null, project = manifest ? resolveBookProject(process.argv[3]) : null; if (project && project.id !== candidate.projectId) throw new Error("Release project does not match the stored candidate."); verifyReleaseDirectory(directory, candidate, { manifest, root: project?.legacyRoot }); console.log(`✓ Verified release directory ${directory}`); }
