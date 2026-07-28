import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fileHash, materialHash, stable } from "./common.mjs";
import { verifyCandidate } from "./candidate.mjs";
import { verifyManifestChecksum } from "./manifest.mjs";
import { resolveBookProject } from "../books/discovery.mjs";
import { durableCheckpoint, openStateDatabase } from "../state/database.mjs";
import { acquireProjectLockImmediate, acquireWorkspaceOutputLock, assertLiveProjectLock, assertLiveWorkspaceOutputLock } from "../state/project-lock.mjs";
import { RELEASE_REVIEW_KINDS } from "./release-review-store.mjs";
import { assertFutureExpiry } from "./approval-store.mjs";

const validTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const time = (value) => Date.parse(value);
function expiryAfter(value, boundary) { try { return assertFutureExpiry(value, time(boundary)); } catch { return false; } }
function reviewRecord(row) { return { schemaVersion: 1, id: row.id, projectId: row.project_id, kind: row.kind, decision: row.decision, candidateHash: row.candidate_hash, sourceFingerprint: row.source_fingerprint, artifactHashes: { html: row.html_sha256, pdf: row.pdf_sha256, epub: row.epub_sha256 }, reviewer: { type: "human", id: row.reviewer_id, ...(row.qualified_role ? { qualifiedRole: row.qualified_role } : {}) }, createdAt: row.created_at }; }
function historicalPolicy(database, candidate, candidateCreatedAt, approvalCreatedAt) {
  const rows = database.prepare("SELECT * FROM release_reviews WHERE project_id = ? AND candidate_hash = ? ORDER BY rowid DESC").all(candidate.projectId, candidate.candidateHash).filter((row) => validTime(row.created_at) && time(row.created_at) <= time(approvalCreatedAt)), latest = new Map();
  for (const row of rows) if (!latest.has(row.kind)) latest.set(row.kind, row);
  if (RELEASE_REVIEW_KINDS.some((kind) => latest.get(kind)?.decision !== "approved")) return null;
  const evidence = RELEASE_REVIEW_KINDS.map((kind) => reviewRecord(latest.get(kind)));
  const exact = evidence.every((record) => validTime(record.createdAt) && time(candidateCreatedAt) <= time(record.createdAt) && time(record.createdAt) <= time(approvalCreatedAt) && record.projectId === candidate.projectId && record.candidateHash === candidate.candidateHash && record.sourceFingerprint === candidate.sourceFingerprint && ["html", "pdf", "epub"].every((format) => record.artifactHashes[format] === candidate.artifacts[format].sha256) && record.reviewer.id.length >= 2) && evidence.find((record) => record.kind === "rights-and-brand-review")?.reviewer.qualifiedRole;
  return exact ? { hash: materialHash({ schemaVersion: 1, candidateHash: candidate.candidateHash, manualReviews: Object.fromEntries(RELEASE_REVIEW_KINDS.map((kind) => [kind, "approved"])), evidence }), evidence } : null;
}

