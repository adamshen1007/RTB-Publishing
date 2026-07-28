import { materialHash } from "./common.mjs";
import { verifyCandidate } from "./candidate.mjs";
import { assertCurrentReleasePolicies } from "./policies.mjs";

export function createManifest(candidate, approval, { releasePolicies = null } = {}) {
  verifyCandidate(candidate);
  if (approval?.gate !== "publish" || approval?.decision !== "approved" || approval?.actor?.type !== "human" || approval?.explicitConfirmation !== true) throw new Error("A final manifest requires explicit human Publish approval.");
  if (approval.candidateHash !== candidate.candidateHash || approval.lifecycleVersion !== candidate.lifecycleVersion) throw new Error("Publish approval is stale or bound to another candidate.");
  const currentPolicies = assertCurrentReleasePolicies(candidate, releasePolicies);
  if (approval.releasePolicyHash !== currentPolicies.releasePolicyHash) throw new Error("Publish approval is not bound to the current exact release-policy result.");
  const releaseIdentity = materialHash({ candidateHash: candidate.candidateHash, approvalId: approval.id });
  const material = { schemaVersion: 1, releaseId: `REL-${releaseIdentity.slice(0, 20).toUpperCase()}`, projectId: candidate.projectId, candidateHash: candidate.candidateHash, lifecycleVersion: candidate.lifecycleVersion, sourceFingerprint: candidate.sourceFingerprint, artifacts: candidate.artifacts, validators: candidate.validators, approval: { id: approval.id, gate: "publish", decision: "approved", actor: approval.actor, candidateHash: approval.candidateHash, lifecycleVersion: approval.lifecycleVersion, explicitConfirmation: true, releasePolicyHash: currentPolicies.releasePolicyHash }, hostedState: { activated: false, subscriberDelivery: false, ghostPublication: false } };
  return { ...material, manifestHash: materialHash(material) };
}

export function verifyManifest(manifest, candidate, approval, options = {}) { const { manifestHash, ...material } = manifest; if (materialHash(material) !== manifestHash) throw new Error("Release manifest has drifted."); const expected = createManifest(candidate, approval, options); if (expected.manifestHash !== manifestHash) throw new Error("Release manifest does not reproduce from its candidate and approval."); return true; }
