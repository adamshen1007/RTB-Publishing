import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { verifyCandidate } from "./candidate.mjs";
import { sha256 } from "./common.mjs";
import { RELEASE_REVIEW_KINDS, ReleaseReviewStore } from "./release-review-store.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const AUTHORITATIVE_FIELDS = ["actor", "reviewer", "projectId", "candidate", "candidateHash", "sourceFingerprint", "artifactHashes", "lifecycleVersion"];

function resolvedArtifactHashes(candidate) {
  const hashes = {};
  for (const kind of ["html", "pdf", "epub"]) {
    const value = candidate.artifacts?.[kind]?.sha256;
    if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`The registered candidate has no verified ${kind.toUpperCase()} artifact hash.`);
    hashes[kind] = value;
  }
  return hashes;
}

export class ReleaseReviewService {
  constructor({ root, projectId, actorResolver, databaseFile, now = () => Date.now() } = {}) {
    if (!root && !databaseFile) throw new Error("A release review service requires durable local state.");
    if (typeof projectId !== "string" || projectId.length < 1) throw new Error("A release review service requires a project identity.");
    if (typeof actorResolver !== "function") throw new Error("A release review service requires a server-side actor resolver.");
    this.projectId = projectId;
    this.actorResolver = actorResolver;
    this.now = now;
    this.store = new ReleaseReviewStore({ root, ...(databaseFile ? { databaseFile } : {}) });
  }

  currentCandidate() { return this.store.currentCandidate(this.projectId); }

  status() {
    const candidate = this.currentCandidate();
    if (!candidate) return {
      state: "blocked",
      message: "Release reviews are blocked until a verified HTML, PDF, and EPUB release candidate is registered.",
      candidateHash: null,
      reviews: Object.fromEntries(RELEASE_REVIEW_KINDS.map((kind) => [kind, { decision: "pending", message: "Build and register the release candidate before reviewing it." }])),
    };
    verifyCandidate(candidate);
    const latest = this.store.latestForCandidate(this.projectId, candidate.candidateHash);
    const reviews = Object.fromEntries(RELEASE_REVIEW_KINDS.map((kind) => {
      const record = latest[kind];
      return [kind, record ? { decision: record.decision, reviewer: record.reviewer, createdAt: record.createdAt, message: record.decision === "approved" ? "Durable approval recorded for the current exact candidate." : "The current exact candidate was rejected; resolve the finding, rebuild, and review the new candidate." } : { decision: "pending", message: "No durable decision has been recorded for the current exact candidate." }];
    }));
    return { state: Object.values(reviews).every((review) => review.decision === "approved") ? "approved" : "review_required", message: "Review decisions below are durable and bound to the latest registered candidate.", candidateHash: candidate.candidateHash, candidateIdentity: candidate.candidateHash.slice(0, 16), reviews };
  }

  record(input = {}, { expectedCandidateHash } = {}) {
    for (const field of AUTHORITATIVE_FIELDS) if (Object.hasOwn(input, field)) throw new Error(`Release review requests cannot author ${field}; it is resolved by the server.`);
    const supplied = Object.keys(input);
    if (supplied.some((field) => !["kind", "decision", "qualifiedRole"].includes(field))) throw new Error("Release review requests contain an unsupported field.");
    if (!RELEASE_REVIEW_KINDS.includes(input.kind)) throw new Error("Release review kind is not supported.");
    if (!["approved", "rejected"].includes(input.decision)) throw new Error("Release review decision must be approved or rejected.");

    const actor = this.actorResolver();
    if (actor?.type !== "human" || typeof actor.id !== "string" || actor.id.trim().length < 2) throw new Error("Release review evidence requires a server-resolved human actor.");
    const qualifiedRole = typeof input.qualifiedRole === "string" ? input.qualifiedRole.trim() : "";
    if (input.kind === "rights-and-brand-review" && input.decision === "approved" && !qualifiedRole) throw new Error("Rights review approval requires a declared, non-empty qualified reviewer role.");
    if (qualifiedRole.length > 200) throw new Error("Qualified reviewer role is too long.");

    const candidate = this.store.currentCandidate(this.projectId);
    if (!candidate) throw new Error("Release review is unavailable until a verified release candidate is registered.");
    if (expectedCandidateHash && candidate.candidateHash !== expectedCandidateHash) {
      const error = new Error("The release candidate changed after it was displayed. Review the new exact candidate before recording a decision.");
      error.code = "STALE_REVIEW_INTENT";
      throw error;
    }
    verifyCandidate(candidate);
    if (candidate.projectId !== this.projectId || typeof candidate.sourceFingerprint !== "string" || !SHA256.test(candidate.sourceFingerprint)) throw new Error("The registered release candidate has an invalid project or source binding.");
    const artifactHashes = resolvedArtifactHashes(candidate);
    const createdAt = new Date(this.now()).toISOString();
    const idMaterial = `${this.projectId}\0${input.kind}\0${candidate.candidateHash}\0${actor.id}\0${createdAt}\0${randomUUID()}`;
    const record = {
      schemaVersion: 1,
      id: `REV-${sha256(idMaterial).slice(0, 24).toUpperCase()}`,
      projectId: this.projectId,
      kind: input.kind,
      decision: input.decision,
      candidateHash: candidate.candidateHash,
      sourceFingerprint: candidate.sourceFingerprint,
      artifactHashes,
      reviewer: { type: "human", id: actor.id.trim(), ...(qualifiedRole ? { qualifiedRole } : {}) },
      createdAt,
    };
    try { return this.store.append(record); }
    catch (error) {
      if (expectedCandidateHash && /current registered candidate changed/.test(error.message)) error.code = "STALE_REVIEW_INTENT";
      throw error;
    }
  }
}
