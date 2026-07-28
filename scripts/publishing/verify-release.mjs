import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileHash, stable } from "./common.mjs";
import { verifyCandidate } from "./candidate.mjs";
import { verifyManifestChecksum } from "./manifest.mjs";
import { resolveBookProject } from "../books/discovery.mjs";
import { openStateDatabase } from "../state/database.mjs";
export function verifyReleaseDirectoryMaterial(directory, candidate, { manifest } = {}) {
  verifyCandidate(candidate); const expected = new Set(Object.values(candidate.artifacts).map((item) => item.path).concat(["candidate.json", "verification.json", candidate.snapshot.bundle.path])); if (manifest) expected.add("manifest.json");
  const actual = new Set(readdirSync(directory).filter((name) => !name.startsWith("."))); const extras = [...actual].filter((name) => !expected.has(name)), missing = [...expected].filter((name) => !actual.has(name)); if (extras.length || missing.length) throw new Error(`Release directory drift: extra=${extras.join(",")} missing=${missing.join(",")}`);
  for (const artifact of Object.values(candidate.artifacts)) { const file = resolve(directory, artifact.path); if (!existsSync(file) || fileHash(file) !== artifact.sha256) throw new Error(`Release artifact drift: ${basename(file)}`); }
  for (const record of candidate.snapshot.bundle.files) { const file = resolve(directory, candidate.snapshot.bundle.path, record.path); if (!existsSync(file) || fileHash(file) !== record.sha256) throw new Error(`Retained source snapshot drift: ${record.path}`); }
  const storedCandidate = JSON.parse(readFileSync(resolve(directory, "candidate.json"), "utf8")); if (stable(storedCandidate) !== stable(candidate)) throw new Error("Stored candidate.json does not match the verified candidate.");
  const verification = JSON.parse(readFileSync(resolve(directory, "verification.json"), "utf8")); if (verification.sourceFingerprint !== candidate.sourceFingerprint || verification.status !== candidate.validators.status || stable(verification.artifacts) !== stable(candidate.artifacts) || stable(verification.semanticParity) !== stable(candidate.validators.semanticParity) || stable(verification.html) !== stable(candidate.validators.html) || stable(verification.epub) !== stable(candidate.validators.epub) || stable(verification.pdf) !== stable(candidate.validators.pdf)) throw new Error("Stored verification.json does not reproduce the candidate validator material.");
  if (manifest) { const storedManifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8")); if (stable(storedManifest) !== stable(manifest)) throw new Error("Stored manifest does not match the verified manifest material."); verifyManifestChecksum(manifest); if (manifest.candidateHash !== candidate.candidateHash || stable(manifest.artifacts) !== stable(candidate.artifacts) || stable(manifest.validators) !== stable(candidate.validators)) throw new Error("Manifest does not preserve the exact candidate material."); } return true;
}
export function verifyReleaseDirectory(directory, candidate, { manifest, root } = {}) {
  verifyReleaseDirectoryMaterial(directory, candidate, { manifest });
  if (!manifest) return true;
  if (!root) throw new Error("Manifest verification requires the explicit project state root.");
  const database = openStateDatabase(resolve(root, ".rtb-state", "state.sqlite"));
  try {
    const record = database.prepare("SELECT * FROM release_finalizations WHERE release_id = ? AND project_id = ? AND candidate_hash = ? AND manifest_hash = ? AND status = 'completed'").get(manifest.releaseId, candidate.projectId, candidate.candidateHash, manifest.manifestHash);
    const identity = database.prepare("SELECT * FROM release_identities WHERE release_id = ? AND approval_id = ? AND status = 'completed'").get(manifest.releaseId, manifest.approval?.id);
    const approval = database.prepare("SELECT * FROM lifecycle_approvals WHERE id = ? AND project_id = ? AND gate = 'publish' AND decision = 'approved' AND explicit_confirmation = 1").get(manifest.approval?.id, candidate.projectId);
    const historicalApproval = approval && record?.completed_while_current === 1 && record.approval_actor_type === approval.actor_type && record.approval_actor_id === approval.actor_id && record.approval_created_at === approval.created_at && record.approval_lifecycle_version === approval.lifecycle_version && record.approval_bindings_json === approval.bindings_json && record.completed_at >= approval.created_at;
    if (!record || record.manifest_json !== JSON.stringify(manifest) || !identity || !historicalApproval) throw new Error("Release verification requires the exact completed durable finalization, identity, and completion-time ledger Publish approval facts.");
    return true;
  } finally { database.close(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { const directory = resolve(process.argv[2] ?? "dist/releases/rtb-yc-playbook"), candidate = JSON.parse(readFileSync(resolve(directory, "candidate.json"), "utf8")), manifestFile = resolve(directory, "manifest.json"), manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : null, project = manifest ? resolveBookProject(process.argv[3]) : null; if (project && project.id !== candidate.projectId) throw new Error("Release project does not match the stored candidate."); verifyReleaseDirectory(directory, candidate, { manifest, root: project?.legacyRoot }); console.log(`✓ Verified release directory ${directory}`); }
