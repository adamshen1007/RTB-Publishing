import { materialHash } from "./common.mjs";
export function createCandidate({ projectId, lifecycleVersion, sourceFingerprint, snapshot, verification, policies = {} }) {
  if (!/^[a-f0-9]{40}$/.test(snapshot?.repository?.revision ?? "") || !/^[a-f0-9]{40}$/.test(snapshot?.repository?.tree ?? "") || snapshot?.bundle?.path !== "source-snapshot" || !Array.isArray(snapshot?.bundle?.files) || snapshot.bundle.files.length === 0) throw new Error("A release candidate requires a retrievable Git revision and retained normalized source snapshot.");
  const material = { schemaVersion: 1, projectId, lifecycleVersion, sourceFingerprint, snapshot, artifacts: verification.artifacts, validators: { status: verification.status, semanticParity: verification.semanticParity, html: verification.html, epub: verification.epub, pdf: verification.pdf }, policies, futureStaging: null };
  const candidateHash = materialHash(material); material.futureStaging = { reference: `future-staging://${projectId}/${candidateHash.slice(0, 16)}`, authority: "none", reserved: false, activated: false };
  return { ...material, candidateHash: materialHash(material) };
}
export function verifyCandidate(candidate) { const { candidateHash, ...material } = candidate; if (!/^[a-f0-9]{40}$/.test(candidate.snapshot?.repository?.revision ?? "") || candidate.snapshot?.bundle?.path !== "source-snapshot" || !Array.isArray(candidate.snapshot?.bundle?.files) || materialHash(material) !== candidateHash) throw new Error("Release candidate hash or retained source identity does not match its material fields."); return true; }
