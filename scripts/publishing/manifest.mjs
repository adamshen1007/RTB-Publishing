import { materialHash } from "./common.mjs";
import { verifyCandidate } from "./candidate.mjs";
export function createManifest(candidate, approval, { releasePolicies = null } = {}) {
  verifyCandidate(candidate);
  const eligible = candidate.policies?.releaseEligible === true
    || (releasePolicies?.releaseEligible === true && releasePolicies.candidateHash === candidate.candidateHash)
    || (approval?.releasePolicy?.releaseEligible === true && approval.releasePolicy.candidateHash === candidate.candidateHash);
  if (!eligible) throw new Error("The release candidate still has blocking manual reviews or policy findings.");
  if (approval?.gate !== "publish" || approval?.decision !== "approved" || approval?.actor?.type !== "human" || approval?.explicitConfirmation !== true) throw new Error("A final manifest requires explicit human Publish approval.");
  if (approval.candidateHash !== candidate.candidateHash || approval.lifecycleVersion !== candidate.lifecycleVersion) throw new Error("Publish approval is stale or bound to another candidate.");
  const releasePolicy = approval.releasePolicy ?? releasePolicies ?? { candidateHash: candidate.candidateHash, releaseEligible: candidate.policies.releaseEligible };
  if (releasePolicy.candidateHash !== candidate.candidateHash || releasePolicy.releaseEligible !== true) throw new Error("Publish approval has no exact eligible release-policy binding.");
  const releaseIdentity = materialHash({ candidateHash: candidate.candidateHash, approvalId: approval.id });
  const material = { schemaVersion: 1, releaseId: `REL-${releaseIdentity.slice(0, 20).toUpperCase()}`, projectId: candidate.projectId, candidateHash: candidate.candidateHash, lifecycleVersion: candidate.lifecycleVersion, sourceFingerprint: candidate.sourceFingerprint, artifacts: candidate.artifacts, validators: candidate.validators, approval: { id: approval.id, gate: "publish", decision: "approved", actor: approval.actor, candidateHash: approval.candidateHash, lifecycleVersion: approval.lifecycleVersion, explicitConfirmation: true, releasePolicy: { candidateHash: releasePolicy.candidateHash, releaseEligible: true } }, hostedState: { activated: false, subscriberDelivery: false, ghostPublication: false } };
  return { ...material, manifestHash: materialHash(material) };
}
export function verifyManifest(manifest, candidate, approval, options = {}) { const { manifestHash, ...material } = manifest; if (materialHash(material) !== manifestHash) throw new Error("Release manifest has drifted."); const expected = createManifest(candidate, approval, options); if (expected.manifestHash !== manifestHash) throw new Error("Release manifest does not reproduce from its candidate and approval."); return true; }
