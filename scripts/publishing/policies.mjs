import { RELEASE_REVIEW_KINDS, ReleaseReviewStore } from "./release-review-store.mjs";
import { materialHash } from "./common.mjs";

const artifactHashesOf = (candidate) => Object.fromEntries(["html", "pdf", "epub"].map((format) => [format, candidate.artifacts?.[format]?.sha256]));
const livePolicyEvaluations = new WeakMap();

function result(manualReviews, candidateHash = null, evidence = {}) {
  const releaseEligible = RELEASE_REVIEW_KINDS.every((kind) => manualReviews[kind] === "approved");
  const value = {
    citations: "validated-by-book-contract",
    rights: manualReviews["rights-and-brand-review"],
    sourceIntegrity: "passed",
    automatedVisualProfile: "compatibility-fixture-passed",
    manualReviews,
    releaseEligible,
    ...(candidateHash ? { candidateHash } : {}),
  };
  if (candidateHash) value.releasePolicyHash = materialHash({ schemaVersion: 1, candidateHash, manualReviews, evidence: RELEASE_REVIEW_KINDS.map((kind) => evidence[kind] ?? null) });
  return value;
}

/** Candidate material stays deterministic while human review evidence is pending. */
export function pendingReleasePolicies() {
  return result(Object.fromEntries(RELEASE_REVIEW_KINDS.map((kind) => [kind, "awaiting-named-reviewer"])));
}

/** Resolve current human policy evidence from durable local state for one exact registered candidate. */
export function evaluateReleasePolicies(project, candidate, { databaseFile } = {}) {
  const candidateHash = typeof candidate === "string" ? candidate : candidate?.candidateHash;
  if (typeof candidateHash !== "string") throw new Error("Release policy evaluation requires an exact registered candidate hash.");
  const root = project.legacyRoot ?? project.root;
  const store = new ReleaseReviewStore({ root, ...(databaseFile ? { databaseFile } : {}) });
  const registered = store.registeredCandidate(project.id, candidateHash);
  if (!registered) throw new Error("Release policy evaluation requires an exact registered candidate.");

  const expectedHashes = artifactHashesOf(registered);
  const evidence = store.latestForCandidate(project.id, candidateHash);
  const manualReviews = {};
  for (const kind of RELEASE_REVIEW_KINDS) {
    const record = evidence[kind];
    if (!record) {
      manualReviews[kind] = "awaiting-named-reviewer";
      continue;
    }
    const exact = record.schemaVersion === 1
      && record.projectId === project.id
      && record.kind === kind
      && record.candidateHash === registered.candidateHash
      && record.sourceFingerprint === registered.sourceFingerprint
      && ["html", "pdf", "epub"].every((format) => record.artifactHashes?.[format] === expectedHashes[format])
      && record.reviewer?.type === "human"
      && typeof record.reviewer.id === "string"
      && record.reviewer.id.trim().length >= 2;
    if (!exact) throw new Error(`Release review evidence is corrupt or not bound to the exact registered candidate: ${kind}`);
    if (kind === "rights-and-brand-review" && record.decision === "approved" && !(record.reviewer.qualifiedRole?.trim())) throw new Error("Rights review approval requires a declared, non-empty qualified reviewer role.");
    manualReviews[kind] = record.decision === "approved" ? "approved" : "rejected";
  }
  const value = result(manualReviews, registered.candidateHash, evidence);
  livePolicyEvaluations.set(value, { project: { id: project.id, root: project.root, legacyRoot: project.legacyRoot }, candidateHash: registered.candidateHash, databaseFile });
  return value;
}

/** Accept only a live store-backed evaluation and re-read durable evidence at the manifest boundary. */
export function assertCurrentReleasePolicies(candidate, evaluation) {
  const authority = evaluation && livePolicyEvaluations.get(evaluation);
  if (!authority || evaluation.candidateHash !== candidate.candidateHash) throw new Error("Manifest creation requires an explicit, durable exact release-policy evaluation.");
  const fresh = evaluateReleasePolicies(authority.project, authority.candidateHash, authority.databaseFile ? { databaseFile: authority.databaseFile } : {});
  if (fresh.releasePolicyHash !== evaluation.releasePolicyHash) throw new Error("Release policy evidence changed after evaluation; evaluate the current exact candidate again.");
  if (fresh.releaseEligible !== true) throw new Error("The current release policy has blocking manual reviews or findings.");
  return fresh;
}
