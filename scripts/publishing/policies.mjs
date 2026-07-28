import { RELEASE_REVIEW_KINDS, ReleaseReviewStore } from "./release-review-store.mjs";

const artifactHashesOf = (candidate) => Object.fromEntries(["html", "pdf", "epub"].map((format) => [format, candidate.artifacts?.[format]?.sha256]));

function result(manualReviews, candidateHash = null) {
  const releaseEligible = RELEASE_REVIEW_KINDS.every((kind) => manualReviews[kind] === "approved");
  return {
    citations: "validated-by-book-contract",
    rights: manualReviews["rights-and-brand-review"],
    sourceIntegrity: "passed",
    automatedVisualProfile: "compatibility-fixture-passed",
    manualReviews,
    releaseEligible,
    ...(candidateHash ? { candidateHash } : {}),
  };
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
    if (kind === "rights-and-brand-review" && record.decision === "approved" && !(record.reviewer.qualifiedRole?.trim())) throw new Error("Rights review approval requires a truthful, non-empty qualified reviewer role.");
    manualReviews[kind] = record.decision === "approved" ? "approved" : "rejected";
  }
  return result(manualReviews, registered.candidateHash);
}