function reconcileApprovalFacts(database, record, identity, approval, candidate, manifest) {
  if (!record) return record;
  const invalidation = approval && database.prepare("SELECT created_at FROM lifecycle_approval_invalidations WHERE approval_id = ?").get(approval.id);
  const candidateRow = database.prepare("SELECT * FROM release_candidates WHERE candidate_hash = ? AND project_id = ?").get(candidate.candidateHash, candidate.projectId), registeredCandidate = candidateRow && JSON.parse(candidateRow.candidate_json);
  const bindings = approval ? JSON.parse(approval.bindings_json) : null;
  const betaApproval = bindings?.beta && database.prepare("SELECT * FROM lifecycle_approvals WHERE project_id = ? AND gate = 'beta' AND decision = 'approved' AND explicit_confirmation = 1 AND actor_type = 'human' AND bindings_json = ? ORDER BY rowid DESC").all(candidate.projectId, JSON.stringify(bindings.beta)).find((row) => validTime(row.created_at) && time(row.created_at) <= time(approval?.created_at));
  const betaInvalidation = betaApproval && database.prepare("SELECT created_at FROM lifecycle_approval_invalidations WHERE approval_id = ?").get(betaApproval.id);
  const betaMaterial = bindings?.beta && database.prepare("SELECT * FROM lifecycle_material_bindings WHERE project_id = ? AND kind = 'beta' AND bindings_json = ? ORDER BY rowid DESC").all(candidate.projectId, JSON.stringify(bindings.beta)).find((row) => validTime(row.created_at) && time(row.created_at) <= time(approval?.created_at));
  const policy = candidateRow && approval ? historicalPolicy(database, candidate, candidateRow.created_at, approval.created_at) : null;
  const exactIdentity = identity && identity.release_id === manifest.releaseId && identity.project_id === candidate.projectId && identity.candidate_hash === candidate.candidateHash && identity.approval_id === approval?.id && identity.status === "completed" && validTime(identity.created_at);
  const exactCandidate = registeredCandidate && candidateRow.project_id === candidate.projectId && candidateRow.candidate_hash === candidate.candidateHash && candidateRow.lifecycle_version === candidate.lifecycleVersion && validTime(candidateRow.created_at) && stable(registeredCandidate) === stable(candidate) && registeredCandidate.projectId === candidate.projectId && registeredCandidate.candidateHash === candidate.candidateHash && registeredCandidate.lifecycleVersion === candidate.lifecycleVersion && registeredCandidate.sourceFingerprint === candidate.sourceFingerprint && stable(registeredCandidate.artifacts) === stable(candidate.artifacts);
  const exactApproval = approval?.actor_type === "human" && approval.actor_id && approval.explicit_confirmation === 1 && approval.gate === "publish" && approval.decision === "approved" && validTime(approval.created_at) && expiryAfter(approval.expires_at, record.completed_at) && approval.lifecycle_version === candidate.lifecycleVersion + 1 && bindings?.releaseCandidateHash === candidate.candidateHash && bindings?.candidateLifecycleVersion === candidate.lifecycleVersion && bindings?.blockingFindings === 0 && bindings?.releasePolicyHash === policy?.hash && manifest.approval?.releasePolicyHash === policy?.hash;
  const exactBeta = betaApproval && betaMaterial && betaApproval.lifecycle_version === candidate.lifecycleVersion && validTime(betaApproval.created_at) && validTime(betaMaterial.created_at) && expiryAfter(betaApproval.expires_at, record.completed_at) && (!betaInvalidation || validTime(betaInvalidation.created_at) && time(betaInvalidation.created_at) > time(record.completed_at)) && /^[a-f0-9]{64}$/.test(bindings.beta.betaSnapshotHash ?? "") && /^[a-f0-9]{64}$/.test(bindings.beta.policyResultsHash ?? "");
  const exactManifest = manifest.projectId === candidate.projectId && manifest.candidateHash === candidate.candidateHash && manifest.lifecycleVersion === candidate.lifecycleVersion && manifest.sourceFingerprint === candidate.sourceFingerprint && stable(manifest.artifacts) === stable(candidate.artifacts) && stable(manifest.validators) === stable(candidate.validators);
  const exactRecord = record.status === "completed" && validTime(record.created_at) && validTime(record.completed_at) && record.project_id === candidate.projectId && record.candidate_hash === candidate.candidateHash && record.approval_id === approval?.id && record.release_id === manifest.releaseId && record.manifest_hash === manifest.manifestHash && record.manifest_json === JSON.stringify(manifest);
  const chronology = exactIdentity && exactCandidate && exactBeta && exactApproval && time(betaMaterial.created_at) <= time(betaApproval.created_at) && time(betaApproval.created_at) <= time(candidateRow.created_at) && policy.evidence.every((review) => time(candidateRow.created_at) <= time(review.createdAt) && time(review.createdAt) <= time(approval.created_at)) && time(approval.created_at) <= time(identity.created_at) && time(identity.created_at) <= time(record.created_at) && time(record.created_at) <= time(record.completed_at);
  const invalidationsAfterCompletion = (!invalidation || validTime(invalidation.created_at) && time(invalidation.created_at) > time(record.completed_at)) && (!betaInvalidation || validTime(betaInvalidation.created_at) && time(betaInvalidation.created_at) > time(record.completed_at));
  const exactStoredApproval = record.completed_while_current === 0 || record.approval_actor_type === approval?.actor_type && record.approval_actor_id === approval?.actor_id && record.approval_created_at === approval?.created_at && record.approval_lifecycle_version === approval?.lifecycle_version && record.approval_bindings_json === approval?.bindings_json;
  const exactManifestApproval = manifest.approval?.id === approval?.id && manifest.approval.candidateHash === candidate.candidateHash && manifest.approval.actor?.type === approval?.actor_type && manifest.approval.actor?.id === approval?.actor_id && manifest.approval.lifecycleVersion === candidate.lifecycleVersion;
  const provable = exactRecord && exactIdentity && exactCandidate && exactApproval && exactBeta && exactManifest && chronology && invalidationsAfterCompletion && exactStoredApproval && exactManifestApproval;
  if (!provable) {
    if (record.completed_while_current === 0) throw new Error("Completed release requires approval-facts reconciliation; existing evidence cannot prove that the exact Publish approval was current at completion.");
    throw new Error("Release verification requires exact completed finalization, identity, candidate, approval, Beta, review, manifest, and timestamp authority.");
  }
  if (record.completed_while_current === 1) return record;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("UPDATE release_finalizations SET approval_actor_type = ?, approval_actor_id = ?, approval_created_at = ?, approval_lifecycle_version = ?, approval_bindings_json = ?, completed_while_current = 1 WHERE release_id = ? AND status = 'completed' AND completed_while_current = 0").run(approval.actor_type, approval.actor_id, approval.created_at, approval.lifecycle_version, approval.bindings_json, record.release_id);
    database.exec("COMMIT"); durableCheckpoint(database);
  } catch (error) { if (database.inTransaction) database.exec("ROLLBACK"); throw error; }
  return database.prepare("SELECT * FROM release_finalizations WHERE release_id = ?").get(record.release_id);
}
function inside(root, path) { const value = relative(resolve(root), resolve(path)); return value !== ".." && !value.startsWith(`..${sep}`); }
function assertSafeTree(directory) {
  const rootStat = lstatSync(directory);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error("Release directory must be a real directory, not a symbolic link.");
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name), stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Release material cannot contain symbolic links: ${entry.name}`);
    if (stat.isDirectory()) assertSafeTree(path);
    else if (!stat.isFile() || stat.nlink !== 1) throw new Error(`Release material must contain private regular files with one link only: ${entry.name}`);
  }
}
function assertImmutableLocation(directory, candidate, manifest, immutableRoot) {
  if (!manifest || !immutableRoot) return;
  const trustedRoot = resolve(immutableRoot), expected = resolve(trustedRoot, candidate.projectId, manifest.releaseId), actual = resolve(directory);
  if (actual !== expected || !inside(trustedRoot, actual)) throw new Error("Approved release verification requires its exact derived immutable project/release directory.");
  const realRoot = realpathSync(trustedRoot), realDirectory = realpathSync(actual);
  if (realDirectory !== resolve(realRoot, candidate.projectId, manifest.releaseId) || !inside(realRoot, realDirectory)) throw new Error("Immutable release path escapes its trusted real output root.");
}
export function verifyReleaseDirectoryMaterial(directory, candidate, { manifest, immutableRoot } = {}) {
  assertImmutableLocation(directory, candidate, manifest, immutableRoot); assertSafeTree(directory);
  verifyCandidate(candidate); const expected = new Set(Object.values(candidate.artifacts).map((item) => item.path).concat(["candidate.json", "verification.json", candidate.snapshot.bundle.path])); if (manifest) expected.add("manifest.json");
  const actual = new Set(readdirSync(directory).filter((name) => !name.startsWith("."))); const extras = [...actual].filter((name) => !expected.has(name)), missing = [...expected].filter((name) => !actual.has(name)); if (extras.length || missing.length) throw new Error(`Release directory drift: extra=${extras.join(",")} missing=${missing.join(",")}`);
  for (const artifact of Object.values(candidate.artifacts)) { const file = resolve(directory, artifact.path); if (!existsSync(file) || fileHash(file) !== artifact.sha256) throw new Error(`Release artifact drift: ${basename(file)}`); }
  for (const record of candidate.snapshot.bundle.files) { const file = resolve(directory, candidate.snapshot.bundle.path, record.path); if (!existsSync(file) || fileHash(file) !== record.sha256) throw new Error(`Retained source snapshot drift: ${record.path}`); }
  const storedCandidate = JSON.parse(readFileSync(resolve(directory, "candidate.json"), "utf8")); if (stable(storedCandidate) !== stable(candidate)) throw new Error("Stored candidate.json does not match the verified candidate.");
  const verification = JSON.parse(readFileSync(resolve(directory, "verification.json"), "utf8")); if (verification.sourceFingerprint !== candidate.sourceFingerprint || verification.status !== candidate.validators.status || stable(verification.artifacts) !== stable(candidate.artifacts) || stable(verification.semanticParity) !== stable(candidate.validators.semanticParity) || stable(verification.html) !== stable(candidate.validators.html) || stable(verification.epub) !== stable(candidate.validators.epub) || stable(verification.pdf) !== stable(candidate.validators.pdf)) throw new Error("Stored verification.json does not reproduce the candidate validator material.");
  if (manifest) { const storedManifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8")); if (stable(storedManifest) !== stable(manifest)) throw new Error("Stored manifest does not match the verified manifest material."); verifyManifestChecksum(manifest); if (manifest.candidateHash !== candidate.candidateHash || stable(manifest.artifacts) !== stable(candidate.artifacts) || stable(manifest.validators) !== stable(candidate.validators)) throw new Error("Manifest does not preserve the exact candidate material."); } return true;
}
export function verifyReleaseDirectory(directory, candidate, { manifest, root, heldLock = null, immutableRoot, workspaceRoot, heldWorkspaceLock = null } = {}) {
  verifyReleaseDirectoryMaterial(directory, candidate, { manifest, immutableRoot });
  if (!manifest) return true;
  if (!root) throw new Error("Manifest verification requires the explicit project state root.");
  if (workspaceRoot || heldWorkspaceLock) { if (!workspaceRoot || !heldWorkspaceLock) throw new Error("Workspace verification authority must include both root and live lock."); assertLiveWorkspaceOutputLock(heldWorkspaceLock, workspaceRoot); }
  if (heldLock) assertLiveProjectLock(heldLock, root);
  const lock = heldLock ?? acquireProjectLockImmediate(root, { ownerId: `release-verification-${process.pid}` });
  let database;
  try {
    database = openStateDatabase(resolve(root, ".rtb-state", "state.sqlite"));
    let record = database.prepare("SELECT * FROM release_finalizations WHERE release_id = ? AND project_id = ? AND candidate_hash = ? AND approval_id = ? AND status = 'completed'").get(manifest.releaseId, candidate.projectId, candidate.candidateHash, manifest.approval?.id);
    const identity = database.prepare("SELECT * FROM release_identities WHERE release_id = ? AND project_id = ? AND candidate_hash = ? AND approval_id = ? AND status = 'completed'").get(manifest.releaseId, candidate.projectId, candidate.candidateHash, manifest.approval?.id);
    const approval = database.prepare("SELECT * FROM lifecycle_approvals WHERE id = ? AND project_id = ? AND gate = 'publish' AND decision = 'approved' AND explicit_confirmation = 1").get(manifest.approval?.id, candidate.projectId);
    record = reconcileApprovalFacts(database, record, identity, approval, candidate, manifest);
    const recordExact = record?.project_id === candidate.projectId && record.candidate_hash === candidate.candidateHash && record.manifest_hash === manifest.manifestHash;
    const historicalApproval = approval && recordExact && record?.completed_while_current === 1 && record.approval_actor_type === approval.actor_type && record.approval_actor_id === approval.actor_id && record.approval_created_at === approval.created_at && record.approval_lifecycle_version === approval.lifecycle_version && record.approval_bindings_json === approval.bindings_json && record.completed_at >= approval.created_at;
    if (!record || record.manifest_json !== JSON.stringify(manifest) || !identity || !historicalApproval) throw new Error("Release verification requires the exact completed durable finalization, identity, and completion-time ledger Publish approval facts.");
    return true;
  } finally { database?.close(); if (!heldLock) lock.release(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { const args = process.argv.slice(2); if (args[0] === "--") args.shift(); if (!args[0] || !args[1] || !args[2] || args[3]) throw new Error("Usage: pnpm release:verify -- <workspace-root> <book-project-path> <release-id>"); const [workspaceArgument, projectArgument, releaseId] = args, workspaceRoot = resolve(workspaceArgument), project = resolveBookProject(projectArgument, { workspaceRoot }), immutableRoot = resolve(workspaceRoot, "dist", "releases", "immutable"), directory = resolve(immutableRoot, project.id, releaseId), workspaceLock = await acquireWorkspaceOutputLock(workspaceRoot, { ownerId: `release-verification-output-${process.pid}` }); try { const candidate = JSON.parse(readFileSync(resolve(directory, "candidate.json"), "utf8")), manifestFile = resolve(directory, "manifest.json"), manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : null; if (!manifest) throw new Error("The derived immutable release directory must contain manifest.json."); if (manifest.releaseId !== releaseId || project.id !== candidate.projectId) throw new Error("Release identity does not match the requested project and release ID."); verifyReleaseDirectory(directory, candidate, { manifest, root: project.legacyRoot, immutableRoot, workspaceRoot, heldWorkspaceLock: workspaceLock }); console.log(`✓ Verified immutable release ${directory}`); } finally { workspaceLock.release(); } }
